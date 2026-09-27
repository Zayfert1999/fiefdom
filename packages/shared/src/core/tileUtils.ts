// core/tileUtils.ts
// ============================================
// 📐 УТИЛИТЫ ТАЙЛОВ (12-портовая система)
// ============================================
// Валидация размещения, поворот фич, применение
// тайла к доске и RegionManager, мёртвые клетки.
//
// Портовая система:
// - Валидация: только центральные порты (1, 4, 7, 10)
// - Объединение регионов: все 12 портов
// ============================================

import type { FeatureType, Tile, TileFeature, PlacedTile, Dir, Spot } from './types';
import { RegionManager, type FeatureKey } from './regionManager';
import {
  rotatePorts,
  getSidePorts,
  getStitchedPort,
  getFeatureByPort,
  getTilePorts,
  NEIGHBOR_OFFSETS,
} from './portUtils';

// ============================================
// 🔄 ПОВОРОТ КООРДИНАТ (для мипл-спотов)
// ============================================

/** Поворот точки (x, y) вокруг центра тайла (0, 0) */
export const rotatePoint = (
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270
): Spot => {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
};

// ============================================
// 🔄 ПОВОРОТ ФИЧ
// ============================================

/** Поворот одной фичи: порты + мипл-споты */
export const rotateFeature = (
  feat: TileFeature,
  rotation: 0 | 90 | 180 | 270
): TileFeature => {
  if (rotation === 0) return feat;

  return {
    ...feat,
    ports: rotatePorts(feat.ports, rotation),
    // 🎯 Одиночный спот — просто поворачиваем
    meepleSpot: rotatePoint(feat.meepleSpot.x, feat.meepleSpot.y, rotation),
    // 🛡️ Щит тоже поворачиваем (исправление: ранее не поворачивался)
    ...(feat.shieldSpot
      ? { shieldSpot: rotatePoint(feat.shieldSpot.x, feat.shieldSpot.y, rotation) }
      : {}),
  };
};

/** Поворот массива фич */
export const rotateFeatures = (
  features: TileFeature[],
  rotation: 0 | 90 | 180 | 270
): TileFeature[] => features.map(f => rotateFeature(f, rotation));

// ============================================
// ✅ ВАЛИДАЦИЯ РАЗМЕЩЕНИЯ
// ============================================

/**
 * Центральный порт каждой стороны.
 * Валидация идёт ТОЛЬКО по ним (как в оригинальном Каркассоне).
 * Угловые порты используются только для объединения регионов.
 */
const CENTER_PORT: Record<Dir, number> = {
  0: 1,   // N → порт 1
  1: 4,   // E → порт 4
  2: 7,   // S → порт 7
  3: 10,  // W → порт 10
};

/**
 * Проверка валидности размещения тайла.
 * Для каждого соседа: типы фич на центральных портах
 * стыкуемых сторон должны совпадать.
 */
export const isValidPlacement = (
  board: Map<string, PlacedTile>,
  x: number,
  y: number,
  newFeatures: TileFeature[]
): boolean => {
  let hasAdjacent = false;

  for (const { dx, dy, dir } of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    const neighbor = board.get(`${nx},${ny}`);
    if (!neighbor) continue;

    hasAdjacent = true;

    // 🌟 Только центральные порты
    const myPort = CENTER_PORT[dir];
    const theirPort = getStitchedPort(myPort);

    const myFeat = getFeatureByPort(newFeatures, myPort);
    const theirFeat = getFeatureByPort(neighbor.features, theirPort);

    // Если фича не найдена — это поле
    const myType = myFeat?.type ?? 'field';
    const theirType = theirFeat?.type ?? 'field';

    if (myType !== theirType) {
      return false;
    }
  }

  if (hasAdjacent) {
    console.log(`✅ [Validation] Все стыки совпадают. Тайл можно ставить.`);
  } else {
    console.warn(`⚠️ [Validation] У тайла нет соседей.`);
  }

  return hasAdjacent;
};

// ============================================
// 📐 ВАЛИДНЫЕ КЛЕТКИ И ПОВОРОТЫ
// ============================================

/**
 * Множество клеток, куда можно поставить тайл
 * хотя бы в одном из 4 поворотов.
 */
export const getValidPlacementCells = (
  drawnTile: Tile,
  board: Map<string, PlacedTile>
): Set<string> => {
  const validSet = new Set<string>();

  for (const existing of board.values()) {
    for (const { dx, dy } of NEIGHBOR_OFFSETS) {
      const nx = existing.x + dx;
      const ny = existing.y + dy;
      const cellKey = `${nx},${ny}`;
      if (board.has(cellKey)) continue;

      for (const rot of [0, 90, 180, 270] as const) {
        const rotatedFeatures = rotateFeatures(drawnTile.features, rot);
        if (isValidPlacement(board, nx, ny, rotatedFeatures)) {
          validSet.add(cellKey);
          break;
        }
      }
    }
  }

  return validSet;
};

/**
 * Массив валидных поворотов для тайла на конкретной позиции.
 */
export function getValidRotations(
  tile: Tile,
  board: Map<string, PlacedTile>,
  x: number,
  y: number
): (0 | 90 | 180 | 270)[] {
  const rotations: (0 | 90 | 180 | 270)[] = [];

  for (const rotation of [0, 90, 180, 270] as const) {
    const rotatedFeatures = rotateFeatures(tile.features, rotation);
    if (isValidPlacement(board, x, y, rotatedFeatures)) {
      rotations.push(rotation);
    }
  }

  console.log(
    `🔄 [TileUtils] getValidRotations для ${tile.id} в (${x}, ${y}): ` +
    `валидных ${rotations.length}/4 [${rotations.join(', ')}°]`
  );

  return rotations;
}

// ============================================
// 🏗️ ПРИМЕНЕНИЕ ТАЙЛА К ДОСКЕ И RM
// ============================================

/**
 * Применяет тайл к доске и RegionManager.
 * Объединение регионов идёт по ВСЕМ 12 портам.
 */
export function applyTileToBoardAndRM(
  board: Map<string, PlacedTile>,
  regionManager: RegionManager,
  tile: Tile,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270
): { newBoard: Map<string, PlacedTile>; newRM: RegionManager } {
  const rotatedFeatures = rotateFeatures(tile.features, rotation);

  // Новый board
  const newBoard = new Map(board);
  newBoard.set(`${x},${y}`, {
    templateId: tile.id,
    x, y, rotation,
    features: rotatedFeatures,
    derivedPorts: getTilePorts({ ...tile, features: rotatedFeatures }),
  });

  // Новый RM
  const newRM = regionManager.clone();
  for (const feature of rotatedFeatures) {
    const featureKey: FeatureKey = `${x},${y}:${feature.id}`;
    newRM.makeSet(featureKey, feature.type, feature.shieldSpot !== undefined);
  }

  // 🌟 Объединение по ВСЕМ портам стороны
  for (const { dx, dy, dir } of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    const neighbor = newBoard.get(`${nx},${ny}`);
    if (!neighbor) continue;

    for (const myPort of getSidePorts(dir)) {
      const myFeat = getFeatureByPort(rotatedFeatures, myPort);
      if (!myFeat) continue;

      const theirPort = getStitchedPort(myPort);
      const theirFeat = getFeatureByPort(neighbor.features, theirPort);

      if (theirFeat && myFeat.type === theirFeat.type) {
        newRM.union(
          `${x},${y}:${myFeat.id}`,
          `${nx},${ny}:${theirFeat.id}`
        );
      }
    }
  }

  return { newBoard, newRM };
}

// ============================================
// 💀 МЁРТВЫЕ КЛЕТКИ
// ============================================

/**
 * Находит пустые клетки, в которые ни один тайл
 * из колоды не может быть поставлен.
 */
export function findDeadCells(
  board: Map<string, PlacedTile>,
  deck: Tile[]
): Set<string> {
  // Колода пуста — все соседи мёртвые
  if (deck.length === 0) {
    const emptyNeighbors = new Set<string>();
    for (const tile of board.values()) {
      for (const { dx, dy } of NEIGHBOR_OFFSETS) {
        const key = `${tile.x + dx},${tile.y + dy}`;
        if (!board.has(key)) emptyNeighbors.add(key);
      }
    }
    console.log(`💀 [TileUtils] Колода пуста — все ${emptyNeighbors.size} соседей мёртвые`);
    return emptyNeighbors;
  }

  // Собираем пустые клетки-кандидаты
  const candidateCells = new Set<string>();
  for (const tile of board.values()) {
    for (const { dx, dy } of NEIGHBOR_OFFSETS) {
      const key = `${tile.x + dx},${tile.y + dy}`;
      if (!board.has(key)) candidateCells.add(key);
    }
  }

  // Проверяем каждую клетку
  const deadCells = new Set<string>();
  for (const cellKey of candidateCells) {
    const [xStr, yStr] = cellKey.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    let canBePlaced = false;

    for (const tile of deck) {
      for (const rotation of [0, 90, 180, 270] as const) {
        const rotatedFeatures = rotateFeatures(tile.features, rotation);
        if (isValidPlacement(board, x, y, rotatedFeatures)) {
          canBePlaced = true;
          break;
        }
      }
      if (canBePlaced) break;
    }

    if (!canBePlaced) deadCells.add(cellKey);
  }

  console.log(
    `💀 [TileUtils] Мёртвых клеток: ${deadCells.size} из ${candidateCells.size} ` +
    `(колода: ${deck.length} тайлов)`
  );

  return deadCells;
}

// ============================================
// 📤 РЕЭКСПОРТ для совместимости
// ============================================
export { getTilePorts, NEIGHBOR_OFFSETS };