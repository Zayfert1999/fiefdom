// packages/client/src/core/geometry/wallTestFixtures.ts
// ============================================
// 🧪 СИНТЕТИЧЕСКИЕ ТАЙЛЫ ДЛЯ ТЕСТОВ СТЕН
// ============================================
// Полигоны городов в форме, близкой к тому, что дают генераторы (дуги из квадратичных кривых),
// но без шума и clipper: тесты стен не зависят от остального пайплайна.
// ============================================
import type { Point } from '@fiefdom/shared/core/geometry.types';
import type { CityRegionTile, RoadEndRef } from './cityRegions';

const H = 50;

/** Дуга-квадратичная кривая из n сегментов */
export function arc(p0: Point, control: Point, p2: Point, n = 12): Point[] {
    const out: Point[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        out.push([
            (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * control[0] + t * t * p2[0],
            (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * control[1] + t * t * p2[1],
        ]);
    }
    return out;
}

/** Город на одной стороне (север): шапка с дугой глубиной 30 */
export const capCity = (): Point[] => arc([H, -H], [0, -H + 60], [-H, -H]);

/** Город на трёх сторонах (север, восток, запад), на юге дуга глубиной 30 */
export const threeSidedCity = (): Point[] => [
    [-H, -H],
    [-H, H],
    ...arc([-H, H], [0, H - 60], [H, H]).slice(1),
    [H, -H],
];

/** Город на двух противоположных сторонах (запад–восток), «песочные часы» */
export const hourglassCity = (): Point[] => [
    [-H, -H],
    ...arc([-H, -H], [0, -20], [H, -H]).slice(1),
    [H, H],
    ...arc([H, H], [0, 20], [-H, H]).slice(1),
];

/** Город на двух соседних сторонах (восток и юг): треугольник с дугой по диагонали */
export const diagonalCity = (): Point[] => [
    [H, -H],
    [H, H],
    [-H, H],
    ...arc([-H, H], [20, 20], [H, -H]).slice(1, -1),
];

/** Город на всех четырёх сторонах */
export const fullCity = (): Point[] => [[-H, -H], [H, -H], [H, H], [-H, H]];

/** Тупик дороги, входящий в город с юга: конец оси у (0, 6), направление на север */
export const southRoadEnd: RoadEndRef = {
    featureId: 'road_s',
    cityFeatureId: 'city_1',
    point: [0, 6],
    dir: [0, -1],
    path: [[0, 6], [0, 20], [0, 35], [0, 50]],
};

export function cityTile(
    col: number,
    row: number,
    rotation: number,
    polygon: Point[],
    roadEnds: readonly RoadEndRef[] = []
): CityRegionTile {
    return {
        key: `${col},${row}`,
        col,
        row,
        rotation,
        tileId: 'synthetic',
        cities: [{ featureId: 'city_1', polygon: [polygon] }],
        roadEnds,
    };
}

/** Две шапки лицом к лицу: замкнутый «глаз» из двух клеток */
export const lensTiles = (): CityRegionTile[] => [
    cityTile(0, 0, 0, capCity()),
    cityTile(0, -1, 180, capCity()),
];

/** Крест из четырёх клеток: центр с тремя сторонами города и воротами на юге, вокруг три шапки */
export const crossTiles = (): CityRegionTile[] => [
    cityTile(0, 0, 0, threeSidedCity(), [southRoadEnd]),
    cityTile(0, -1, 180, capCity()),
    cityTile(-1, 0, 90, capCity()),
    cityTile(1, 0, 270, capCity()),
];

/** Кольцо из восьми клеток вокруг пустой центральной клетки: внешний контур и внутренний (дырка) */
export const ringTiles = (): CityRegionTile[] => [
    cityTile(-1, -1, 0, diagonalCity()),
    cityTile(1, -1, 90, diagonalCity()),
    cityTile(1, 1, 180, diagonalCity()),
    cityTile(-1, 1, 270, diagonalCity()),
    cityTile(0, -1, 0, hourglassCity()),
    cityTile(0, 1, 0, hourglassCity()),
    cityTile(-1, 0, 90, hourglassCity()),
    cityTile(1, 0, 90, hourglassCity()),
];
