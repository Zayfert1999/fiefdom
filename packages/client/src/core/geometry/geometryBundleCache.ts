// packages/client/src/core/geometry/geometryBundleCache.ts
// ============================================
// 🗄 КЭШ БАНДЛОВ ТАЙЛОВ
// ============================================
// Геометрия тайла детерминирована: одинаковые тайл и параметры дают
// один и тот же результат. Поэтому бандл (полигоны + меш) считается один раз
// и переиспользуется всеми клетками с этим тайлом.
//
// Ключ: tile.id + хэш параметров, относящихся к этому тайлу
// (правка seed ДРУГОГО тайла этот ключ не меняет).
// ============================================
import { auditTile, type AuditTile } from './geometryAudit';
import { hashGeometryParams, type GeometryParams } from './geometryParams';
import { buildTileBundle, type TileBundle } from './tileMesh';

const MAX_ENTRIES = 256;

const cache = new Map<string, TileBundle>();
let hits = 0;
let misses = 0;

export function tileBundleCacheKey(tile: AuditTile, params: GeometryParams): string {
    return `${tile.id}|${hashGeometryParams(params, tile.artId ?? tile.id)}`;
}

/** Бандл тайла из кэша или построенный заново */
export function getTileBundle(tile: AuditTile, params: GeometryParams): TileBundle {
    const key = tileBundleCacheKey(tile, params);

    const cached = cache.get(key);
    if (cached) {
        hits++;
        return cached;
    }

    misses++;
    const audit = auditTile(tile, { geometryParams: params });
    const bundle = buildTileBundle(
        { tileId: audit.tileId, artId: audit.artId, features: audit.features, geometry: audit.geometry },
        params.mesh
    );

    // Простое вытеснение самых старых записей
    if (cache.size >= MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, bundle);
    return bundle;
}

export function clearTileBundleCache(): void {
    cache.clear();
    hits = 0;
    misses = 0;
}

export function tileBundleCacheStats(): { size: number; hits: number; misses: number } {
    return { size: cache.size, hits, misses };
}
