// packages/client/src/renderer3d/cityWalls.ts
// ============================================
// 🏰 ГОРОДСКИЕ СТЕНЫ ИГРОВОЙ ДОСКИ
// ============================================
// Какие города обносятся стеной и что для этого строить. Модуль не зависит от React и three
// (как fieldTerrain.ts): чистая геометрия живёт в core/geometry/cityWalls.ts.
//
// Стена нужна городу, который:
//   1. завершён по RegionManager (isComplete, тип city) — игровое правило;
//   2. замкнут геометрически (контур нигде не упирается в край клетки без соседа) —
//      страховка: в конце партии RegionManager помечает завершёнными и недостроенные города,
//      стен у них быть не должно.
//
// Когда стены показываются и как растут — решает слой (CityWallsLayer3D): здесь только данные.
// ============================================
import type { RegionManager } from '@fiefdom/shared/core/regionManager';
import type { PlacedTile } from '@fiefdom/shared/core/types';
import { getCityRefs, type CityRegionTile } from '@/core/geometry/cityRegions';
import { CityWallCache, buildCityWallModels, type CityWallModel } from '@/core/geometry/cityWalls';
import { GEOMETRY_PARAMS } from '@/core/geometry/loadedGeometryParams';
import { BOARD_MESH_PARAMS, getBundle } from './tileBundles';

/** Параметры стен из geometryParams.json (секция walls) */
export const WALL_PARAMS = GEOMETRY_PARAMS.walls;

/** Высота поверхности города: от неё вверх растёт стена (меш стены построен от нуля) */
export const WALL_BASE_Y: number = BOARD_MESH_PARAMS.baseHeight + BOARD_MESH_PARAMS.heights.city;

export interface BoardCityWall {
  /** Корень региона в RegionManager: по нему слой находит анимацию завершения */
  readonly rootKey: string;
  readonly model: CityWallModel;
}

const NO_WALLS: readonly BoardCityWall[] = [];
const cache = new CityWallCache();
const results = new WeakMap<RegionManager, WeakMap<ReadonlyMap<string, PlacedTile>, readonly BoardCityWall[]>>();

function compute(board: ReadonlyMap<string, PlacedTile>, regionManager: RegionManager): readonly BoardCityWall[] {
  if (!WALL_PARAMS.enabled) return NO_WALLS;

  // 1) Завершённые города: ключи фич `x,y:featureId`, как в RegionManager
  const complete = new Set<string>();
  const perTile: { tile: PlacedTile; refs: ReturnType<typeof getCityRefs> }[] = [];
  for (const tile of board.values()) {
    const bundle = getBundle(tile.templateId);
    if (!bundle) continue;
    const refs = getCityRefs(bundle);
    if (refs.cities.length === 0) continue;
    perTile.push({ tile, refs });
    for (const city of refs.cities) {
      const key = `${tile.x},${tile.y}:${city.featureId}`;
      const meta = regionManager.getMetadata(key);
      if (meta?.isComplete && meta.type === 'city') complete.add(key);
    }
  }
  if (complete.size === 0) {
    cache.retain(new Set());
    return NO_WALLS;
  }

  // 2) Геометрия: только тайлы завершённых городов; замкнутость проверяет buildCityWallModels
  const tiles: CityRegionTile[] = [];
  for (const { tile, refs } of perTile) {
    if (!refs.cities.some((city) => complete.has(`${tile.x},${tile.y}:${city.featureId}`))) continue;
    tiles.push({
      key: `${tile.x},${tile.y}`,
      col: tile.x,
      row: tile.y,
      rotation: tile.rotation,
      tileId: tile.templateId,
      cities: refs.cities,
      roadEnds: refs.roadEnds,
    });
  }

  const walls: BoardCityWall[] = [];
  for (const model of buildCityWallModels(tiles, WALL_PARAMS, { onlyFeatureKeys: complete, cache })) {
    for (const warning of model.warnings) console.warn(`⚠️ [cityWalls] ${model.id}: ${warning}`);
    walls.push({ rootKey: regionManager.find(model.featureKeys[0]) ?? model.id, model });
  }
  return walls;
}

/**
 * Стены завершённых городов текущей доски. Результат кэшируется по (regionManager, board),
 * а меши — по составу города и параметрам: при новом ходе перестраиваются только изменившиеся города.
 */
export function getBoardCityWalls(
  board: ReadonlyMap<string, PlacedTile>,
  regionManager: RegionManager
): readonly BoardCityWall[] {
  let perBoard = results.get(regionManager);
  if (!perBoard) {
    perBoard = new WeakMap();
    results.set(regionManager, perBoard);
  }
  let walls = perBoard.get(board);
  if (!walls) {
    walls = compute(board, regionManager);
    perBoard.set(board, walls);
  }
  return walls;
}
