// packages/client/src/core/geometry/plaza.test.ts
// ============================================
// 🏛️ ТЕСТЫ ПЛОЩАДЕЙ НА ПЕРЕКРЁСТКАХ
// ============================================
// Три дефекта, которые здесь закрыты:
//   1) сквозной край у изогнутых шумом противоположных дорог принимался за внутренний угол и
//      скруглялся: скругление срезало хорду внутри полосы, и от дороги оставались оторванные кусочки;
//   2) глубина среза не зависела от ширины дороги: у широкой дороги пересечение краёв оказывалось
//      за срезом, и контур площади самопересекался;
//   3) контур площади нигде не проверялся;
//   4) дороги вычитались из площади булевой операцией: контур площади дробился, и вершины
//      на общих с дорогой рёбрах после округления координат уходили с линии края — вдоль
//      перекрёстка оставались осколки дороги. Теперь дорога обрывается на ребре среза
//      (PlazaCut) и вычитание не нужно.
// ============================================
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import { GEOMETRY_PARAMS } from './loadedGeometryParams';
import { auditTile, type AuditTile } from './geometryAudit';
import { generatePlazas, generateJunctions } from './generators/plaza';
import { ringsOverlap } from './ringOverlap';
import type { AreaGeometry } from '@fiefdom/shared/core/geometry.types';
import type { TessellatedLine } from './tessellate';

const tiles = (baseData as unknown as { tiles: AuditTile[] }).tiles;
const tileById = (id: string): AuditTile => tiles.find((t) => t.id === id)!;

/** Тайлы с перекрёстком: три и более дороги сходятся в центре */
const JUNCTIONS = ['tile_CRRR', 'tile_FRRR', 'tile_RRRR'];

type Pt = [number, number];

// --------------------------------------------
// Вспомогательное
// --------------------------------------------

/**
 * Дорога от края тайла к центру (0,0) — так их отдаёт пайплайн. Ось сносит вбок на k·s²
 * (s — расстояние до центра, не дальше 20), как это делает шум; края — ось ± halfWidth по
 * БАЗОВОЙ нормали: `left` = +90° от направления движения. У центра снос и его наклон равны нулю.
 */
function arm(from: Pt, k: number, halfWidth: number): TessellatedLine {
    const length = Math.hypot(from[0], from[1]);
    const t: Pt = [-from[0] / length, -from[1] / length];
    const n: Pt = [-t[1], t[0]];
    const center: Pt[] = [];
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (const s of [50, 40, 30, 22, 16, 12, 8, 5, 3, 1.5, 0]) {
        const d = k * Math.min(s, 20) ** 2;
        const c: Pt = [(from[0] * s) / length + n[0] * d, (from[1] * s) / length + n[1] * d];
        center.push(c);
        left.push([c[0] + n[0] * halfWidth, c[1] + n[1] * halfWidth]);
        right.push([c[0] - n[0] * halfWidth, c[1] - n[1] * halfWidth]);
    }
    return { center, left, right, halfWidth };
}

/** Число самопересечений замкнутого контура (касания и общие вершины не считаются) */
function selfIntersections(ring: readonly Pt[]): number {
    const orient = (a: Pt, b: Pt, c: Pt): number => {
        const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        return Math.abs(v) < 1e-9 ? 0 : v;
    };
    let count = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            const c = ring[j];
            const d = ring[(j + 1) % n];
            if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) count++;
        }
    }
    return count;
}

const ringArea = (ring: readonly Pt[]): number => {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) / 2;
};

// Сиды 10 и 20 на ширине 24 раньше давали самопересечение площади
/** Вершины контура площади (кривые — только конечные точки) */
const outlinePoints = (geometry: AreaGeometry): Pt[] => [
    geometry.start as Pt,
    ...geometry.outline.flatMap((segment) => ('to' in segment ? [segment.to as Pt] : [])),
];

const samePoint = (a: Pt, b: Pt): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;

/** Та же дорога, но ось идёт от перекрёстка наружу (начало оси — в центре) */
const reversedLine = (line: TessellatedLine): TessellatedLine => ({
    ...line,
    center: [...line.center].reverse(),
    // При обратном обходе «слева» оказывается бывший правый край
    left: [...line.right].reverse(),
    right: [...line.left].reverse(),
});

const distanceToSegment = (p: Pt, a: Pt, b: Pt): number => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

const SEEDS = Array.from({ length: 30 }, (_, i) => String(i + 1));

describe('площадь на перекрёстке', () => {
    // Т-образный стык: дороги E и W изогнуты от ножки S так, что угол между их осями у центра
    // (около 157°) не проходит порог «противоположных», хотя торцы по-прежнему общие
    it('сквозной край изогнутых дорог не скругляется: только два внутренних угла у ножки', () => {
        const lines = new Map<string, TessellatedLine>([
            ['road_e', arm([50, 0], -0.033, 6)],
            ['road_w', arm([-50, 0], 0.033, 6)],
            ['road_s', arm([0, -50], 0, 6)],
        ]);
        const plazas = generatePlazas(lines, GEOMETRY_PARAMS.plaza);
        expect(plazas).toHaveLength(1);
        const curves = plazas[0].outline.filter((segment) => segment.type === 'quadratic');
        expect(curves).toHaveLength(2);
    });

    it('срез дороги уходит за внутренний угол, даже если дорога широкая', () => {
        // Полуширина 20 больше depth (14): пересечение краёв лежит за исходным срезом
        const lines = new Map<string, TessellatedLine>([
            ['road_e', arm([50, 0], 0, 20)],
            ['road_w', arm([-50, 0], 0, 20)],
            ['road_s', arm([0, -50], 0, 20)],
        ]);
        const plazas = generatePlazas(lines, { ...GEOMETRY_PARAMS.plaza, depth: 14 });
        expect(plazas).toHaveLength(1);
        const ring = plazas[0].outline.flatMap((segment) => ('to' in segment ? [segment.to as Pt] : []));
        expect(selfIntersections([plazas[0].start as Pt, ...ring])).toBe(0);
        // Срез ножки лежит дальше полуширины и скругления: 20 + 6
        const farthest = Math.max(...ring.map(([, y]) => Math.abs(y)));
        expect(farthest).toBeGreaterThan(20 + GEOMETRY_PARAMS.plaza.cornerRadius);
    });

    describe('срезы дорог', () => {
        const tJunction = (reverseEast: boolean) => {
            const east = arm([50, 0], -0.033, 6);
            return new Map<string, TessellatedLine>([
                ['road_e', reverseEast ? reversedLine(east) : east],
                ['road_w', arm([-50, 0], 0.033, 6)],
                ['road_s', arm([0, -50], 0, 6)],
            ]);
        };

        it('у каждой дороги есть срез, его ребро входит в контур площади', () => {
            const lines = tJunction(false);
            const [junction] = generateJunctions(lines, GEOMETRY_PARAMS.plaza);
            expect(junction.cuts).toHaveLength(3);
            const points = outlinePoints(junction.geometry);
            for (const cut of junction.cuts) {
                const line = lines.get(cut.roadId)!;
                // Ось идёт от края тайла к центру: площадь у конца оси
                expect(cut.atStart).toBe(false);
                expect(cut.index).toBeGreaterThan(0);
                expect(cut.index).toBeLessThan(line.center.length - 1);
                expect(points.some((p) => samePoint(p, line.left[cut.index] as Pt))).toBe(true);
                expect(points.some((p) => samePoint(p, line.right[cut.index] as Pt))).toBe(true);
            }
        });

        it('дорога, ось которой начинается в центре, режется с другого конца', () => {
            const lines = tJunction(true);
            const [junction] = generateJunctions(lines, GEOMETRY_PARAMS.plaza);
            const cut = junction.cuts.find((c) => c.roadId === 'road_e')!;
            expect(cut.atStart).toBe(true);
            const line = lines.get('road_e')!;
            const points = outlinePoints(junction.geometry);
            expect(points.some((p) => samePoint(p, line.left[cut.index] as Pt))).toBe(true);
            expect(points.some((p) => samePoint(p, line.right[cut.index] as Pt))).toBe(true);
            // Остальные дороги идут к центру, как и раньше
            expect(junction.cuts.filter((c) => c.atStart)).toHaveLength(1);
        });
    });

    describe.each(JUNCTIONS)('%s', (id) => {
        it.each([4, 12, 24])('ширина дороги %i: контур площади простой на любом сиде', (width) => {
            for (const seed of SEEDS) {
                const audit = auditTile(tileById(id), {
                    geometryParams: GEOMETRY_PARAMS,
                    seedOverride: seed,
                    shapes: { road: { width } },
                });
                const rings = audit.geometry.decorations.plazas;
                expect(rings.length, `площадь есть (сид ${seed})`).toBeGreaterThan(0);
                for (const ring of rings) {
                    expect(selfIntersections(ring as Pt[]), `сид ${seed}`).toBe(0);
                }
            }
        });
    });

    describe.each(JUNCTIONS)('%s: дороги у площади', (id) => {
        const audits = SEEDS.map((seed) => ({
            seed,
            geometry: auditTile(tileById(id), { geometryParams: GEOMETRY_PARAMS, seedOverride: seed }).geometry,
        }));

        // На сидах 43, 45 и 59 (CRRR, FRRR) раньше от дороги оставался отдельный кусок у сквозного края
        it.each(['43', '45', '59', ...SEEDS])('сид %s: у каждой дороги один кусок, без оторванных обрезков', (seed) => {
            const { geometry } = auditTile(tileById(id), { geometryParams: GEOMETRY_PARAMS, seedOverride: seed });
            expect(geometry.clipping.clippedLines.size).toBeGreaterThan(0);
            for (const [roadId, polygons] of geometry.clipping.clippedLines) {
                const areas = polygons.map((polygon) => ringArea(polygon[0] as Pt[])).sort((a, b) => b - a);
                const detached = areas.slice(1).reduce((sum, a) => sum + a, 0);
                expect(detached, `дорога ${roadId}: площади лишних кусков ${areas.slice(1)}`).toBeLessThan(0.5);
            }
        });

        it('остаток дороги не заходит на площадь и стыкуется с ней вершина в вершину', () => {
            for (const { seed, geometry } of audits) {
                for (const plaza of geometry.decorations.plazas as Pt[][]) {
                    for (const [roadId, polygons] of geometry.clipping.clippedLines) {
                        for (const polygon of polygons) {
                            const ring = polygon[0] as Pt[];
                            expect(ringsOverlap(ring, plaza), `сид ${seed}, дорога ${roadId}: заходит на площадь`).toBe(false);
                            // Вершина одного контура на ребре другого обязана быть и его вершиной:
                            // иначе после округления координат между ними остаётся щель или осколок
                            const edgesOf = (r: Pt[]) => r.map((p, k) => [p, r[(k + 1) % r.length]] as const);
                            for (const [a, b] of [[ring, plaza], [plaza, ring]] as const) {
                                for (const p of a) {
                                    const onEdge = edgesOf(b).some(([e1, e2]) => distanceToSegment(p, e1, e2) < 1e-7);
                                    if (onEdge) {
                                        expect(
                                            b.some((q) => samePoint(p, q)),
                                            `сид ${seed}, дорога ${roadId}: вершина ${p} на ребре, но не вершина`
                                        ).toBe(true);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    });
});
