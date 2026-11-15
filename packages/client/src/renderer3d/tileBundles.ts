// packages/client/src/renderer3d/tileBundles.ts
// ============================================
// 🗄 БАНДЛЫ ТАЙЛОВ ДЛЯ ИГРОВОЙ ДОСКИ
// ============================================
// Игра хранит тайлы как PlacedTile (templateId + поворот). Меш строится из
// процедурной геометрии НЕповёрнутого тайла, поворот — в матрице инстанса.
// Бандл (полигоны + меш + споты) детерминирован и кэшируется в
// geometryBundleCache, поэтому на всех клиентах тайл выглядит одинаково.
//
// Три вещи сверх кэша:
//   • getBundle       — бандл по id шаблона (с защитой от ошибок геометрии);
//   • getSolidMesh    — «сплошной» меш с боковыми стенами для одиночных
//                       тайлов (превью, анимация падения);
//   • prewarmBundles  — прогрев кэша в простое, чтобы первый тайл в руке
//                       не подвешивал кадр построением геометрии.
// ============================================
import { TILE_DEFINITIONS } from '@fiefdom/shared/core/tileData';
import type { Tile } from '@fiefdom/shared/core/types';
import { getTileBundle } from '@/core/geometry/geometryBundleCache';
import { GEOMETRY_PARAMS } from '@/core/geometry/loadedGeometryParams';
import {
  buildTileMesh,
  resolveMeshParams,
  type MeshParams,
  type TileBundle,
  type TileMeshData,
} from '@/core/geometry/tileMesh';

/** Итоговые параметры меша (высоты, цвета) из geometryParams.json */
export const BOARD_MESH_PARAMS: Readonly<MeshParams> = resolveMeshParams(GEOMETRY_PARAMS.mesh);

const definitions = new Map<string, Tile>(TILE_DEFINITIONS.map((def) => [def.id, def]));
const failed = new Set<string>();

/** Описание тайла из данных (неповёрнутое) */
export const getTileDefinition = (templateId: string): Tile | undefined => definitions.get(templateId);

/** Бандл тайла; null, если шаблона нет или геометрия не построилась */
export function getBundle(templateId: string): TileBundle | null {
  const def = definitions.get(templateId);
  if (!def || failed.has(templateId)) return null;

  try {
    return getTileBundle(def, GEOMETRY_PARAMS);
  } catch (error) {
    // Один сломанный тайл не должен ронять всю доску
    failed.add(templateId);
    console.error(`❌ [tileBundles] Не удалось построить геометрию тайла ${templateId}:`, error);
    return null;
  }
}

// ============================================
// 🧊 СПЛОШНОЙ МЕШ (с боковыми стенами)
// ============================================
const solidMeshes = new WeakMap<TileBundle, TileMeshData>();

/**
 * Меш тайла с боковыми стенами и подложкой: выглядит цельным блоком
 * при взгляде сбоку. Нужен одиночным тайлам (превью, падение) — на доске
 * стены на стыках скрыты соседями и не строятся.
 */
export function getSolidMesh(bundle: TileBundle): TileMeshData {
  const cached = solidMeshes.get(bundle);
  if (cached) return cached;

  const mesh = buildTileMesh(bundle.geometry, bundle.features, {
    ...GEOMETRY_PARAMS.mesh,
    boundaryWalls: true,
  });
  solidMeshes.set(bundle, mesh);
  return mesh;
}

// ============================================
// 🔥 ПРОГРЕВ
// ============================================
type IdleHandle = number;

const requestIdle = (callback: () => void): IdleHandle => {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 500 });
  }
  return window.setTimeout(callback, 16);
};

const cancelIdle = (handle: IdleHandle): void => {
  if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
};

/**
 * Строит бандлы всех тайлов набора по одному за «простой» браузера.
 * Возвращает функцию отмены.
 */
export function prewarmBundles(templateIds?: readonly string[]): () => void {
  const queue = [...(templateIds ?? TILE_DEFINITIONS.map((def) => def.id))];
  let handle: IdleHandle | null = null;
  let cancelled = false;

  const step = (): void => {
    handle = null;
    if (cancelled) return;
    const next = queue.shift();
    if (next === undefined) return;
    getBundle(next);
    if (queue.length > 0) handle = requestIdle(step);
  };

  handle = requestIdle(step);
  return () => {
    cancelled = true;
    if (handle !== null) cancelIdle(handle);
  };
}
