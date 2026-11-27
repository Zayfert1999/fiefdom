// packages/client/src/core/geometry/cityTown.ts
// ============================================
// 🏘 ЗАСТРОЙКА ГОРОДОВ ДОСКИ: РЕГИОН → РАСКЛАДКА → МЕШ (с кэшем)
// ============================================
// Чистый модуль. Связывает cityRegions (контур, замкнутость, ворота),
// townGeometry (площадь, улицы, дома) и townMesh (буферы). Устроен так же, как cityWalls.ts.
//
// Застройку получают только ЗАМКНУТЫЕ города. В игре вызывающий код дополнительно
// передаёт `onlyFeatureKeys` — города, которые RegionManager считает завершёнными.
// ============================================
import { buildCityRegions, type CityRegionTile } from './cityRegions';
import { layoutCityTown } from './townGeometry';
import { buildTownMeshes, type TownMeshes } from './townMesh';
import { townParamsKey, type TownParams } from './townParams';

export interface CityTownModel {
    /** Наименьший ключ фичи города */
    readonly id: string;
    /** Ключи фич `col,row:featureId` (формат RegionManager) */
    readonly featureKeys: readonly string[];
    readonly signature: string;
    /** Площадь и улицы одним мешем, дома — частями роста; y отсчитывается от поверхности города */
    readonly meshes: TownMeshes;
    readonly stats: {
        readonly squares: number;
        readonly streets: number;
        readonly houses: number;
    };
    /** Что не удалось разложить (для консоли и песочницы) */
    readonly warnings: readonly string[];
}

/** Кэш моделей: при постановке тайла перестраиваются только изменившиеся города */
export class CityTownCache {
    private readonly entries = new Map<string, CityTownModel | null>();

    has(key: string): boolean {
        return this.entries.has(key);
    }

    get(key: string): CityTownModel | null | undefined {
        return this.entries.get(key);
    }

    set(key: string, value: CityTownModel | null): void {
        this.entries.set(key, value);
    }

    /** Забывает всё, чего нет в списке (город исчез или изменился) */
    retain(keys: ReadonlySet<string>): void {
        for (const key of this.entries.keys()) if (!keys.has(key)) this.entries.delete(key);
    }

    get size(): number {
        return this.entries.size;
    }
}

export interface BuildCityTownOptions {
    /** Строить застройку только для этих городов (ключи `col,row:featureId`) */
    readonly onlyFeatureKeys?: ReadonlySet<string>;
    readonly cache?: CityTownCache;
}

/**
 * Модели застройки для всех замкнутых городов доски. Порядок детерминирован (по id).
 * Выключенная застройка (`params.enabled === false`) даёт пустой список.
 */
export function buildCityTownModels(
    tiles: readonly CityRegionTile[],
    params: TownParams,
    options: BuildCityTownOptions = {}
): CityTownModel[] {
    const { onlyFeatureKeys, cache } = options;
    if (!params.enabled) {
        cache?.retain(new Set());
        return [];
    }

    const paramsKey = townParamsKey(params);
    const used = new Set<string>();
    const result: CityTownModel[] = [];

    for (const region of buildCityRegions(tiles, onlyFeatureKeys)) {
        if (!region.closed) continue;

        const key = `${region.signature}|${paramsKey}`;
        used.add(key);

        let model = cache?.get(key);
        if (model === undefined) {
            const layout = layoutCityTown(region, params);
            const meshes = buildTownMeshes(layout, params);
            model = meshes
                ? {
                    id: region.id,
                    featureKeys: region.featureKeys,
                    signature: region.signature,
                    meshes,
                    stats: {
                        squares: layout.squares.length,
                        streets: layout.streets.length,
                        houses: layout.houses.length,
                    },
                    warnings: layout.warnings,
                }
                : null;
            cache?.set(key, model);
        }
        if (model) result.push(model);
    }

    cache?.retain(used);
    return result;
}
