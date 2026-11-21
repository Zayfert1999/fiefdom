// packages/client/src/core/geometry/fieldRegions.ts
// ============================================
// 🌿 РЕГИОНЫ ПОЛЕЙ НА ДОСКЕ: ОДИН ПОЛИГОН И ОДИН МЕШ НА РЕГИОН
// ============================================
// Чистый модуль (без three, React и clipper).
//
// 🌟 ЗАЧЕМ
//   Поля соседних тайлов — части одного региона. Если строить мех каждого тайла отдельно,
//   на стыках будут швы: свои вершины, свои нормали, затухание у дорог считается обрезанно.
//   Здесь поля одного региона сшиваются в общий полигон (с дырками), по которому строится
//   ОДИН меш с ОДНОЙ группой. Рельеф при этом — мировой шум (terrain.ts), поэтому все регионы
//   выглядят однородно.
//
// 🧵 КАК СШИВАЮТСЯ ПОЛИГОНЫ (ядро вынесено в regionStitch.ts; без булевых операций, вершины остаются точными)
//   1. Полигоны полей переводятся в мировые координаты (поворот и сдвиг тайла),
//      обход колец нормализуется: внешние против часовой, дырки по часовой (внутренность слева).
//   2. Рёбра на линиях сетки доски режутся в точках всех вершин, лежащих на той же линии
//      (чтобы рёбра соседей, у которых вершины стоят по-разному, всё равно совпали).
//   3. Ребро A→B и ребро B→A у разных полигонов — это шов: оба рёбра отбрасываются,
//      а полигоны объединяются в один регион (union-find).
//   4. Из оставшихся рёбер региона собираются кольца: в каждой вершине берётся самый «левый»
//      поворот, поэтому касания в одной точке не склеивают кольца в восьмёрку.
//   5. Кольца делятся на внешние и дырки; дырка достаётся внешнему кольцу, которое её содержит.
//
// 🔑 Идентификатор региона — наименьший ключ фичи `col,row:featureId` (формат RegionManager).
//    Подпись региона (signature) меняется при любом изменении состава, поворота или бандла тайла —
//    по ней кэшируются меши: при постановке тайла перестраиваются только затронутые регионы.
// ============================================
import type { Polygon } from '@fiefdom/shared/core/geometry.types';
import { pointInPolygon } from './geometryPointInPolygon';
import {
    BOARD_TILE_SIZE,
    normalizeWorldPolygon,
    stitchItems,
    tileToWorld,
    worldToTile,
    type StitchItem,
} from './regionStitch';
import {
    buildFieldRegionMesh,
    resolveMeshParams,
    type FieldPolygonRef,
    type MeshParamsInput,
    type TileMeshData,
} from './tileMesh';

// Преобразования клетка ↔ мир живут в regionStitch.ts; реэкспорт сохраняет прежние импорты
export { BOARD_TILE_SIZE, tileToWorld, worldToTile };

// ============================================
// 🧩 ТИПЫ
// ============================================

/** Тайл на доске с его полями (из TileBundle.fieldPolygons) */
export interface FieldRegionTile {
    /** Уникальный ключ клетки (для подписи) */
    readonly key: string;
    readonly col: number;
    readonly row: number;
    /** Поворот по часовой стрелке, градусы */
    readonly rotation: number;
    /** id бандла: разные бандлы в одной клетке — разные регионы */
    readonly tileId: string;
    readonly fields: readonly FieldPolygonRef[];
}

export interface FieldRegion {
    /** Наименьший ключ фичи региона */
    readonly id: string;
    /** Ключи фич `col,row:featureId` (формат RegionManager) */
    readonly featureKeys: readonly string[];
    /** Объединённые полигоны в мировых координатах: [внешнее кольцо, ...дырки] */
    readonly polygons: readonly Polygon[];
    /** Подпись состава: меняется при любом изменении региона */
    readonly signature: string;
}

// ============================================

/**
 * Собирает регионы полей доски: поля соседних тайлов, сходящиеся по общему шву, — один регион.
 * Тайлы без полей пропускаются. Порядок регионов детерминирован (по id).
 */
export function buildFieldRegions(tiles: readonly FieldRegionTile[]): FieldRegion[] {
    interface Item extends StitchItem {
        readonly key: string;
        readonly tile: FieldRegionTile;
    }

    // Полигоны в мировых координатах, внутренность слева от рёбер
    const items: Item[] = [];
    for (const tile of tiles) {
        for (const field of tile.fields) {
            const rings = normalizeWorldPolygon(field.polygon, (x, z) =>
                tileToWorld(tile.col, tile.row, tile.rotation, x, z)
            );
            if (!rings) continue;
            items.push({ key: `${tile.col},${tile.row}:${field.featureId}`, tile, rings });
        }
    }

    const regions: FieldRegion[] = [];
    for (const group of stitchItems(items)) {
        const { members, polygons } = group;
        if (polygons.length === 0) continue;

        const featureKeys = members.map((i) => items[i].key).sort();
        const signature = members
            .map((i) => `${items[i].key}@${items[i].tile.rotation}#${items[i].tile.tileId}`)
            .sort()
            .join(';');
        regions.push({ id: featureKeys[0], featureKeys, polygons, signature });
    }
    return regions.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}


// ============================================
// 🧊 МЕШИ РЕГИОНОВ
// ============================================

export interface FieldRegionMesh {
    readonly id: string;
    readonly featureKeys: readonly string[];
    readonly signature: string;
    /** Один меш, одна группа (featureId = id региона, surface = 'field'), мировые координаты */
    readonly mesh: TileMeshData;
}

/** Кэш мешей регионов: при постановке тайла перестраиваются только изменившиеся регионы */
export class FieldRegionMeshCache {
    private readonly entries = new Map<string, FieldRegionMesh>();

    get(key: string): FieldRegionMesh | undefined {
        return this.entries.get(key);
    }

    set(key: string, value: FieldRegionMesh): void {
        this.entries.set(key, value);
    }

    /** Забывает всё, чего нет в списке (регион исчез или изменился) */
    retain(keys: ReadonlySet<string>): void {
        for (const key of this.entries.keys()) if (!keys.has(key)) this.entries.delete(key);
    }

    get size(): number {
        return this.entries.size;
    }
}

/**
 * Регионы полей доски → меши. С кэшем перестраиваются только изменившиеся регионы.
 * Параметры берутся как у тайловых мешей (mesh.terrain, цвета, высоты).
 */
export function buildFieldRegionMeshes(
    tiles: readonly FieldRegionTile[],
    params?: MeshParamsInput,
    cache?: FieldRegionMeshCache
): FieldRegionMesh[] {
    const paramsKey = JSON.stringify(resolveMeshParams(params));
    const used = new Set<string>();
    const result: FieldRegionMesh[] = [];

    for (const region of buildFieldRegions(tiles)) {
        const key = `${region.signature}|${paramsKey}`;
        used.add(key);

        let entry = cache?.get(key);
        if (!entry) {
            entry = {
                id: region.id,
                featureKeys: region.featureKeys,
                signature: region.signature,
                mesh: buildFieldRegionMesh(region.polygons, region.id, params),
            };
            cache?.set(key, entry);
        }
        result.push(entry);
    }

    cache?.retain(used);
    return result;
}

// ============================================
// 🎯 КАКАЯ ФИЧА ПОД ТОЧКОЙ
// ============================================

export interface LocatedFieldFeature {
    readonly col: number;
    readonly row: number;
    readonly featureId: string;
    /** `col,row:featureId` */
    readonly featureKey: string;
}

/**
 * Какое поле (фича конкретного тайла) региона лежит под мировой точкой.
 * Для hover/клика по общему мешу региона: меш знает только регион, а игре нужна фича тайла.
 */
export function locateFieldFeature(
    region: Pick<FieldRegionMesh, 'featureKeys'>,
    tiles: readonly FieldRegionTile[],
    worldX: number,
    worldZ: number
): LocatedFieldFeature | null {
    const col = Math.round(worldX / BOARD_TILE_SIZE);
    const row = Math.round(worldZ / BOARD_TILE_SIZE);
    const tile = tiles.find((t) => t.col === col && t.row === row);
    if (!tile) return null;

    const local = worldToTile(tile.col, tile.row, tile.rotation, worldX, worldZ);
    for (const field of tile.fields) {
        const featureKey = `${tile.col},${tile.row}:${field.featureId}`;
        if (!region.featureKeys.includes(featureKey)) continue;
        if (pointInPolygon(local, field.polygon)) return { col, row, featureId: field.featureId, featureKey };
    }
    return null;
}
