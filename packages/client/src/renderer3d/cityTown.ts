// packages/client/src/renderer3d/cityTown.ts
// ============================================
// 🏘 ЗАСТРОЙКА ЗАВЕРШЁННЫХ ГОРОДОВ ИГРОВОЙ ДОСКИ
// ============================================
// Какие города получают площадь, улицы и дома. Модуль не зависит от React и three
// (как cityWalls.ts): чистая геометрия живёт в core/geometry/cityTown.ts.
//
// Застройка нужна городу, который:
//   1. завершён по RegionManager (isComplete, тип city) — игровое правило;
//   2. замкнут геометрически — страховка: в конце партии RegionManager помечает завершёнными
//      и недостроенные города, внутри них улиц быть не должно.
// Это те же условия, что у стен.
//
// Когда застройка показывается и как растёт — решает слой (CityTownLayer3D): здесь только данные.
// ============================================
import type { RegionManager } from '@fiefdom/shared/core/regionManager';
import type { PlacedTile } from '@fiefdom/shared/core/types';
import { getCityRefs, type CityRegionTile } from '@/core/geometry/cityRegions';
import { CityTownCache, buildCityTownModels, type CityTownModel } from '@/core/geometry/cityTown';
import { GEOMETRY_PARAMS } from '@/core/geometry/loadedGeometryParams';
import { BOARD_MESH_PARAMS, getBundle } from './tileBundles';

/** Параметры застройки из geometryParams.json (секция town) */
export const TOWN_PARAMS = GEOMETRY_PARAMS.town;

/** Высота поверхности города: от неё вверх растут дома (меш построен от нуля) */
export const TOWN_BASE_Y: number = BOARD_MESH_PARAMS.baseHeight + BOARD_MESH_PARAMS.heights.city;

export interface BoardCityTown {
  /** Корень региона в RegionManager: по нему слой находит анимацию завершения */
  readonly rootKey: string;
  readonly model: CityTownModel;
}

const NO_TOWNS: readonly BoardCityTown[] = [];
const cache = new CityTownCache();
const results = new WeakMap<RegionManager, WeakMap<ReadonlyMap<string, PlacedTile>, readonly BoardCityTown[]>>();

function compute(board: ReadonlyMap<string, PlacedTile>, regionManager: RegionManager): readonly BoardCityTown[] {
  if (!TOWN_PARAMS.enabled) return NO_TOWNS;

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
    return NO_TOWNS;
  }

  // 2) Геометрия: только тайлы завершённых городов; замкнутость проверяет buildCityTownModels
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

  const towns: BoardCityTown[] = [];
  for (const model of buildCityTownModels(tiles, TOWN_PARAMS, { onlyFeatureKeys: complete, cache })) {
    for (const warning of model.warnings) console.warn(`⚠️ [cityTown] ${model.id}: ${warning}`);
    towns.push({ rootKey: regionManager.find(model.featureKeys[0]) ?? model.id, model });
  }
  return towns;
}

/**
 * Застройка завершённых городов текущей доски. Результат кэшируется по (regionManager, board),
 * а меши — по составу города и параметрам: при новом ходе перестраиваются только изменившиеся города.
 */
export function getBoardCityTowns(
  board: ReadonlyMap<string, PlacedTile>,
  regionManager: RegionManager
): readonly BoardCityTown[] {
  let perBoard = results.get(regionManager);
  if (!perBoard) {
    perBoard = new WeakMap();
    results.set(regionManager, perBoard);
  }
  let towns = perBoard.get(board);
  if (!towns) {
    towns = compute(board, regionManager);
    perBoard.set(board, towns);
  }
  return towns;
}
