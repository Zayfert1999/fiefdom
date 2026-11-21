// packages/client/src/core/geometry/bundleToken.test.ts
// ============================================
// 🧪 ТЕСТЫ ТОКЕНА БАНДЛА И ИНВАЛИДАЦИИ КЭШЕЙ РЕГИОНОВ
// ============================================
import { describe, it, expect } from 'vitest';
import { bundleToken, geometryTileId } from './bundleToken';
import { buildFieldRegions, type FieldRegionTile } from './fieldRegions';
import { buildCityRegions } from './cityRegions';
import { CityWallCache, buildCityWallModels } from './cityWalls';
import { resolveWallParams } from './wallParams';
import { crossTiles } from './wallTestFixtures';

describe('bundleToken', () => {
    it('один объект — один токен, разные объекты — разные токены', () => {
        const a = {};
        const b = {};
        expect(bundleToken(a)).toBe(bundleToken(a));
        expect(bundleToken(a)).not.toBe(bundleToken(b));
    });

    it('geometryTileId сохраняет id тайла и добавляет токен', () => {
        const bundle = {};
        expect(geometryTileId('tile_CCRC', bundle)).toBe(`tile_CCRC~${bundleToken(bundle)}`);
    });
});

describe('смена геометрии тайла меняет подпись региона (и тем самым ключ кэша)', () => {
    const fieldTile = (bundle: object): FieldRegionTile => ({
        key: '0,0',
        col: 0,
        row: 0,
        rotation: 0,
        tileId: geometryTileId('tile_FFFF', bundle),
        fields: [{ featureId: 'f', polygon: [[[-50, -50], [50, -50], [50, 50], [-50, 50]]] }],
    });

    it('поля: пересобранный бандл даёт другую подпись, тот же бандл — прежнюю', () => {
        const before = {};
        const after = {};
        expect(buildFieldRegions([fieldTile(before)])[0].signature).toBe(buildFieldRegions([fieldTile(before)])[0].signature);
        expect(buildFieldRegions([fieldTile(after)])[0].signature).not.toBe(buildFieldRegions([fieldTile(before)])[0].signature);
    });

    it('стены: пересобранный бандл даёт другую подпись и новую модель вместо кэшированной', () => {
        const params = resolveWallParams();
        const cache = new CityWallCache();
        const withToken = (bundle: object) => crossTiles().map((tile) => ({ ...tile, tileId: geometryTileId(tile.tileId, bundle) }));

        const before = {};
        const first = buildCityWallModels(withToken(before), params, { cache });
        expect(buildCityWallModels(withToken(before), params, { cache })[0]).toBe(first[0]);

        const rebuilt = buildCityWallModels(withToken({}), params, { cache });
        expect(rebuilt[0]).not.toBe(first[0]);
        expect(buildCityRegions(withToken(before))[0].signature).not.toBe(rebuilt[0].signature);
    });
});
