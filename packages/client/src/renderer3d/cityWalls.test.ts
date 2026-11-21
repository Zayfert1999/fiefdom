// packages/client/src/renderer3d/cityWalls.test.ts
// ============================================
// 🧪 СТЕНЫ ЗАВЕРШЁННЫХ ГОРОДОВ ИГРОВОЙ ДОСКИ
// ============================================
// Настоящие тайлы набора и настоящий RegionManager: стена нужна городу, который завершён
// по RegionManager И замкнут геометрически.
// ============================================
import { describe, expect, it } from 'vitest';
import { RegionManager } from '@fiefdom/shared/core/regionManager';
import { TILE_DEFINITIONS } from '@fiefdom/shared/core/tileData';
import type { PlacedTile, Tile } from '@fiefdom/shared/core/types';
import { getBoardCityWalls } from './cityWalls';

/** Тайл-«шапка»: город на одной стороне, остальное поля */
const capDefinition = (): Tile => {
  const found = TILE_DEFINITIONS.find((t) => {
    const cities = t.features.filter((f) => f.type === 'city');
    return cities.length === 1 && cities[0].ports.length === 1 && t.features.every((f) => f.type === 'city' || f.type === 'field');
  });
  if (!found) throw new Error('в наборе нет тайла-шапки');
  return found;
};

const definition = (id: string): Tile => {
  const found = TILE_DEFINITIONS.find((t) => t.id === id);
  if (!found) throw new Error(`нет тайла ${id}`);
  return found;
};

const placed = (tile: Tile, x: number, y: number, rotation: PlacedTile['rotation']): PlacedTile => ({
  templateId: tile.id,
  x,
  y,
  rotation,
  features: [],
  derivedPorts: [],
});

/** Крест: город с воротами в центре и по шапке с севера, запада и востока (юг открыт к дороге) */
const crossBoard = (): { board: Map<string, PlacedTile>; cityKeys: string[] } => {
  const center = definition('tile_CCRC');
  const cap = capDefinition();
  const tiles = [placed(center, 0, 0, 0), placed(cap, 0, -1, 180), placed(cap, -1, 0, 90), placed(cap, 1, 0, 270)];
  const board = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  const cityKeys = tiles.map((t) => {
    const city = TILE_DEFINITIONS.find((d) => d.id === t.templateId)!.features.find((f) => f.type === 'city')!;
    return `${t.x},${t.y}:${city.id}`;
  });
  return { board, cityKeys };
};

const regionOf = (keys: string[], complete: boolean): RegionManager => {
  const rm = new RegionManager();
  for (const key of keys) rm.makeSet(key, 'city');
  for (const key of keys.slice(1)) rm.union(keys[0], key);
  if (complete) rm.markComplete(keys[0], 20);
  return rm;
};

describe('getBoardCityWalls', () => {
  it('завершённый и замкнутый город получает стену с воротами; rootKey — корень региона', () => {
    const { board, cityKeys } = crossBoard();
    const rm = regionOf(cityKeys, true);
    const walls = getBoardCityWalls(board, rm);

    expect(walls).toHaveLength(1);
    expect(walls[0].rootKey).toBe(rm.find(cityKeys[0]));
    expect(walls[0].model.stats.gates).toBe(1);
    expect(walls[0].model.featureKeys).toEqual([...cityKeys].sort());
  });

  it('город, не помеченный завершённым, стены не получает', () => {
    const { board, cityKeys } = crossBoard();
    expect(getBoardCityWalls(board, regionOf(cityKeys, false))).toEqual([]);
  });

  it('город, помеченный завершённым, но не замкнутый (конец партии), стены не получает', () => {
    const { board, cityKeys } = crossBoard();
    board.delete('1,0'); // убрали восточную шапку
    const keys = cityKeys.filter((key) => !key.startsWith('1,0:'));
    expect(getBoardCityWalls(board, regionOf(keys, true))).toEqual([]);
  });

  it('результат кэшируется по доске и менеджеру регионов', () => {
    const { board, cityKeys } = crossBoard();
    const rm = regionOf(cityKeys, true);
    expect(getBoardCityWalls(board, rm)).toBe(getBoardCityWalls(board, rm));
  });

  it('меш той же стены переиспользуется, когда доска пересоздана без изменений города', () => {
    const { board, cityKeys } = crossBoard();
    const rm = regionOf(cityKeys, true);
    const first = getBoardCityWalls(board, rm);
    const second = getBoardCityWalls(new Map(board), rm);
    expect(second[0].model).toBe(first[0].model);
  });
});
