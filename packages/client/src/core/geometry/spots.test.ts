// packages/client/src/core/geometry/spots.test.ts
// ============================================
// 🧪 ТЕСТЫ СПОТОВ МИПЛА И ЩИТА И ПРИВЯЗКИ ПОЛЕЙ ПО ПОРТАМ
// ============================================
// Часть 1 — чистая математика на простых фигурах, где ответ известен.
// Часть 2 — все тайлы: у каждой фичи есть спот внутри неё, он переживает
//           шум, не зависит от прежних ручных spots, а поля находят
//           свои полигоны по портам.
// ============================================
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import type { Polygon } from '@fiefdom/shared/core/geometry.types';
import { GEOMETRY_PARAMS } from './loadedGeometryParams';
import { auditTile, type AuditTile, type TileAudit } from './geometryAudit';
import {
    SHIELD_ANCHORS,
    maximizeDistance,
    poleOfInaccessibility,
    resolveSpotParams,
    signedDistanceToPolygon,
} from './spots';
import { getPortPoint } from './generators/sides';

const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
];

// ============================================
// 📐 ЧИСТАЯ МАТЕМАТИКА
// ============================================
describe('расстояние до полигона', () => {
    const square = rect(0, 0, 10, 10);

    it('внутри положительное, снаружи отрицательное, на границе ноль', () => {
        expect(signedDistanceToPolygon(5, 5, square)).toBe(5);
        expect(signedDistanceToPolygon(-3, 5, square)).toBe(-3);
        expect(signedDistanceToPolygon(0, 5, square)).toBe(0);
    });

    it('точка внутри дырки считается снаружи', () => {
        const ring: Polygon = [
            [[0, 0], [20, 0], [20, 20], [0, 20]],
            [[8, 8], [12, 8], [12, 12], [8, 12]],
        ];
        expect(signedDistanceToPolygon(10, 10, ring)).toBe(-2);
        expect(signedDistanceToPolygon(4, 10, ring)).toBe(4);
    });
});

describe('полюс недоступности', () => {
    it('квадрат: центр, расстояние равно половине стороны', () => {
        const pole = poleOfInaccessibility(rect(-50, -50, 50, 50), 0.01)!;
        expect(Math.abs(pole.point[0])).toBeLessThan(0.5);
        expect(Math.abs(pole.point[1])).toBeLessThan(0.5);
        expect(Math.abs(pole.distance - 50)).toBeLessThan(0.5);
    });

    it('Г-образная фигура: полюс в широкой части, а не в центроиде и не в углу', () => {
        // Толстая ножка 20×60 и тонкая полка 60×10 сверху
        const shape: Polygon = [[[0, 0], [60, 0], [60, 10], [20, 10], [20, 60], [0, 60]]];
        const pole = poleOfInaccessibility(shape, 0.01)!;
        expect(Math.abs(pole.distance - 10)).toBeLessThan(0.3); // вписанный круг радиуса 10
        expect(pole.point[0]).toBeGreaterThan(9.7);
        expect(pole.point[0]).toBeLessThan(10.3);
        expect(signedDistanceToPolygon(pole.point[0], pole.point[1], shape)).toBeGreaterThan(9.7);
    });

    it('квадрат с дыркой: полюс в диагональном углу кольца', () => {
        const ring: Polygon = [
            [[-50, -50], [50, -50], [50, 50], [-50, 50]],
            [[-20, -20], [20, -20], [20, 20], [-20, 20]],
        ];
        const pole = poleOfInaccessibility(ring, 0.01)!;
        // В углу кольца точка ближе всего к стенам и к вершине дырки (а не к её ребру):
        // расстояние 50 − 30/(1+√2)·… = 17.57, это больше «средней линии» 15 вдоль сторон
        expect(Math.abs(pole.distance - 17.57)).toBeLessThan(0.1);
        expect(Math.abs(Math.abs(pole.point[0]) - 32.43)).toBeLessThan(0.3);
        expect(Math.abs(Math.abs(pole.point[1]) - 32.43)).toBeLessThan(0.3);
    });

    it('центровка: в длинной полосе полюс смещается к центроиду, а не остаётся где попало', () => {
        const strip = rect(-50, -10, 50, 10);
        const pole = poleOfInaccessibility(strip, 0.01, 0.05)!;
        expect(Math.abs(pole.point[0])).toBeLessThan(3);
        expect(Math.abs(pole.distance - 10)).toBeLessThan(0.3);
    });

    it('притяжение к центру не заставляет жертвовать расстоянием на узкой фигуре', () => {
        // Узкая вытянутая «подкова»: центроид лежит вне фигуры — расстояние должно победить
        const horseshoe: Polygon = [[[0, 0], [60, 0], [60, 60], [50, 60], [50, 10], [10, 10], [10, 60], [0, 60]]];
        const pole = poleOfInaccessibility(horseshoe, 0.01, 0.05)!;
        expect(pole.distance).toBeGreaterThan(4.5); // ширина полос 10
    });

    it('вырожденный ввод не роняет расчёт', () => {
        expect(poleOfInaccessibility([[[0, 0], [1, 1]]])).toBeNull();
        expect(poleOfInaccessibility([])).toBeNull();
    });
});

describe('maximizeDistance', () => {
    it('находит максимум произвольной 1-липшицевой функции', () => {
        // Расстояние до точки (7, −3) со знаком минус: максимум в самой точке
        const result = maximizeDistance(
            (x, y) => -Math.hypot(x - 7, y + 3),
            { minX: -50, minY: -50, maxX: 50, maxY: 50 },
            0.01
        );
        expect(Math.abs(result.point[0] - 7)).toBeLessThan(0.1);
        expect(Math.abs(result.point[1] + 3)).toBeLessThan(0.1);
    });
});

describe('параметры спотов', () => {
    it('значения вне диапазона обрезаются', () => {
        const resolved = resolveSpotParams({ meepleRadius: -5, centerBias: 9, precision: 0 });
        expect(resolved.meepleRadius).toBeGreaterThan(0);
        expect(resolved.centerBias).toBeLessThan(0.51);
        expect(resolved.precision).toBeGreaterThan(0);
    });
});

// ============================================
// 🔗 ПОРТЫ
// ============================================
describe('координаты портов', () => {
    it('центральные порты лежат на серединах сторон, угловые — в третях', () => {
        expect(getPortPoint(1)).toEqual([0, -50]);
        expect(getPortPoint(4)).toEqual([50, 0]);
        expect(getPortPoint(7)).toEqual([0, 50]);
        expect(getPortPoint(10)).toEqual([-50, 0]);
        // порты идут по часовой стрелке: N слева направо, E сверху вниз, S справа налево, W снизу вверх
        expect(getPortPoint(0)[0]).toBeLessThan(0);
        expect(getPortPoint(3)[1]).toBeLessThan(0);
        expect(getPortPoint(6)[0]).toBeGreaterThan(0);
        expect(getPortPoint(9)[1]).toBeGreaterThan(0);
    });
});

// ============================================
// 🧱 ВСЕ ТАЙЛЫ
// ============================================
const tiles = (baseData as unknown as { tiles: AuditTile[] }).tiles;
const GENERATED = { overwrite: true, geometryParams: GEOMETRY_PARAMS } as const;
const meepleRadius = GEOMETRY_PARAMS.spots.meepleRadius;

const audits = new Map<string, TileAudit>(tiles.map((t) => [t.id, auditTile(t, GENERATED)]));

const SPOT_TYPES = new Set(['city', 'road', 'monastery', 'field']);
const ids = tiles.map((t) => t.id);

describe('споты на тайлах', () => {
    it.each(ids)('%s: у каждой фичи есть спот с положительным запасом', (id) => {
        const audit = audits.get(id)!;
        const problems: string[] = [];
        for (const feature of audit.features) {
            if (!SPOT_TYPES.has(feature.type)) continue;
            const spot = audit.spots.get(feature.id);
            if (!spot) problems.push(`${feature.id}: нет спота`);
            else if (spot.clearance <= 0) problems.push(`${feature.id}: запас ${spot.clearance.toFixed(2)}`);
        }
        expect(problems).toEqual([]);
    });

    it.each(ids)('%s: спот лежит внутри своей фичи (город, монастырь, поле)', (id) => {
        const audit = audits.get(id)!;
        const { tessellation, assignments } = audit.geometry;
        for (const feature of audit.features) {
            const spot = audit.spots.get(feature.id);
            if (!spot) continue;
            const polygons =
                feature.type === 'field'
                    ? assignments.fieldGeometries.get(feature.id)
                    : feature.type === 'city' || feature.type === 'monastery'
                        ? tessellation.areas.get(feature.id)
                        : undefined;
            if (!polygons) continue;
            const inside = polygons.some((p) => signedDistanceToPolygon(spot.meeple[0], spot.meeple[1], p) > 0);
            expect(inside).toBe(true);
        }
    });

    it('у городов со щитом щит не перекрывает мипла', () => {
        let checked = 0;
        for (const tile of tiles) {
            const audit = audits.get(tile.id)!;
            for (const feature of tile.features) {
                if (feature.type !== 'city' || feature.shieldSpot === undefined) continue;
                const spot = audit.spots.get(feature.id)!;
                expect(spot.shield).toBeDefined();
                expect(spot.shieldClearance!).toBeGreaterThan(0);
                const gap = Math.hypot(spot.shield![0] - spot.meeple[0], spot.shield![1] - spot.meeple[1]);
                expect(gap).toBeGreaterThan(meepleRadius);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(0);
    });

    it('щит стоит у края: центр на shieldInset от края тайла, привязан к углу или стороне', () => {
        const inset = GEOMETRY_PARAMS.spots.shieldInset;
        let checked = 0;
        for (const tile of tiles) {
            const audit = audits.get(tile.id)!;
            for (const feature of tile.features) {
                if (feature.type !== 'city' || feature.shieldSpot === undefined) continue;
                const spot = audit.spots.get(feature.id)!;
                const [x, y] = spot.shield!;
                const edgeDistance = 50 - Math.max(Math.abs(x), Math.abs(y));
                expect(Math.abs(edgeDistance - inset)).toBeLessThan(1.5);
                expect(SHIELD_ANCHORS.includes(spot.shieldAnchor!)).toBe(true);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(0);
    });

    it('правило щита воспроизводит прежние ручные координаты там, где мипл не мешает', () => {
        // Ручные щиты стояли в углу города на 16 от краёв (или у середины стороны).
        // Там, где авто-мипл занял тот же угол, щит честно уходит на другое место.
        let matched = 0;
        let total = 0;
        for (const tile of tiles) {
            const audit = audits.get(tile.id)!;
            for (const feature of tile.features) {
                if (feature.type !== 'city' || feature.shieldSpot === undefined) continue;
                const spot = audit.spots.get(feature.id)!;
                const dist = Math.hypot(spot.shield![0] - feature.shieldSpot.x, spot.shield![1] - feature.shieldSpot.y);
                if (dist < 1.5) matched++;
                total++;
            }
        }
        expect(matched).toBeGreaterThanOrEqual(Math.ceil(total / 2));
    });

    it('щит не оказывается там, где ему тесно, если есть равноценная альтернатива', () => {
        for (const tile of tiles) {
            const audit = audits.get(tile.id)!;
            for (const feature of tile.features) {
                if (feature.type !== 'city' || feature.shieldSpot === undefined) continue;
                expect(audit.spots.get(feature.id)!.shieldClearance!).toBeGreaterThanOrEqual(
                    GEOMETRY_PARAMS.spots.shieldRadius * 0.9
                );
            }
        }
    });

    it('shieldAnchor тайла выполняется: угол NE у города на весь тайл', () => {
        const tile = tiles.find((t) => t.id === 'tile_CCCC-S')!;
        const audit = auditTile(tile, { ...GENERATED, shieldAnchor: undefined });
        const params = { ...GEOMETRY_PARAMS, tiles: { tile_CCCC: { shieldAnchor: 'NE' as const } } };
        const forced = auditTile(tile, { overwrite: true, geometryParams: params });

        const feature = tile.features.find((f) => f.type === 'city')!;
        expect(audit.spots.get(feature.id)!.shieldAnchor).toBe('NW');
        expect(forced.spots.get(feature.id)!.shieldAnchor).toBe('NE');
        expect(forced.spots.get(feature.id)!.shield![0]).toBeGreaterThan(30);
        expect(forced.spots.get(feature.id)!.shield![1]).toBeLessThan(-30);
    });

    it('заданный угол выполняется даже вплотную к мипле, аудит предупреждает', () => {
        const tile = tiles.find((t) => t.id === 'tile_CCCC-S')!;
        const params = {
            ...GEOMETRY_PARAMS,
            // 30 + 20 + зазор = 52 > 48 (расстояние от центра до угла): щиту в угол не поместиться без перекрытия
            spots: { ...GEOMETRY_PARAMS.spots, meepleRadius: 30, shieldRadius: 20 },
            tiles: { tile_CCCC: { shieldAnchor: 'NW' as const } },
        };
        const audit = auditTile(tile, { overwrite: true, geometryParams: params });
        const feature = tile.features.find((f) => f.type === 'city')!;
        const spot = audit.spots.get(feature.id)!;

        expect(spot.shieldAnchor).toBe('NW');
        expect(spot.shield![0]).toBeLessThan(-30);
        expect(audit.issues.some((i) => i.code === 'spot-tight' && i.featureId === feature.id)).toBe(true);
    });

    it('shieldInset двигает щит от края', () => {
        const tile = tiles.find((t) => t.id === 'tile_CCCC-S')!;
        const audit = auditTile(tile, { ...GENERATED, spots: { shieldInset: 10 } });
        const feature = tile.features.find((f) => f.type === 'city')!;
        const [x, y] = audit.spots.get(feature.id)!.shield!;
        expect(Math.abs(50 - Math.max(Math.abs(x), Math.abs(y)) - 10)).toBeLessThan(1.5);
    });

    it('споты переживают сильный шум', () => {
        for (const tile of tiles) {
            const audit = auditTile(tile, { ...GENERATED, noise: { areaAmplitude: 8, lineAmplitude: 8 } });
            for (const [featureId, spot] of audit.spots) {
                expect(spot.clearance).toBeGreaterThan(0);
                expect(featureId.length).toBeGreaterThan(0);
            }
        }
    });

    it('детерминированы', () => {
        const again = auditTile(tiles[0], GENERATED);
        const first = audits.get(tiles[0].id)!;
        expect([...again.spots]).toEqual([...first.spots]);
    });

    it('меньший радиус мипла не создаёт предупреждений, больший ловит узкие фичи', () => {
        const tile = tiles.find((t) => t.id === 'tile_CRRR')!;
        const roomy = auditTile(tile, { ...GENERATED, spots: { meepleRadius: 4 } });
        const cramped = auditTile(tile, { ...GENERATED, spots: { meepleRadius: 14 } });
        expect(roomy.issues.some((i) => i.code === 'spot-tight')).toBe(false);
        // у дорог запас около половины ширины (10), для мипла радиусом 14 он мал
        expect(cramped.issues.some((i) => i.code === 'spot-tight')).toBe(true);
    });
});

// ============================================
// 🌾 ПРИВЯЗКА ПОЛЕЙ ПО ПОРТАМ
// ============================================
describe('привязка полей по портам', () => {
    /** Тайл без единого ручного спота: у полей он уведён далеко за пределы тайла */
    const withoutSpots = (tile: AuditTile): AuditTile => ({
        ...tile,
        features: tile.features.map((f) => (f.type === 'field' ? { ...f, meepleSpot: { x: 9999, y: 9999 } } : f)),
    });

    it.each(ids)('%s: поля находят полигоны по портам, не обращаясь к meepleSpot', (id) => {
        const tile = tiles.find((t) => t.id === id)!;
        const stripped = auditTile(withoutSpots(tile), GENERATED);

        const methods = stripped.geometry.assignments.fieldBinding ?? new Map();
        for (const feature of tile.features.filter((f) => f.type === 'field')) {
            expect(methods.get(feature.id)).toBe('ports');
        }
        expect(stripped.issues.filter((i) => i.code === 'field-binding-fallback')).toEqual([]);
    });

    it.each(ids)('%s: результат тот же, что при привязке по прежним ручным спотам', (id) => {
        const tile = tiles.find((t) => t.id === id)!;
        const byPorts = auditTile(withoutSpots(tile), GENERATED).geometry.assignments.fieldGeometries;
        const byManual = audits.get(id)!.geometry.assignments.fieldGeometries;

        for (const feature of tile.features.filter((f) => f.type === 'field')) {
            expect(JSON.stringify(byPorts.get(feature.id))).toBe(JSON.stringify(byManual.get(feature.id)));
        }
    });

});
