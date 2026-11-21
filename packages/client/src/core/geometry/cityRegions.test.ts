// packages/client/src/core/geometry/cityRegions.test.ts
// ============================================
// 🧪 ТЕСТЫ РЕГИОНОВ ГОРОДОВ: КОНТУР, ЗАМКНУТОСТЬ, ВОРОТА
// ============================================
import { describe, it, expect } from 'vitest';
import type { MultiPolygon, Point } from '@fiefdom/shared/core/geometry.types';
import { buildCityRegions, collectCityRefs, getCityRefs, type CitySource } from './cityRegions';
import { capCity, cityTile, crossTiles, lensTiles, ringTiles, southRoadEnd, threeSidedCity } from './wallTestFixtures';

describe('buildCityRegions', () => {
    it('две шапки лицом к лицу дают один замкнутый регион с одним кольцом', () => {
        const regions = buildCityRegions(lensTiles());
        expect(regions).toHaveLength(1);
        expect(regions[0].closed).toBe(true);
        expect(regions[0].polygons).toHaveLength(1);
        expect(regions[0].polygons[0]).toHaveLength(1);
        expect(regions[0].featureKeys).toEqual(['0,-1:city_1', '0,0:city_1']);
        expect(regions[0].cells).toHaveLength(2);
    });

    it('одиночная шапка упирается в край клетки без соседа: регион не замкнут', () => {
        const [region] = buildCityRegions([cityTile(0, 0, 0, capCity())]);
        expect(region.closed).toBe(false);
    });

    it('шапка с неподходящей стороны соседа не замыкается', () => {
        // Верхний сосед повёрнут так, что город у него на севере, а не на юге
        const [region] = buildCityRegions([cityTile(0, 0, 0, capCity()), cityTile(0, -1, 0, capCity())]);
        expect(region.closed).toBe(false);
    });

    it('крест: один замкнутый регион и одни ворота с направлением внутрь города', () => {
        const regions = buildCityRegions(crossTiles());
        expect(regions).toHaveLength(1);
        expect(regions[0].closed).toBe(true);
        expect(regions[0].gates).toHaveLength(1);
        const [gate] = regions[0].gates;
        expect(gate.x).toBeCloseTo(0, 6);
        expect(gate.z).toBeCloseTo(6, 6);
        expect(gate.dirX).toBeCloseTo(0, 6);
        expect(gate.dirZ).toBeCloseTo(-1, 6);
    });

    it('ворота переводятся в мир вместе с поворотом тайла', () => {
        const tiles = crossTiles();
        // Тот же центральный тайл, повёрнутый на 90° и сдвинутый: конец оси (0, 6) → (-6, 0) относительно центра
        const rotated = { ...tiles[0], col: 3, row: 2, rotation: 90 };
        const [region] = buildCityRegions([rotated]);
        const [gate] = region.gates;
        expect(gate.x).toBeCloseTo(300 - 6, 6);
        expect(gate.z).toBeCloseTo(200, 6);
        expect(gate.dirX).toBeCloseTo(1, 6);
        expect(gate.dirZ).toBeCloseTo(0, 6);
    });

    it('кольцо вокруг пустой клетки: замкнуто, внешнее кольцо и дырка', () => {
        const regions = buildCityRegions(ringTiles());
        expect(regions).toHaveLength(1);
        expect(regions[0].closed).toBe(true);
        expect(regions[0].polygons).toHaveLength(1);
        expect(regions[0].polygons[0]).toHaveLength(2);
    });

    it('onlyFeatureKeys оставляет только перечисленные города: часть креста незамкнута', () => {
        const regions = buildCityRegions(crossTiles(), new Set(['0,0:city_1', '0,-1:city_1']));
        expect(regions).toHaveLength(1);
        expect(regions[0].closed).toBe(false);
    });

    it('подпись зависит от состава, поворота и бандла', () => {
        const a = buildCityRegions(crossTiles())[0].signature;
        const rotated = crossTiles();
        rotated[1] = { ...rotated[1], rotation: 0 };
        expect(buildCityRegions(rotated)[0].signature).not.toBe(a);
        const other = crossTiles();
        other[0] = { ...other[0], tileId: 'another' };
        expect(buildCityRegions(other)[0].signature).not.toBe(a);
        expect(buildCityRegions(crossTiles())[0].signature).toBe(a);
    });

    it('порядок регионов детерминирован и не зависит от порядка тайлов', () => {
        const forward = buildCityRegions([...crossTiles(), cityTile(10, 10, 0, capCity())]);
        const backward = buildCityRegions([cityTile(10, 10, 0, capCity()), ...crossTiles().reverse()]);
        expect(forward.map((r) => r.id)).toEqual(backward.map((r) => r.id));
        expect(forward.map((r) => r.signature)).toEqual(backward.map((r) => r.signature));
    });
});

// ============================================
// 🔎 СБОР ГОРОДОВ И ТУПИКОВ ТАЙЛА
// ============================================
const lineSource = (center: Point[], cityPolygon: Point[] = threeSidedCity()): CitySource => ({
    features: [
        { id: 'city_1', type: 'city' },
        { id: 'road_1', type: 'road' },
    ],
    geometry: {
        tessellation: {
            areas: new Map<string, MultiPolygon>([['city_1', [[cityPolygon]]]]),
            lines: new Map([['road_1', { center }]]),
        },
    },
});

describe('collectCityRefs', () => {
    it('находит тупик дороги, входящий в город, и направление внутрь города', () => {
        const refs = collectCityRefs(lineSource([[0, 50], [0, 30], [0, 18], [0, 6]]));
        expect(refs.cities).toHaveLength(1);
        expect(refs.roadEnds).toHaveLength(1);
        expect(refs.roadEnds[0].cityFeatureId).toBe('city_1');
        expect(refs.roadEnds[0].point).toEqual([0, 6]);
        expect(refs.roadEnds[0].dir[0]).toBeCloseTo(0, 6);
        expect(refs.roadEnds[0].dir[1]).toBeCloseTo(-1, 6);
    });

    it('ось дороги отдаётся от тупика наружу: первая точка — конец, последняя — порт на краю', () => {
        const [end] = collectCityRefs(lineSource([[0, 50], [0, 30], [0, 18], [0, 6]])).roadEnds;
        expect(end.path[0]).toEqual([0, 6]);
        expect(end.path[end.path.length - 1]).toEqual([0, 50]);
        // у региона ось переводится в мир вместе с воротами
        const [region] = buildCityRegions([cityTile(3, 2, 90, threeSidedCity(), [end])]);
        expect(region.gates[0].path?.[0][0]).toBeCloseTo(300 - 6, 6);
        expect(region.gates[0].path?.[0][1]).toBeCloseTo(200, 6);
    });

    it('направление берётся по точке не ближе нескольких единиц: мелкий шум у конца не вертит ворота', () => {
        const refs = collectCityRefs(lineSource([[0, 50], [0, 20], [0.3, 8], [0, 6]]));
        expect(refs.roadEnds[0].dir[1]).toBeCloseTo(-1, 1);
    });

    it('конец дороги на краю тайла (порт) тупиком не считается', () => {
        // Центральная линия идёт от порта на юге до порта на севере: оба конца на краях
        const refs = collectCityRefs(lineSource([[0, 50], [0, 0], [0, -50]]));
        expect(refs.roadEnds).toHaveLength(0);
    });

    it('конец дороги вне города (у площади, у монастыря) тупиком в город не считается', () => {
        const refs = collectCityRefs(lineSource([[0, 50], [0, 40]], capCity()));
        expect(refs.roadEnds).toHaveLength(0);
    });

    it('тайл без городов не даёт ничего', () => {
        const source: CitySource = {
            features: [{ id: 'road_1', type: 'road' }],
            geometry: { tessellation: { areas: new Map(), lines: new Map([['road_1', { center: [[0, 50], [0, 0]] }]]) } },
        };
        expect(collectCityRefs(source)).toEqual({ cities: [], roadEnds: [] });
    });

    it('getCityRefs кэширует результат по объекту источника', () => {
        const source = lineSource([[0, 50], [0, 6]]);
        expect(getCityRefs(source)).toBe(getCityRefs(source));
        expect(getCityRefs(lineSource([[0, 50], [0, 6]]))).not.toBe(getCityRefs(source));
    });
});

describe('ворота и тупики вместе', () => {
    it('только тупик из города того же тайла становится воротами региона', () => {
        const alien = { ...southRoadEnd, cityFeatureId: 'other_city' };
        const [region] = buildCityRegions([cityTile(0, 0, 0, threeSidedCity(), [alien])]);
        expect(region.gates).toHaveLength(0);
    });
});
