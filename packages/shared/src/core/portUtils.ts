// packages/shared/src/core/portUtils.ts
// ============================================
// 📐 12-ПОРТОВАЯ СИСТЕМА ТАЙЛОВ
// ============================================
// Порты 0-11 по часовой стрелке, начиная с NW-угла.
// По 3 порта на сторону: угол-центр-угол.
//
// Схема портов:
/**
 *         [0]  [1]  [2]
         +---------------+
    [11] |     NORTH     | [3]
    [10] | WEST    EAST  | [4]
    [9]  |     SOUTH     | [5]
         +---------------+
           [8]  [7]  [6]
 */
// ============================================

import type { FeatureType, Tile, TileFeature, Port, Dir } from './types';

// ============================================
// 📦 КОНСТАНТЫ
// ============================================

/** Количество портов на одной стороне тайла */
export const PORTS_PER_SIDE = 3;

/** Количество сторон тайла */
export const SIDES_COUNT = 4;

/** Общее количество портов на тайле */
export const PORTS_COUNT = 12;

/**
 * Смещения соседей по направлениям.
 * Заменяет старый NEIGHBOR_OFFSETS из tileUtils.
 */
export const NEIGHBOR_OFFSETS: ReadonlyArray<{
  dx: number;
  dy: number;
  dir: Dir;
}> = [
  { dx:  0, dy: -1, dir: 0 }, // N — сосед сверху
  { dx:  1, dy:  0, dir: 1 }, // E — сосед справа
  { dx:  0, dy:  1, dir: 2 }, // S — сосед снизу
  { dx: -1, dy:  0, dir: 3 }, // W — сосед слева
];

// ============================================
// 📍 ВЫВОД СТОРОНЫ ИЗ ПОРТА
// ============================================

/**
 * Возвращает сторону тайла (0-3), к которой относится порт.
 * floor(port / 3): порты 0-2 → 0 (N), 3-5 → 1 (E), 6-8 → 2 (S), 9-11 → 3 (W)
 */
export const getPortSide = (port: Port): Dir =>
  Math.floor(port / PORTS_PER_SIDE) as Dir;

/**
 * Возвращает все 3 порта на указанной стороне.
 * @example getSidePorts(0) → [0, 1, 2]  (сторона N)
 */
export const getSidePorts = (dir: Dir): readonly Port[] => {
  const base = dir * PORTS_PER_SIDE;
  return [base, base + 1, base + 2];
};

// ============================================
// 🔗 СТЫКОВКА ПОРТОВ (вычисляется формулой)
// ============================================

/**
 * 🌟 Возвращает порт СОСЕДНЕГО тайла, который стыкуется с данным.
 * Чистая математика — таблица не нужна.
 *
 * Формула:
 *   сторона_соседа    = (моя_сторона + 2) % 4   (противоположная)
 *   локальный_индекс  = порт % 3
 *   инверсия_индекса  = 2 - локальный_индекс    (углы меняются местами)
 *   порт_соседа       = сторона_соседа * 3 + инверсия_индекса
 *
 * @example getStitchedPort(1) === 7   // мой верх-центр ↔ его низ-центр
 * @example getStitchedPort(0) === 8   // мой NW-угол ↔ его SW-угол
 * @example getStitchedPort(3) === 11  // мой NE-угол ↔ его NW-угол
 * @example getStitchedPort(4) === 10  // мой право-центр ↔ его лево-центр
 */
export const getStitchedPort = (port: Port): Port => {
  const side = getPortSide(port);
  const localIndex = port % PORTS_PER_SIDE;
  const neighborSide = (side + 2) % SIDES_COUNT;
  const neighborLocalIndex = (PORTS_PER_SIDE - 1) - localIndex;
  return neighborSide * PORTS_PER_SIDE + neighborLocalIndex;
};

// ============================================
// 🔄 ПОВОРОТ ПОРТОВ
// ============================================

/**
 * Поворачивает порт при повороте тайла.
 * 90° по часовой = сдвиг на +3 (одна сторона).
 *
 * @example rotatePort(0, 90) === 3   // NW-угол → NE-угол
 * @example rotatePort(1, 90) === 4   // центр верха → центр права
 * @example rotatePort(0, 270) === 9  // NW-угол → SW-угол
 */
export const rotatePort = (port: Port, rotation: 0 | 90 | 180 | 270): Port => {
  const shift = (rotation / 90) * PORTS_PER_SIDE;
  return (port + shift) % PORTS_COUNT;
};

/** Поворачивает массив портов */
export const rotatePorts = (
  ports: Port[],
  rotation: 0 | 90 | 180 | 270
): Port[] => {
  if (rotation === 0) return ports;
  return ports.map(p => rotatePort(p, rotation));
};

// ============================================
// 🔍 ПОИСК ФИЧИ ПО ПОРТУ
// ============================================

/**
 * Находит фичу, которая занимает данный порт.
 * Возвращает undefined, если порт не занят ни одной фичей.
 */
export const getFeatureByPort = (
  features: TileFeature[],
  port: Port
): TileFeature | undefined =>
  features.find(f => f.ports?.includes(port));

// ============================================
// 📋 ПОРТЫ ВСЕГО ТАЙЛА
// ============================================

/**
 * Возвращает массив из 12 элементов — тип фичи на каждом порту.
 * Незанятые порты = 'field' (поле-заполнитель).
 * Заменяет старый getTileSides из tileUtils.
 */
export const getTilePorts = (tile: Tile): FeatureType[] => {
  const ports: FeatureType[] = new Array(PORTS_COUNT).fill('field');
  for (const feature of tile.features) {
    if (!feature.ports) continue;
    for (const port of feature.ports) {
      ports[port] = feature.type;
    }
  }
  return ports;
};

// ============================================
// 🐛 ОТЛАДКА
// ============================================

const SIDE_NAMES: Record<Dir, string> = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' };

/** Форматирует порт для отладочного вывода */
export const formatPort = (port: Port): string => {
  const side = getPortSide(port);
  const local = port % PORTS_PER_SIDE;
  const label = local === 0 ? 'corner-a' : local === 1 ? 'center' : 'corner-b';
  return `P${port}(${SIDE_NAMES[side]}/${label})`;
};