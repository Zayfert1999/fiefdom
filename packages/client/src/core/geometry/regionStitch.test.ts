// packages/client/src/core/geometry/regionStitch.test.ts
// ============================================
// 🧪 ТЕСТЫ СШИВАНИЯ ПОЛИГОНОВ ТАЙЛОВ
// ============================================
// Ядро сшивания общее для полей (fieldRegions) и городов (cityRegions): швы гасятся,
// регионы объединяются, рёбра на линиях сетки без пары считаются «открытыми».
// ============================================
import { describe, it, expect } from 'vitest';
import type { Point, Polygon } from '@fiefdom/shared/core/geometry.types';
import { BOARD_TILE_SIZE, normalizeWorldPolygon, stitchItems, tileToWorld, worldToTile } from './regionStitch';

const H = 50;
const square: Polygon = [[[-H, -H], [H, -H], [H, H], [-H, H]]];

const place = (col: number, row: number, rotation = 0, polygon: Polygon = square) => {
    const rings = normalizeWorldPolygon(polygon, (x, z) => tileToWorld(col, row, rotation, x, z));
    if (!rings) throw new Error('вырожденный полигон');
    return { rings };
};

const area = (ring: readonly Point[]): number => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        a += x1 * y2 - x2 * y1;
    }
    return a / 2;
};

describe('tileToWorld / worldToTile', () => {
    it('клетка (col, row) имеет центр в (col·100, row·100), поворот на 90° переводит север на восток', () => {
        expect(BOARD_TILE_SIZE).toBe(100);
        expect(tileToWorld(2, 3, 0, 0, 0)).toEqual([200, 300]);
        const [x, z] = tileToWorld(0, 0, 90, 0, -H);
        expect(Math.round(x)).toBe(H);
        expect(Math.round(z)).toBe(0);
    });

    it('worldToTile обратен tileToWorld', () => {
        for (const rotation of [0, 90, 180, 270]) {
            const [wx, wz] = tileToWorld(1, -2, rotation, 12, -7);
            const [x, z] = worldToTile(1, -2, rotation, wx, wz);
            expect(Math.round(x * 1e6) / 1e6).toBe(12);
            expect(Math.round(z * 1e6) / 1e6).toBe(-7);
        }
    });
});

describe('normalizeWorldPolygon', () => {
    it('внешнее кольцо идёт против часовой, дырки по часовой, независимо от исходного обхода', () => {
        const reversed: Polygon = [[[-H, -H], [-H, H], [H, H], [H, -H]]];
        const hole: Polygon = [[[-H, -H], [H, -H], [H, H], [-H, H]], [[-10, -10], [-10, 10], [10, 10], [10, -10]]];
        expect(area(place(0, 0, 0, reversed).rings[0])).toBeGreaterThan(0);
        const rings = place(0, 0, 0, hole).rings;
        expect(area(rings[0])).toBeGreaterThan(0);
        expect(area(rings[1])).toBeLessThan(0);
    });

    it('вырожденный полигон даёт null', () => {
        expect(normalizeWorldPolygon([[[0, 0], [1, 1]]], (x, z) => [x, z])).toBeNull();
    });
});

describe('stitchItems', () => {
    it('пустой список даёт пустой результат', () => {
        expect(stitchItems([])).toEqual([]);
    });

    it('одиночный квадрат: 4 открытых ребра на границах клетки', () => {
        const groups = stitchItems([place(0, 0)]);
        expect(groups).toHaveLength(1);
        expect(groups[0].openSeamEdges).toBe(4);
    });

    it('два соседних квадрата сшиваются в один регион, общий шов гасится', () => {
        const groups = stitchItems([place(0, 0), place(1, 0)]);
        expect(groups).toHaveLength(1);
        expect(groups[0].members).toEqual([0, 1]);
        expect(groups[0].polygons).toHaveLength(1);
        expect(Math.abs(area(groups[0].polygons[0][0]))).toBe(200 * 100);
        expect(groups[0].openSeamEdges).toBe(6);
    });

    it('квадраты, не касающиеся рёбрами, остаются разными регионами', () => {
        expect(stitchItems([place(0, 0), place(2, 0)])).toHaveLength(2);
        // касание только углом не склеивает регионы
        expect(stitchItems([place(0, 0), place(1, 1)])).toHaveLength(2);
    });

    it('кольцо из 8 квадратов вокруг пустой клетки даёт внешнее кольцо и дырку', () => {
        const items = [];
        for (let col = -1; col <= 1; col++) {
            for (let row = -1; row <= 1; row++) if (col !== 0 || row !== 0) items.push(place(col, row));
        }
        const [group] = stitchItems(items);
        expect(group.polygons).toHaveLength(1);
        expect(group.polygons[0]).toHaveLength(2);
        expect(Math.abs(area(group.polygons[0][1]))).toBe(100 * 100);
    });

    it('шов находится, даже когда вершины соседей стоят на линии по-разному', () => {
        // Левый тайл имеет лишнюю вершину на правой стороне — рёбра режутся по ней и всё равно гасятся
        const withExtra: Polygon = [[[-H, -H], [H, -H], [H, 20], [H, H], [-H, H]]];
        const groups = stitchItems([place(0, 0, 0, withExtra), place(1, 0)]);
        expect(groups).toHaveLength(1);
        expect(groups[0].openSeamEdges).toBe(6);
    });
});
