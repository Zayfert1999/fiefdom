// packages/client/src/core/geometry/cityWalls.ts
// ============================================
// 🏰 СТЕНЫ ГОРОДОВ ДОСКИ: РЕГИОН → РАСКЛАДКА → МЕШ (с кэшем)
// ============================================
// Чистый модуль. Связывает cityRegions (контур, замкнутость, ворота),
// wallLayout (башни, ворота, зубцы) и wallMesh (буферы).
//
// Стены получают только ЗАМКНУТЫЕ города. В игре вызывающий код дополнительно
// передаёт `onlyFeatureKeys` — города, которые RegionManager считает завершёнными.
// ============================================
import { buildCityRegions, type CityRegionTile } from './cityRegions';
import type { TileMeshData } from './tileMesh';
import { layoutCityWalls } from './wallLayout';
import { buildWallMesh } from './wallMesh';
import { wallParamsKey, type WallParams } from './wallParams';

export interface CityWallModel {
    /** Наименьший ключ фичи города */
    readonly id: string;
    /** Ключи фич `col,row:featureId` (формат RegionManager) */
    readonly featureKeys: readonly string[];
    readonly signature: string;
    /** Один меш, группы wall/tower/gate/merlon; y отсчитывается от поверхности города */
    readonly mesh: TileMeshData;
    readonly stats: {
        readonly towers: number;
        readonly gates: number;
        readonly merlons: number;
        readonly runs: number;
    };
    /** Что не удалось разложить (для консоли и песочницы) */
    readonly warnings: readonly string[];
}

/** Кэш моделей: при постановке тайла перестраиваются только изменившиеся города */
export class CityWallCache {
    private readonly entries = new Map<string, CityWallModel | null>();

    has(key: string): boolean {
        return this.entries.has(key);
    }

    get(key: string): CityWallModel | null | undefined {
        return this.entries.get(key);
    }

    set(key: string, value: CityWallModel | null): void {
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

export interface BuildCityWallsOptions {
    /** Строить стены только для этих городов (ключи `col,row:featureId`) */
    readonly onlyFeatureKeys?: ReadonlySet<string>;
    readonly cache?: CityWallCache;
}

/**
 * Модели стен для всех замкнутых городов доски. Порядок детерминирован (по id).
 * Выключенные стены (`params.enabled === false`) дают пустой список.
 */
export function buildCityWallModels(
    tiles: readonly CityRegionTile[],
    params: WallParams,
    options: BuildCityWallsOptions = {}
): CityWallModel[] {
    const { onlyFeatureKeys, cache } = options;
    if (!params.enabled) {
        cache?.retain(new Set());
        return [];
    }

    const paramsKey = wallParamsKey(params);
    const used = new Set<string>();
    const result: CityWallModel[] = [];

    for (const region of buildCityRegions(tiles, onlyFeatureKeys)) {
        if (!region.closed) continue;

        const key = `${region.signature}|${paramsKey}`;
        used.add(key);

        let model = cache?.get(key);
        if (model === undefined) {
            const layout = layoutCityWalls(region, params);
            const mesh = buildWallMesh(layout, params);
            model = mesh
                ? {
                    id: region.id,
                    featureKeys: region.featureKeys,
                    signature: region.signature,
                    mesh,
                    stats: {
                        towers: layout.towers.length,
                        gates: layout.gates.length,
                        merlons: layout.merlons.length,
                        runs: layout.runs.length,
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
