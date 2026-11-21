// packages/client/src/core/geometry/cityWalls.tiles.test.ts
// ============================================
// 🧪 СТЕНЫ НА НАСТОЯЩИХ ТАЙЛАХ НАБОРА
// ============================================
// Синтетические тесты (cityWalls.test.ts) проверяют алгоритм, эти — что он работает
// на реальной геометрии: с шумом, дугами и швами между тайлами.
// ============================================
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import { GEOMETRY_PARAMS } from './loadedGeometryParams';
import { auditTile, type AuditTile } from './geometryAudit';
import { buildCityRegions, collectCityRefs, type CityRegionTile } from './cityRegions';
import { buildCityWallModels } from './cityWalls';

const tiles = (baseData as unknown as { tiles: AuditTile[] }).tiles;
const tileById = (id: string): AuditTile => {
    const tile = tiles.find((t) => t.id === id);
    if (!tile) throw new Error(`нет тайла ${id}`);
    return tile;
};

const refsOf = (id: string) => collectCityRefs(auditTile(tileById(id), { geometryParams: GEOMETRY_PARAMS }));

/** Тайл с городом на одной стороне и без других фич — «шапка» */
const capTile = (): AuditTile => {
    const found = tiles.find((t) => {
        const cities = t.features.filter((f) => f.type === 'city');
        return cities.length === 1 && cities[0].ports.length === 1 && t.features.every((f) => f.type === 'city' || f.type === 'field');
    });
    if (!found) throw new Error('в наборе нет тайла-шапки');
    return found;
};

const placed = (tile: AuditTile, col: number, row: number, rotation: number): CityRegionTile => {
    const refs = collectCityRefs(auditTile(tile, { geometryParams: GEOMETRY_PARAMS }));
    return { key: `${col},${row}`, col, row, rotation, tileId: tile.id, cities: refs.cities, roadEnds: refs.roadEnds };
};

describe('тупики дорог в города: реальные тайлы', () => {
    it('у тайлов с трёхсторонним городом и дорогой с юга ровно один тупик, направленный на север', () => {
        for (const id of ['tile_CCRC', 'tile_CCRC-S']) {
            const { roadEnds } = refsOf(id);
            expect(roadEnds).toHaveLength(1);
            expect(Math.abs(roadEnds[0].point[0]) < 3).toBe(true);
            expect(roadEnds[0].point[1] > 0).toBe(true);
            expect(roadEnds[0].dir[1] < -0.8).toBe(true);
        }
    });

    it('у остальных тайлов с городом и дорогой тупиков в город нет', () => {
        for (const id of ['tile_CFRR', 'tile_CRFR', 'tile_CRRC', 'tile_CRRC-S', 'tile_CRRF', 'tile_CRRR']) {
            expect(refsOf(id).roadEnds).toHaveLength(0);
        }
    });
});

describe('стены на реальных тайлах', () => {
    it('две шапки лицом к лицу замыкаются в «глаз»: один регион, одно кольцо, две угловые башни', () => {
        const cap = capTile();
        const board = [placed(cap, 0, 0, 0), placed(cap, 0, -1, 180)];
        const [region] = buildCityRegions(board);
        expect(buildCityRegions(board)).toHaveLength(1);
        expect(region.closed).toBe(true);
        expect(region.polygons[0]).toHaveLength(1);

        const [model] = buildCityWallModels(board, GEOMETRY_PARAMS.walls);
        expect(model.stats.towers).toBe(2);
        expect(model.stats.gates).toBe(0);
        expect(model.warnings).toEqual([]);
    });

    it('город CCRC с тремя шапками вокруг замыкается и получает одни ворота без предупреждений', () => {
        const cap = capTile();
        const board = [
            placed(tileById('tile_CCRC'), 0, 0, 0),
            placed(cap, 0, -1, 180),
            placed(cap, -1, 0, 90),
            placed(cap, 1, 0, 270),
        ];
        const [region] = buildCityRegions(board);
        expect(region.closed).toBe(true);
        expect(region.gates).toHaveLength(1);

        const [model] = buildCityWallModels(board, GEOMETRY_PARAMS.walls);
        expect(model.stats.gates).toBe(1);
        expect(model.stats.towers).toBe(6);
        expect(model.warnings).toEqual([]);
        expect(model.mesh.stats.triangles).toBeGreaterThan(0);
    });

    it('без одной из шапок город не замкнут и стен нет', () => {
        const cap = capTile();
        const board = [placed(tileById('tile_CCRC'), 0, 0, 0), placed(cap, 0, -1, 180), placed(cap, -1, 0, 90)];
        expect(buildCityRegions(board)[0].closed).toBe(false);
        expect(buildCityWallModels(board, GEOMETRY_PARAMS.walls)).toEqual([]);
    });
});
