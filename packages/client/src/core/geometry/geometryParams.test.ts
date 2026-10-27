// packages/client/src/core/geometry/geometryParams.test.ts
// ============================================
// 🧪 ТЕСТЫ ПАРАМЕТРОВ ГЕОМЕТРИИ
// ============================================
// Проверяют сам файл geometryParams.json (чтобы после правок из песочницы он
// не ломался) и то, что параметры «по типу фичи» и «по тайлу» реально доходят
// до геометрии, а кэш бандлов не путает тайлы и не сбрасывается зря.
// ============================================
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import rawParams from './geometryParams.json';
import { GEOMETRY_PARAMS, GEOMETRY_PARAMS_WARNINGS } from './loadedGeometryParams';
import {
    DEFAULT_GEOMETRY_PARAMS,
    cloneGeometryParams,
    hashGeometryParams,
    parseGeometryParams,
    resolveGeometryParams,
    resolveTileParams,
    serializeGeometryParams,
    type GeometryParams,
} from './geometryParams';
import { auditTile, type AuditTile } from './geometryAudit';
import { clearTileBundleCache, getTileBundle, tileBundleCacheStats } from './geometryBundleCache';

const tiles = (baseData as unknown as { tiles: AuditTile[] }).tiles;
const tileById = (id: string): AuditTile => tiles.find((t) => t.id === id)!;

const signature = (id: string, params: GeometryParams): string =>
    auditTile(tileById(id), { geometryParams: params, overwrite: true }).signature;

/** Копия закоммиченных параметров с правками (секции дополняются, а не заменяются) */
const withChanges = (changes: Parameters<typeof resolveGeometryParams>[0] = {}): GeometryParams =>
    resolveGeometryParams({
        generation: { ...GEOMETRY_PARAMS.generation, ...changes.generation },
        tessellation: { ...GEOMETRY_PARAMS.tessellation, ...changes.tessellation },
        noise: { ...GEOMETRY_PARAMS.noise, ...changes.noise },
        plaza: { ...GEOMETRY_PARAMS.plaza, ...changes.plaza },
        mesh: {
            ...GEOMETRY_PARAMS.mesh,
            ...changes.mesh,
            heights: { ...GEOMETRY_PARAMS.mesh.heights, ...changes.mesh?.heights },
            colors: { ...GEOMETRY_PARAMS.mesh.colors, ...changes.mesh?.colors },
        },
        noiseByType: changes.noiseByType ?? GEOMETRY_PARAMS.noiseByType,
        tiles: changes.tiles ?? GEOMETRY_PARAMS.tiles,
    });

// ============================================
// 📄 ФАЙЛ geometryParams.json
// ============================================
describe('geometryParams.json', () => {
    it('читается без замечаний', () => {
        expect(GEOMETRY_PARAMS_WARNINGS).toEqual([]);
    });

    it('записан в каноническом виде: все параметры на месте, порядок и формат как после сохранения из песочницы', () => {
        // Если тест упал (например, в код добавили новый параметр) — откройте песочницу
        // и нажмите «Сохранить»: файл дополнится и переформатируется сам
        const parsed = parseGeometryParams(rawParams).params;
        expect(JSON.stringify(rawParams, null, 2) + '\n').toBe(serializeGeometryParams(parsed));
    });

});

// ============================================
// 🔍 РАЗБОР
// ============================================
describe('parseGeometryParams', () => {
    it('пустой объект даёт значения по умолчанию', () => {
        expect(parseGeometryParams({ version: 1 }).params).toEqual(DEFAULT_GEOMETRY_PARAMS);
    });

    it('не-объект не роняет разбор', () => {
        const { params, warnings } = parseGeometryParams('мусор');
        expect(params).toEqual(DEFAULT_GEOMETRY_PARAMS);
        expect(warnings.length).toBeGreaterThan(0);
    });

    it('неизвестные ключи и неверные типы попадают в замечания и не ломают остальное', () => {
        const { params, warnings } = parseGeometryParams({
            version: 1,
            tessellation: { curveDensity: 'много', lolwut: 1, minRingPoints: 20 },
            bogus: {},
        });
        expect(warnings.some((w) => w.includes('tessellation.curveDensity'))).toBe(true);
        expect(warnings.some((w) => w.includes('tessellation.lolwut'))).toBe(true);
        expect(warnings.some((w) => w.includes('bogus'))).toBe(true);
        expect(params.tessellation.minRingPoints).toBe(20);
        expect(params.tessellation.curveDensity).toBe(DEFAULT_GEOMETRY_PARAMS.tessellation.curveDensity);
    });

    it('значения вне диапазона обрезаются и об этом сообщается', () => {
        const { params, warnings } = parseGeometryParams({
            version: 1,
            noise: { octaves: 99, edgeFadeCurve: 'зигзаг' },
            tessellation: { curveDensity: -5 },
        });
        expect(params.noise.octaves).toBe(8);
        expect(params.tessellation.curveDensity).toBeGreaterThan(0);
        expect(warnings.some((w) => w.includes('noise.octaves'))).toBe(true);
        expect(warnings.some((w) => w.includes('edgeFadeCurve'))).toBe(true);
        expect(params.noise.edgeFadeCurve).toBe(DEFAULT_GEOMETRY_PARAMS.noise.edgeFadeCurve);
    });

    it('неверный цвет меша отбрасывается', () => {
        const { params, warnings } = parseGeometryParams({ version: 1, mesh: { colors: { road: 'красный' } } });
        expect(warnings.some((w) => w.includes('mesh.colors.road'))).toBe(true);
        expect(params.mesh.colors.road).toBe(DEFAULT_GEOMETRY_PARAMS.mesh.colors.road);
    });

    it('другая версия формата даёт предупреждение', () => {
        expect(parseGeometryParams({ version: 2 }).warnings.some((w) => w.includes('version'))).toBe(true);
    });

    it('сериализация и разбор обратимы, в том числе для настроек по типу и по тайлу', () => {
        const params = resolveGeometryParams({
            generation: { overwrite: true, roadWidth: 24 },
            noise: { areaAmplitude: 3.5 },
            noiseByType: { monastery: { areaAmplitude: 1, areaFrequency: 0.09 } },
            mesh: { heights: { road: 3 }, colors: { city: '#112233' } },
            tiles: { tile_CCFC: { seed: 'другой', noise: { areaAmplitude: 6 } } },
        });
        const roundTrip = parseGeometryParams(JSON.parse(serializeGeometryParams(params)));
        expect(roundTrip.warnings).toEqual([]);
        expect(roundTrip.params).toEqual(params);
    });
});

// ============================================
// #️⃣ ХЭШ
// ============================================
describe('hashGeometryParams', () => {
    it('не зависит от порядка ключей во входном JSON', () => {
        const a = parseGeometryParams({ version: 1, plaza: { depth: 30, cornerRadius: 9 } }).params;
        const b = parseGeometryParams({ plaza: { cornerRadius: 9, depth: 30 }, version: 1 }).params;
        expect(hashGeometryParams(a)).toBe(hashGeometryParams(b));
    });

    it('меняется при правке любого параметра', () => {
        const base = hashGeometryParams(GEOMETRY_PARAMS);
        expect(hashGeometryParams(withChanges({ noise: { areaAmplitude: 3.1 } }))).not.toBe(base);
        expect(hashGeometryParams(withChanges({ plaza: { depth: 31 } }))).not.toBe(base);
        expect(hashGeometryParams(withChanges({ mesh: { baseHeight: 5 } }))).not.toBe(base);
    });

    it('хэш тайла не зависит от настроек других тайлов', () => {
        const base = withChanges({ tiles: { tile_CCFC: { seed: 'a' } } });
        const otherEdited = withChanges({ tiles: { tile_CCFC: { seed: 'a' }, tile_CFCF: { seed: 'b' } } });
        const selfEdited = withChanges({ tiles: { tile_CCFC: { seed: 'z' } } });

        expect(hashGeometryParams(otherEdited, 'tile_CCFC')).toBe(hashGeometryParams(base, 'tile_CCFC'));
        expect(hashGeometryParams(selfEdited, 'tile_CCFC')).not.toBe(hashGeometryParams(base, 'tile_CCFC'));
        // общий хэш при этом меняется
        expect(hashGeometryParams(otherEdited)).not.toBe(hashGeometryParams(base));
    });
});

// ============================================
// 🎯 ПАРАМЕТРЫ ТАЙЛА
// ============================================
describe('resolveTileParams', () => {
    it('без настроек тайла возвращает общие', () => {
        const resolved = resolveTileParams(GEOMETRY_PARAMS, 'tile_CCFC');
        expect(resolved.seed).toBeUndefined();
        expect(resolved.noise).toEqual(GEOMETRY_PARAMS.noise);
    });

    it('настройки тайла накладываются на общие', () => {
        const params = withChanges({ tiles: { tile_CCFC: { seed: 'pinned', noise: { areaAmplitude: 7 } } } });
        const resolved = resolveTileParams(params, 'tile_CCFC');
        expect(resolved.seed).toBe('pinned');
        expect(resolved.noise.areaAmplitude).toBe(7);
        expect(resolved.noise.lineAmplitude).toBe(params.noise.lineAmplitude);
    });
});

describe('параметры доходят до геометрии', () => {
    // CCFC — город с дугой (шум виден), FFFF-M — монастырь
    const CITY = 'tile_CCFC';
    const MONASTERY = 'tile_FFFF-M';

    it('seed тайла из tiles[artId] равен явному seedOverride и отличается от artId', () => {
        const pinned = withChanges({ tiles: { tile_CCFC: { seed: 'my-seed' } } });
        const viaParams = signature(CITY, pinned);
        const viaOverride = auditTile(tileById(CITY), {
            geometryParams: GEOMETRY_PARAMS,
            overwrite: true,
            seedOverride: 'my-seed',
        }).signature;

        expect(viaParams).toBe(viaOverride);
        expect(viaParams).not.toBe(signature(CITY, GEOMETRY_PARAMS));
    });

    it('настройки монастыря меняют только монастырь, не город', () => {
        const params = withChanges({ noiseByType: { monastery: { areaAmplitude: 9 } } });
        expect(signature(MONASTERY, params)).not.toBe(signature(MONASTERY, GEOMETRY_PARAMS));
        expect(signature(CITY, params)).toBe(signature(CITY, GEOMETRY_PARAMS));
    });

    it('настройки города меняют только город, не монастырь', () => {
        const params = withChanges({ noiseByType: { city: { areaAmplitude: 9 } } });
        expect(signature(CITY, params)).not.toBe(signature(CITY, GEOMETRY_PARAMS));
        expect(signature(MONASTERY, params)).toBe(signature(MONASTERY, GEOMETRY_PARAMS));
    });

    it('настройки дороги меняют дороги, но не города', () => {
        const params = withChanges({ noiseByType: { road: { lineAmplitude: 9 } } });
        expect(signature('tile_CRRC', params)).not.toBe(signature('tile_CRRC', GEOMETRY_PARAMS));
        expect(signature(CITY, params)).toBe(signature(CITY, GEOMETRY_PARAMS));
    });

    it('ширина дороги из generation.roadWidth доходит до геометрии', () => {
        const narrow = withChanges({ generation: { roadWidth: 12 } });
        expect(signature('tile_CRRC', narrow)).not.toBe(signature('tile_CRRC', GEOMETRY_PARAMS));
    });
});

// ============================================
// 🗄 КЭШ БАНДЛОВ
// ============================================
describe('кэш бандлов', () => {
    it('повторный запрос возвращает тот же объект, правка параметров тайла — новый', () => {
        clearTileBundleCache();
        const tile = tileById('tile_CCFC');

        const first = getTileBundle(tile, GEOMETRY_PARAMS);
        const second = getTileBundle(tile, cloneGeometryParams(GEOMETRY_PARAMS));
        expect(second).toBe(first);

        const edited = getTileBundle(tile, withChanges({ tiles: { tile_CCFC: { seed: 'x' } } }));
        expect(edited).not.toBe(first);

        const stats = tileBundleCacheStats();
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(2);
    });

    it('правка seed другого тайла не сбрасывает кэш этого тайла', () => {
        clearTileBundleCache();
        const tile = tileById('tile_CCFC');
        const first = getTileBundle(tile, GEOMETRY_PARAMS);
        const afterOtherEdit = getTileBundle(tile, withChanges({ tiles: { tile_CFCF: { seed: 'other' } } }));
        expect(afterOtherEdit).toBe(first);
    });

    it('правка параметров меша даёт новый бандл', () => {
        clearTileBundleCache();
        const tile = tileById('tile_CCFC');
        const first = getTileBundle(tile, GEOMETRY_PARAMS);
        const taller = getTileBundle(tile, withChanges({ mesh: { heights: { city: 6 } } }));
        expect(taller).not.toBe(first);
    });
});
