// packages/client/src/renderer3d/fieldTerrain.ts
// ============================================
// ⛰️ ПОЛЯ ДОСКИ: ОБЩИЕ МЕШИ РЕГИОНОВ С РЕЛЬЕФОМ
// ============================================
// Когда включён mesh.terrain (geometryParams.json), бандлы тайлов строятся БЕЗ полей
// (TileBundle.fieldsOmitted), а поля соседних тайлов сшиваются в общие меши регионов
// (core/geometry/fieldRegions.ts): один меш на регион, высота — мировой шум, затухающий
// у дорог и городов. Так же устроен Board3D песочницы; здесь то же самое для игровой доски.
//
// Модуль не зависит от React и three:
//   • getBoardFieldTerrain — регионы по состоянию доски (кэш по identity доски и по подписи
//     региона: при постановке тайла перестраиваются только затронутые регионы);
//   • fieldSurfaceY        — высота поверхности поля в мировой точке (мипл на холме).
//
// Тайл, у которого идёт анимация падения (skipTileKey), в регионы не входит: он рисуется
// отдельно плоским, а регионы пересобираются, когда анимация закончилась.
// ============================================
import type { PlacedTile } from '@fiefdom/shared/core/types';
import {
  FieldRegionMeshCache,
  buildFieldRegionMeshes,
  type FieldRegionMesh,
  type FieldRegionTile,
} from '@/core/geometry/fieldRegions';
import { sampleMeshHeight, type TileMeshData } from '@/core/geometry/tileMesh';
import { getBundle } from './tileBundles';

export interface BoardFieldTerrain {
  /**
   * Тайлы, из которых собраны регионы. null — поля плоские и лежат в мешах тайлов
   * (рельеф выключен или не все бандлы построены без полей).
   */
  readonly tiles: readonly FieldRegionTile[] | null;
  readonly regions: readonly FieldRegionMesh[];
}

const FLAT: BoardFieldTerrain = { tiles: null, regions: [] };

const meshCache = new FieldRegionMeshCache();
const results = new WeakMap<ReadonlyMap<string, PlacedTile>, Map<string, BoardFieldTerrain>>();

function compute(board: ReadonlyMap<string, PlacedTile>, skipTileKey: string | null): BoardFieldTerrain {
  const tiles: FieldRegionTile[] = [];
  let firstBundle: ReturnType<typeof getBundle> = null;

  for (const tile of board.values()) {
    const key = `${tile.x},${tile.y}`;
    if (key === skipTileKey) continue;

    const bundle = getBundle(tile.templateId);
    if (!bundle) continue;
    // Поля региональными мешами — только если ВСЕ бандлы без полей (иначе поля задвоились бы)
    if (!bundle.fieldsOmitted) return FLAT;

    firstBundle ??= bundle;
    tiles.push({
      key,
      col: tile.x,
      row: tile.y,
      rotation: tile.rotation,
      tileId: tile.templateId,
      fields: bundle.fieldPolygons,
    });
  }

  if (!firstBundle) return { tiles, regions: [] };
  return { tiles, regions: buildFieldRegionMeshes(tiles, firstBundle.meshParams, meshCache) };
}

/** Регионы полей для текущей доски (результат кэшируется: можно звать из многих компонентов) */
export function getBoardFieldTerrain(
  board: ReadonlyMap<string, PlacedTile>,
  skipTileKey: string | null
): BoardFieldTerrain {
  let perBoard = results.get(board);
  if (!perBoard) {
    perBoard = new Map();
    results.set(board, perBoard);
  }

  const cacheKey = skipTileKey ?? '';
  let result = perBoard.get(cacheKey);
  if (!result) {
    result = compute(board, skipTileKey);
    perBoard.set(cacheKey, result);
  }
  return result;
}

// ============================================
// 📏 ВЫСОТА ПОЛЯ В ТОЧКЕ
// ============================================
interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const boundsCache = new WeakMap<TileMeshData, Bounds>();

function meshBounds(mesh: TileMeshData): Bounds {
  const cached = boundsCache.get(mesh);
  if (cached) return cached;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]);
    maxX = Math.max(maxX, p[i]);
    minZ = Math.min(minZ, p[i + 2]);
    maxZ = Math.max(maxZ, p[i + 2]);
  }
  const bounds = { minX, maxX, minZ, maxZ };
  boundsCache.set(mesh, bounds);
  return bounds;
}

/**
 * Высота верха поля в мировой точке (x, z) или null, если точка не над регионом.
 * Перебор линейный по треугольникам региона — звать для единиц точек (миплы), не для тысяч.
 */
export function fieldSurfaceY(terrain: BoardFieldTerrain, worldX: number, worldZ: number): number | null {
  for (const region of terrain.regions) {
    const b = meshBounds(region.mesh);
    if (worldX < b.minX || worldX > b.maxX || worldZ < b.minZ || worldZ > b.maxZ) continue;
    const y = sampleMeshHeight(region.mesh, worldX, worldZ);
    if (y !== null) return y;
  }
  return null;
}
