// packages/client/src/core/geometry/townGeometry.test.ts
// ============================================
// 🧪 ТЕСТЫ ЗАСТРОЙКИ ГОРОДОВ: ПАРАМЕТРЫ, РАСКЛАДКА, МЕШ, КЭШ
// ============================================
// Города — те же синтетические тайлы, что и в тестах стен (wallTestFixtures.ts): проверяем саму
// застройку, а не пайплайн геометрии тайлов.
// ============================================
import { describe, it, expect } from 'vitest';
import type { Polygon } from '@fiefdom/shared/core/geometry.types';
import { buildCityRegions, type CityRegion } from './cityRegions';
import { CityTownCache, buildCityTownModels } from './cityTown';
import { layoutCityTown, townSquareRadius, type TownHouse, type TownLayout } from './townGeometry';
import { buildTownMeshes } from './townMesh';
import {
    DEFAULT_TOWN_PARAMS,
    TOWN_PARAM_LIMITS,
    mergeTownParams,
    resolveTownParams,
    townHouseGrowth,
    townParamsKey,
    townProgressAt,
} from './townParams';
import { signedDistanceToPolygon } from './spots';
import type { TileMeshData } from './tileMesh';
import { crossTiles, lensTiles, ringTiles } from './wallTestFixtures';

const params = resolveTownParams();
const regionOf = (tiles = crossTiles()): CityRegion => buildCityRegions(tiles)[0];

/** Четыре угла и центр дома в мировых координатах */
function footprint(h: TownHouse): [number, number][] {
    const c = Math.cos(h.yaw);
    const s = Math.sin(h.yaw);
    return [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [0, 0],
    ].map(([u, v]) => [h.x + c * u * (h.width / 2) - s * v * (h.depth / 2), h.z + s * u * (h.width / 2) + c * v * (h.depth / 2)]);
}

/** Пересекаются ли два дома: теорема о разделяющей оси */
function overlap(a: TownHouse, b: TownHouse): boolean {
    const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2].map((t) => [Math.cos(t), Math.sin(t)]);
    for (const [ax, az] of axes) {
        const project = (h: TownHouse): [number, number] => {
            const vals = footprint(h)
                .slice(0, 4)
                .map(([x, z]) => x * ax + z * az);
            return [Math.min(...vals), Math.max(...vals)];
        };
        const [a0, a1] = project(a);
        const [b0, b1] = project(b);
        if (a1 <= b0 || b1 <= a0) return false;
    }
    return true;
}

function expectValidMesh(mesh: TileMeshData): void {
    const vertexCount = mesh.positions.length / 3;
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.colors.length).toBe(mesh.positions.length);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.positions.every((v) => Number.isFinite(v))).toBe(true);
    expect(mesh.indices.every((i) => i < vertexCount)).toBe(true);
    let covered = 0;
    for (const group of mesh.groups) {
        expect(group.start).toBe(covered);
        covered += group.count;
    }
    expect(covered).toBe(mesh.indices.length);
}

/** Лицевая сторона каждого треугольника смотрит туда же, куда нормаль вершины */
function expectOutwardWinding(mesh: TileMeshData): void {
    const { positions: p, normals: n, indices: ix } = mesh;
    for (let t = 0; t < ix.length; t += 3) {
        const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]];
        const ux = p[b * 3] - p[a * 3];
        const uy = p[b * 3 + 1] - p[a * 3 + 1];
        const uz = p[b * 3 + 2] - p[a * 3 + 2];
        const vx = p[c * 3] - p[a * 3];
        const vy = p[c * 3 + 1] - p[a * 3 + 1];
        const vz = p[c * 3 + 2] - p[a * 3 + 2];
        const gx = uy * vz - uz * vy;
        const gy = uz * vx - ux * vz;
        const gz = ux * vy - uy * vx;
        if (Math.hypot(gx, gy, gz) < 1e-9) continue;
        expect(gx * n[a * 3] + gy * n[a * 3 + 1] + gz * n[a * 3 + 2]).toBeGreaterThan(0);
    }
}

/** Синтетический город: прямоугольник со срезанными углами и воротами с юга */
function plainRegion(signature: string, polygons?: readonly Polygon[]): CityRegion {
    const ring = [
        [10, 0], [130, 0], [140, 10], [140, 100], [130, 110], [10, 110], [0, 100], [0, 10],
    ] as const;
    return {
        id: signature,
        featureKeys: [signature],
        cells: [],
        closed: true,
        signature,
        polygons: polygons ?? [[ring]],
        gates: [{ x: 70, z: 96, dirX: 0, dirZ: -1, path: [[70, 96], [70, 140]] }],
    } as unknown as CityRegion;
}

/** Город 200×130 с тремя воротами на одной стороне: ворота должны получить разные въезды на площадь */
function threeGateRegion(signature: string): CityRegion {
    const ring = [
        [14, 0], [186, 0], [200, 14], [200, 116], [186, 130], [14, 130], [0, 116], [0, 14],
    ] as const;
    const gate = (x: number) => ({ x, z: 14, dirX: 0, dirZ: 1, path: [[x, 14], [x, -40]] });
    return { ...plainRegion(signature, [[ring]]), gates: [gate(45), gate(100), gate(155)] } as unknown as CityRegion;
}

/** Доля застраиваемой площади (не ближе отступа от стены, вне площади) в пределах `reach` от улицы */
function streetCoverage(region: CityRegion, layout: TownLayout, reach = 13): number {
    const polygon = region.polygons[0];
    const xs = polygon[0].map((p) => p[0]);
    const zs = polygon[0].map((p) => p[1]);
    let total = 0;
    let covered = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3) {
        for (let z = Math.min(...zs); z <= Math.max(...zs); z += 3) {
            if (signedDistanceToPolygon(x, z, polygon) < params.edgeInset) continue;
            if (layout.squares.some((q) => Math.hypot(x - q.x, z - q.z) < q.radius + params.square.gap)) continue;
            total++;
            const near = layout.streets.some((st) =>
                st.points.some((a, i) => {
                    const b = st.points[i + 1];
                    if (!b) return false;
                    const dx = b[0] - a[0];
                    const dz = b[1] - a[1];
                    const l2 = dx * dx + dz * dz;
                    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
                    return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)) <= reach;
                })
            );
            if (near) covered++;
        }
    }
    return total > 0 ? covered / total : 1;
}

/** Концы улиц на кромке площади и угол подхода к радиусу (°): 0 — строго к центру */
function rimEntrances(layout: TownLayout): { kind: 'main' | 'side'; angle: number; at: number }[] {
    const sq = layout.squares[0];
    if (!sq) return [];
    const out: { kind: 'main' | 'side'; angle: number; at: number }[] = [];
    for (const street of layout.streets) {
        for (const end of [0, street.points.length - 1]) {
            const p = street.points[end];
            const d = Math.hypot(p[0] - sq.x, p[1] - sq.z);
            if (Math.abs(d - sq.radius) > 1.2) continue;
            const q = street.points[end === 0 ? Math.min(2, street.points.length - 1) : Math.max(0, street.points.length - 3)];
            const tx = q[0] - p[0];
            const tz = q[1] - p[1];
            const cos = Math.abs((tx * (p[0] - sq.x) + tz * (p[1] - sq.z)) / (Math.hypot(tx, tz) * d || 1));
            out.push({ kind: street.kind, angle: (Math.acos(Math.min(1, cos)) * 180) / Math.PI, at: Math.atan2(p[1] - sq.z, p[0] - sq.x) });
        }
    }
    return out;
}

describe('townParams', () => {
    it('значения по умолчанию проходят через resolve без изменений', () => {
        expect(resolveTownParams()).toEqual(DEFAULT_TOWN_PARAMS);
        expect(resolveTownParams(DEFAULT_TOWN_PARAMS)).toEqual(DEFAULT_TOWN_PARAMS);
    });

    it('значения приводятся к диапазонам, максимум не меньше минимума, мусор заменяется умолчанием', () => {
        const p = resolveTownParams({
            edgeInset: 1000,
            square: { minRadius: 30, maxRadius: 5, minCityArea: Number.NaN, fullSizeArea: 0 },
            houses: { widthMin: 12, widthMax: 6, fill: 5 },
            colors: { wall: 'красный', roofA: '#ABCDEF' },
            animation: { buckets: 3.7 },
        });
        expect(p.edgeInset).toBe(TOWN_PARAM_LIMITS.edgeInset.max);
        expect(p.square.maxRadius).toBeGreaterThanOrEqual(p.square.minRadius);
        expect(p.square.minCityArea).toBe(DEFAULT_TOWN_PARAMS.square.minCityArea);
        expect(p.square.fullSizeArea).toBeGreaterThanOrEqual(p.square.minCityArea + 0.1);
        expect(p.houses.widthMax).toBeGreaterThanOrEqual(p.houses.widthMin);
        expect(p.houses.fill).toBe(1);
        expect(p.colors.wall).toBe(DEFAULT_TOWN_PARAMS.colors.wall);
        expect(p.colors.roofA).toBe('#abcdef');
        expect(p.animation.buckets).toBe(4);
    });

    it('параметры подъезда, лучей и дальних дорог приводятся к диапазонам', () => {
        const p = resolveTownParams({
            square: { approachMin: 20, approachMax: 3, approachRatio: -1, passWidth: 500 },
            streets: { maxRays: 2.6, farRoads: 99, entranceMinSep: -5, raySep: 999, farCover: 1 },
        });
        expect(p.square.approachMax).toBeGreaterThanOrEqual(p.square.approachMin);
        expect(p.square.approachRatio).toBe(TOWN_PARAM_LIMITS.square.approachRatio.min);
        expect(p.square.passWidth).toBe(TOWN_PARAM_LIMITS.square.passWidth.max);
        expect(p.streets.maxRays).toBe(3);
        expect(p.streets.farRoads).toBe(TOWN_PARAM_LIMITS.streets.farRoads.max);
        expect(p.streets.entranceMinSep).toBe(0);
        expect(p.streets.raySep).toBe(TOWN_PARAM_LIMITS.streets.raySep.max);
        expect(p.streets.farCover).toBe(TOWN_PARAM_LIMITS.streets.farCover.min);
    });

    it('mergeTownParams дополняет вложенные группы, а не заменяет их', () => {
        const merged = mergeTownParams(params, { streets: { mainWidth: 12 }, colors: { square: '#112233' } });
        expect(merged.streets.mainWidth).toBe(12);
        expect(merged.streets.sideWidth).toBe(params.streets.sideWidth);
        expect(merged.colors.square).toBe('#112233');
        expect(merged.colors.wall).toBe(params.colors.wall);
    });

    it('ключ кэша не зависит от анимации (кроме числа частей роста)', () => {
        const base = townParamsKey(params);
        expect(townParamsKey(mergeTownParams(params, { animation: { stagger: 0.8, riseFraction: 0.3 } }))).toBe(base);
        expect(townParamsKey(mergeTownParams(params, { animation: { buckets: 3 } }))).not.toBe(base);
        expect(townParamsKey(mergeTownParams(params, { houses: { fill: 0.4 } }))).not.toBe(base);
    });

    it('рост домов: от нуля до единицы, дальние дома стартуют позже, без волны — одновременно', () => {
        expect(townProgressAt(-5, 100)).toBe(0);
        expect(townProgressAt(50, 100)).toBe(0.5);
        expect(townProgressAt(500, 100)).toBe(1);
        expect(townHouseGrowth(0, 0.5, 0.35)).toBe(0);
        expect(townHouseGrowth(1, 1, 0.35)).toBe(1);
        expect(townHouseGrowth(0.3, 0, 0.35)).toBeGreaterThan(townHouseGrowth(0.3, 1, 0.35));
        expect(townHouseGrowth(0.4, 0, 0)).toBe(townHouseGrowth(0.4, 1, 0));
    });
});

describe('townSquareRadius', () => {
    const tile = 100 * 100;
    const q = params.square;

    it('меньше порога — площади нет; с порога — минимальный радиус, дальше растёт до максимума', () => {
        expect(townSquareRadius(q.minCityArea * tile * 0.99, q)).toBe(0);
        expect(townSquareRadius(q.minCityArea * tile, q)).toBeCloseTo(q.minRadius, 6);
        expect(townSquareRadius(q.fullSizeArea * tile, q)).toBeCloseTo(q.maxRadius, 6);
        expect(townSquareRadius(q.fullSizeArea * tile * 10, q)).toBe(q.maxRadius);
        let prev = 0;
        for (let a = q.minCityArea; a <= q.fullSizeArea; a += 0.1) {
            const r = townSquareRadius(a * tile, q);
            expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = r;
        }
    });

    it('порог 0 — площадь в любом городе', () => {
        expect(townSquareRadius(1, { ...q, minCityArea: 0 })).toBeGreaterThanOrEqual(q.minRadius);
    });
});

describe('layoutCityTown', () => {
    it('раскладка детерминирована; seed и подпись города меняют результат', () => {
        const region = plainRegion('same');
        const a = layoutCityTown(region, params);
        expect(layoutCityTown(region, params)).toEqual(a);
        expect(layoutCityTown(region, mergeTownParams(params, { seed: 'другой' }))).not.toEqual(a);
        expect(layoutCityTown(plainRegion('other'), params)).not.toEqual(a);
    });

    it('площадь стоит в самой удалённой от границ точке (polylabel) и умещается в город', () => {
        const region = plainRegion('square');
        const layout = layoutCityTown(region, params);
        expect(layout.squares).toHaveLength(1);
        const [sq] = layout.squares;
        const clearance = signedDistanceToPolygon(sq.x, sq.z, region.polygons[0]);
        expect(clearance).toBeGreaterThanOrEqual(sq.radius + params.edgeInset - 1e-6);
        expect(sq.radius).toBeLessThanOrEqual(params.square.maxRadius);
        expect(sq.radius).toBeGreaterThanOrEqual(params.square.minRadius);
        // Центр прямоугольника 140×110 — точка с наибольшим просветом (55)
        expect(Math.hypot(sq.x - 70, sq.z - 55)).toBeLessThan(10);
    });

    it('внутреннее кольцо (поле в городе): площадь не попадает в дыру', () => {
        const outer = [[0, 0], [190, 0], [190, 190], [0, 190]] as const;
        const hole = [[75, 75], [115, 75], [115, 115], [75, 115]] as const;
        const polygon = [outer, hole] as unknown as Polygon;
        const region = plainRegion('hole', [polygon]);
        const layout = layoutCityTown(region, params);
        const [sq] = layout.squares;
        expect(sq).toBeTruthy();
        expect(signedDistanceToPolygon(sq.x, sq.z, polygon)).toBeGreaterThanOrEqual(sq.radius + params.edgeInset - 1e-6);
        for (const h of layout.houses) {
            for (const [x, z] of footprint(h)) expect(signedDistanceToPolygon(x, z, polygon)).toBeGreaterThanOrEqual(params.edgeInset - 1e-6);
        }
    });

    it('дома целиком внутри города с отступом, не на площади и не пересекаются', () => {
        for (const region of [plainRegion('inv'), regionOf(), regionOf(ringTiles())]) {
            const layout = layoutCityTown(region, params);
            expect(layout.houses.length).toBeGreaterThan(0);
            for (const h of layout.houses) {
                for (const [x, z] of footprint(h)) {
                    const inside = region.polygons.some((polygon) => signedDistanceToPolygon(x, z, polygon) >= params.edgeInset - 1e-6);
                    expect(inside).toBe(true);
                }
                for (const sq of layout.squares) expect(Math.hypot(h.x - sq.x, h.z - sq.z)).toBeGreaterThan(sq.radius);
                expect(h.delay).toBeGreaterThanOrEqual(0);
                expect(h.delay).toBeLessThanOrEqual(1);
            }
            for (let i = 0; i < layout.houses.length; i++) {
                for (let j = i + 1; j < layout.houses.length; j++) expect(overlap(layout.houses[i], layout.houses[j])).toBe(false);
            }
        }
    });

    it('улицы целиком внутри города; ворота соединены с площадью главными улицами', () => {
        const region = plainRegion('streets');
        const layout = layoutCityTown(region, params);
        for (const street of layout.streets) {
            for (const [x, z] of street.points) expect(signedDistanceToPolygon(x, z, region.polygons[0])).toBeGreaterThanOrEqual(0);
        }
        const mains = layout.streets.filter((s) => s.kind === 'main');
        expect(mains.length).toBeGreaterThan(0);
        // Первая главная улица начинается у ворот на контуре (юг, x = 70)
        const touchesGate = mains.some((s) => s.points.some(([x, z]) => Math.abs(x - 70) < 1.5 && Math.abs(z - 110) < 1.5));
        expect(touchesGate).toBe(true);
        // Ширина главных больше второстепенных
        for (const s of layout.streets) expect(s.width).toBe(s.kind === 'main' ? params.streets.mainWidth : params.streets.sideWidth);
    });

    it('город без ворот: главных улиц нет, площадь и остальное на месте', () => {
        const region = { ...plainRegion('nogate'), gates: [] } as CityRegion;
        const layout = layoutCityTown(region, params);
        expect(layout.squares).toHaveLength(1);
        expect(layout.streets.filter((s) => s.kind === 'main')).toHaveLength(0);
    });

    it('тесный город: без падений, без площади, предупреждение вместо застройки', () => {
        const sliver = [[[0, 0], [80, 0], [80, 12], [0, 12]]] as unknown as Polygon;
        const layout = layoutCityTown(plainRegion('sliver', [sliver]), params);
        expect(layout.squares).toHaveLength(0);
        expect(layout.houses).toHaveLength(0);
        expect(layout.warnings.length).toBeGreaterThan(0);
    });

    it('реальные фикстуры: «глаз» из двух шапок и крест с воротами раскладываются без предупреждений', () => {
        for (const tiles of [lensTiles(), crossTiles()]) expect(layoutCityTown(regionOf(tiles), params).warnings).toEqual([]);
        expect(layoutCityTown(regionOf(crossTiles()), params).squares).toHaveLength(1);
        expect(layoutCityTown(regionOf(crossTiles()), params).streets.some((s) => s.kind === 'main')).toBe(true);
    });

    it('совсем маленький город (меньше порога) без главной площади; порог настраивается', () => {
        // «Глаз» из двух шапок — около 0.4 площади тайла: меньше порога по умолчанию (0.6)
        const lens = regionOf(lensTiles());
        const small = layoutCityTown(lens, params);
        expect(small.squares).toHaveLength(0);
        expect(small.warnings).toEqual([]);
        // Без площади город остаётся застроенным: улицы и дома на месте
        expect(small.streets.length).toBeGreaterThan(0);
        // Порог 0 — площадь появляется даже в самом маленьком городе, если влезает
        const lowered = layoutCityTown(lens, mergeTownParams(params, { square: { minCityArea: 0, minRadius: 4 } }));
        expect(lowered.squares.length).toBeLessThanOrEqual(1);
        // Порог выше размера большого города — площади нет и там
        const big = plainRegion('threshold');
        expect(layoutCityTown(big, params).squares).toHaveLength(1);
        expect(layoutCityTown(big, mergeTownParams(params, { square: { minCityArea: 4, fullSizeArea: 8 } })).squares).toHaveLength(0);
    });

    it('город без площади: ворота всё равно соединены главными улицами с центром', () => {
        const region = plainRegion('nosquare');
        const layout = layoutCityTown(region, mergeTownParams(params, { square: { minCityArea: 4, fullSizeArea: 8 } }));
        expect(layout.squares).toHaveLength(0);
        expect(layout.streets.some((s) => s.kind === 'main')).toBe(true);
        expect(layout.warnings).toEqual([]);
    });

    it('главные дороги сглаживаются сильнее второстепенных, независимо друг от друга', () => {
        /** Средний модуль поворота на внутренних точках улиц данного вида (радианы) */
        const meanTurn = (layout: TownLayout, kind: 'main' | 'side'): number => {
            let sum = 0;
            let n = 0;
            for (const street of layout.streets) {
                if (street.kind !== kind) continue;
                for (let i = 1; i < street.points.length - 1; i++) {
                    const [a, b, c] = [street.points[i - 1], street.points[i], street.points[i + 1]];
                    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
                    const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
                    let d = Math.abs(h2 - h1);
                    if (d > Math.PI) d = 2 * Math.PI - d;
                    sum += d;
                    n++;
                }
            }
            return sum / Math.max(n, 1);
        };
        const region = plainRegion('smooth');
        const raw = layoutCityTown(region, mergeTownParams(params, { streets: { mainSmoothing: 0, sideSmoothing: 0 } }));
        const mainOnly = layoutCityTown(region, mergeTownParams(params, { streets: { mainSmoothing: 20, sideSmoothing: 0 } }));
        const sideOnly = layoutCityTown(region, mergeTownParams(params, { streets: { mainSmoothing: 0, sideSmoothing: 20 } }));
        // Главное сглаживание выпрямляет главные дороги и не трогает второстепенные (их точки только «следуют» за концами)
        expect(meanTurn(mainOnly, 'main')).toBeLessThan(meanTurn(raw, 'main') * 0.8);
        expect(meanTurn(sideOnly, 'side')).toBeLessThan(meanTurn(raw, 'side') * 0.8);
        expect(meanTurn(sideOnly, 'main')).toBeCloseTo(meanTurn(raw, 'main'), 5);
    });

    it('прямой участок от арки: главная дорога выходит из ворот перпендикулярно стене', () => {
        const layout = layoutCityTown(plainRegion('arch'), mergeTownParams(params, { streets: { mainSmoothing: 40, archRun: 12 } }));
        // Ворота с юга (x = 70, z = 110): первые точки главной дороги идут строго вверх по x = 70
        const first = layout.streets
            .filter((s) => s.kind === 'main')
            .flatMap((s) => s.points)
            .filter(([x, z]) => z > 110 - 12 + 0.5 && z <= 110 + 0.001);
        expect(first.length).toBeGreaterThan(0);
        for (const [x] of first) expect(Math.abs(x - 70)).toBeLessThan(0.5);
    });

    it('параметры работают: меньше заполнение — меньше домов; крупнее квартал — реже улицы', () => {
        const region = plainRegion('knobs');
        const full = layoutCityTown(region, mergeTownParams(params, { houses: { fill: 1 } }));
        const sparse = layoutCityTown(region, mergeTownParams(params, { houses: { fill: 0.3 } }));
        expect(sparse.houses.length).toBeLessThan(full.houses.length);
        const dense = layoutCityTown(region, mergeTownParams(params, { streets: { blockSize: 16 } }));
        const coarse = layoutCityTown(region, mergeTownParams(params, { streets: { blockSize: 50 } }));
        expect(dense.streets.length).toBeGreaterThan(coarse.streets.length);
    });
});

describe('площадь как место назначения', () => {
    it('каждые ворота получают свой въезд, и подход к кромке строго радиальный', () => {
        for (const signature of ['a', 'b', 'c', 'd']) {
            const layout = layoutCityTown(threeGateRegion(signature), params);
            const entrances = rimEntrances(layout).filter((e) => e.kind === 'main');
            // Три ворот — не меньше трёх разных въездов, и они разведены по кромке
            expect(entrances.length).toBeGreaterThanOrEqual(3);
            for (const e of entrances) expect(e.angle).toBeLessThan(6);
            const angles = entrances.map((e) => e.at);
            for (let i = 0; i < angles.length; i++) {
                for (let j = i + 1; j < angles.length; j++) {
                    const d = Math.abs(angles[i] - angles[j]) % (2 * Math.PI);
                    const sep = ((d > Math.PI ? 2 * Math.PI - d : d) * 180) / Math.PI;
                    expect(sep).toBeGreaterThan(params.streets.entranceMinSep - 1);
                }
            }
        }
    });

    it('внутри кольца «радиус + подъезд» улицы только радиальные', () => {
        for (const approachRatio of [0.3, 0.6, 1]) {
            const p = mergeTownParams(params, { square: { approachRatio } });
            const layout = layoutCityTown(threeGateRegion('ring'), p);
            const sq = layout.squares[0];
            const approach = Math.min(p.square.approachMax, Math.max(p.square.approachMin, sq.radius * p.square.approachRatio));
            for (const street of layout.streets) {
                const inner = street.points.filter(([x, z]) => Math.hypot(x - sq.x, z - sq.z) < sq.radius + approach - 0.6);
                if (inner.length < 2) continue;
                const first = Math.atan2(inner[0][1] - sq.z, inner[0][0] - sq.x);
                for (const [x, z] of inner) {
                    const d = Math.abs(Math.atan2(z - sq.z, x - sq.x) - first) % (2 * Math.PI);
                    expect(Math.min(d, 2 * Math.PI - d)).toBeLessThan(0.03);
                }
            }
        }
    });

    it('вторичных лучей к площади не больше maxRays; 0 — ни одного; без ворот — не меньше 4', () => {
        const region = threeGateRegion('rays');
        for (const maxRays of [0, 1, 3]) {
            const layout = layoutCityTown(region, mergeTownParams(params, { streets: { maxRays } }));
            const rays = rimEntrances(layout).filter((e) => e.kind === 'side');
            // Сверх лимита бывают только «лучи связности» для кварталов, отрезанных площадью; на этом городе их нет
            expect(rays.length).toBeLessThanOrEqual(maxRays);
        }
        const nogate = { ...plainRegion('nogate-rays'), gates: [] } as CityRegion;
        const spokes = rimEntrances(layoutCityTown(nogate, mergeTownParams(params, { streets: { maxRays: 0 } })));
        expect(spokes.length).toBeGreaterThanOrEqual(2);
        for (const s of spokes) expect(s.angle).toBeLessThan(6);
    });

    it('вокруг площади с подъездом остаётся проход шириной не меньше passWidth', () => {
        const regions = [plainRegion('pass-a'), threeGateRegion('pass-b'), regionOf(crossTiles()), regionOf(ringTiles())];
        for (const region of regions) {
            for (const passWidth of [0, 12, 24]) {
                const p = mergeTownParams(params, { square: { passWidth } });
                const layout = layoutCityTown(region, p);
                for (const sq of layout.squares) {
                    const approach = Math.min(p.square.approachMax, Math.max(p.square.approachMin, sq.radius * p.square.approachRatio));
                    const clearance = Math.max(...region.polygons.map((poly) => signedDistanceToPolygon(sq.x, sq.z, poly))) - p.edgeInset;
                    expect(clearance - (sq.radius + approach)).toBeGreaterThanOrEqual(passWidth - 0.51);
                }
            }
        }
    });
});

describe('охват города улицами', () => {
    it('прореживание и площадь не отрезают кварталы: охват высокий даже в «рогатой» фикстуре', () => {
        // Эти seed раньше давали охват 41–54%: сеть рвалась на обломки в узких рукавах города.
        // Мосты между обломками и «лучи связности» через площадь частично дублируют друг друга,
        // поэтому тест ловит выключение обоих сразу
        const base = regionOf(crossTiles());
        let sum = 0;
        const seeds = [2, 7, 8, 10, 15, 18, 20, 24];
        for (const i of seeds) {
            const region = { ...base, signature: `cross-${i}` } as CityRegion;
            const cover = streetCoverage(region, layoutCityTown(region, params));
            expect(cover).toBeGreaterThan(0.7);
            if (i === 18) expect(cover).toBeGreaterThan(0.85);
            sum += cover;
        }
        expect(sum / seeds.length).toBeGreaterThan(0.88);
    });

    it('охват простых городов — выше 85%', () => {
        for (const region of [plainRegion('cover-a'), threeGateRegion('cover-b'), regionOf(ringTiles())]) {
            expect(streetCoverage(region, layoutCityTown(region, params))).toBeGreaterThan(0.85);
        }
    });

    it('дальние дороги: включены по умолчанию, дальше уходят от площади и не ломают инварианты', () => {
        expect(params.streets.farRoads).toBeGreaterThan(0);
        const region = threeGateRegion('far');
        const off = layoutCityTown(region, mergeTownParams(params, { streets: { farRoads: 0 } }));
        const on = layoutCityTown(region, params);
        const mainLength = (layout: TownLayout): number =>
            layout.streets
                .filter((s) => s.kind === 'main')
                .reduce((sum, s) => sum + s.points.slice(1).reduce((l, p, i) => l + Math.hypot(p[0] - s.points[i][0], p[1] - s.points[i][1]), 0), 0);
        expect(mainLength(on)).toBeGreaterThan(mainLength(off));
        for (const h of on.houses) {
            for (const [x, z] of footprint(h)) expect(signedDistanceToPolygon(x, z, region.polygons[0])).toBeGreaterThanOrEqual(params.edgeInset - 1e-6);
        }
        for (const street of on.streets) {
            for (const [x, z] of street.points) expect(signedDistanceToPolygon(x, z, region.polygons[0])).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('buildTownMeshes', () => {
    const layoutOf = (region: CityRegion): TownLayout => layoutCityTown(region, params);

    it('меши валидны: индексы, группы, нормали; дома разбиты на части по расстоянию от площади', () => {
        const meshes = buildTownMeshes(layoutOf(plainRegion('mesh')), params)!;
        expect(meshes).toBeTruthy();
        expect(meshes.ground).toBeTruthy();
        expectValidMesh(meshes.ground!);
        expectOutwardWinding(meshes.ground!);
        expect(meshes.buckets.length).toBeGreaterThan(1);
        expect(meshes.buckets.length).toBeLessThanOrEqual(params.animation.buckets);
        for (const bucket of meshes.buckets) {
            expectValidMesh(bucket.mesh);
            expectOutwardWinding(bucket.mesh);
            expect(bucket.mesh.groups.map((g) => g.featureId)).toEqual(['town-house-wall', 'town-house-roof']);
        }
        const delays = meshes.buckets.map((b) => b.delay);
        expect(delays).toEqual([...delays].sort((a, b) => a - b));
    });

    it('у каждого дома 4 стены и 4 ската: 12 треугольников; основание ниже поверхности, крыша выше стен', () => {
        const layout = layoutOf(plainRegion('count'));
        const meshes = buildTownMeshes(layout, params)!;
        const triangles = meshes.buckets.reduce((n, b) => n + b.mesh.stats.triangles, 0);
        expect(triangles).toBe(layout.houses.length * 12);
        for (const bucket of meshes.buckets) {
            const ys = Array.from({ length: bucket.mesh.positions.length / 3 }, (_, i) => bucket.mesh.positions[i * 3 + 1]);
            expect(Math.min(...ys)).toBeCloseTo(-params.houses.sink, 5);
            expect(Math.max(...ys)).toBeGreaterThan(params.houses.wallHeightMin);
        }
    });

    it('пустая раскладка даёт null', () => {
        expect(buildTownMeshes({ squares: [], streets: [], houses: [], warnings: [] }, params)).toBeNull();
    });
});

describe('buildCityTownModels', () => {
    it('строит модель для замкнутого города; повторный вызов берёт её из кэша, смена параметров — перестраивает', () => {
        const cache = new CityTownCache();
        const tiles = lensTiles();
        const first = buildCityTownModels(tiles, params, { cache });
        expect(first).toHaveLength(1);
        expect(first[0].stats.houses).toBeGreaterThan(0);
        expect(buildCityTownModels(tiles, params, { cache })[0]).toBe(first[0]);
        const changed = buildCityTownModels(tiles, mergeTownParams(params, { houses: { fill: 0.5 } }), { cache });
        expect(changed[0]).not.toBe(first[0]);
        expect(cache.size).toBe(1);
    });

    it('выключенная застройка даёт пустой список и очищает кэш', () => {
        const cache = new CityTownCache();
        buildCityTownModels(lensTiles(), params, { cache });
        expect(buildCityTownModels(lensTiles(), mergeTownParams(params, { enabled: false }), { cache })).toEqual([]);
        expect(cache.size).toBe(0);
    });

    it('onlyFeatureKeys: города вне списка не застраиваются', () => {
        expect(buildCityTownModels(lensTiles(), params, { onlyFeatureKeys: new Set() })).toEqual([]);
    });
});
