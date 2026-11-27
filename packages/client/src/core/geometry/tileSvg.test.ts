// packages/client/src/core/geometry/tileSvg.test.ts
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import type { Tile } from '@fiefdom/shared/core/types';
import { GEOMETRY_PARAMS } from './loadedGeometryParams';
import { getTileBundle } from './geometryBundleCache';
import { buildTileSvgModel } from './tileSvg';

const tiles = (baseData as unknown as { tiles: Tile[] }).tiles;

describe('2D-модель тайла (tileSvg)', () => {
    it.each(tiles.map((tile) => tile.id))('%s: есть контуры, пути не пустые', (id) => {
        const tile = tiles.find((t) => t.id === id)!;
        const model = buildTileSvgModel(getTileBundle(tile, GEOMETRY_PARAMS), tile);

        expect(model.layers.length).toBeGreaterThan(0);
        for (const layer of model.layers) {
            expect(layer.d.startsWith('M')).toBe(true);
            expect(layer.d).not.toContain('NaN');
        }
    });

    it('щит есть ровно у тайлов, где в данных задан shieldSpot, и лежит внутри тайла', () => {
        for (const tile of tiles) {
            const expected = tile.features.filter((f) => f.shieldSpot).length;
            const model = buildTileSvgModel(getTileBundle(tile, GEOMETRY_PARAMS), tile);

            expect(model.shields.length).toBe(expected);
            for (const shield of model.shields) {
                expect(Math.abs(shield.x)).toBeLessThanOrEqual(50);
                expect(Math.abs(shield.y)).toBeLessThanOrEqual(50);
            }
        }
    });

    it('слои идут от полей к городам: поле никогда не рисуется поверх города', () => {
        const rank = { field: 0, road: 1, city: 2, monastery: 2, plaza: 3 } as const;
        for (const tile of tiles) {
            const model = buildTileSvgModel(getTileBundle(tile, GEOMETRY_PARAMS), tile);
            const ranks = model.layers.map((layer) => rank[layer.kind]);
            expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
        }
    });

    it('без описания тайла щитов нет', () => {
        const tile = tiles.find((t) => t.features.some((f) => f.shieldSpot))!;
        const model = buildTileSvgModel(getTileBundle(tile, GEOMETRY_PARAMS));
        expect(model.shields).toEqual([]);
    });
});
