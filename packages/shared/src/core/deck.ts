// packages/shared/src/core/deck.ts
// 🌟 Логика создания и перемешивания колоды
// Вынесена из gameSlice для переиспользования сервером

import type { Tile, PlacedTile } from './types';
import { TILE_DEFINITIONS } from './tileData';
import { createDeckRandom } from '../prng/seedRandom';
import { hasValidPlacement } from './tileUtils';

/**
 * Стартовый тайл по правилам: город с дорогой насквозь.
 * В колоде таких тайлов 4 — один из них кладётся в центр, остальные 3 остаются.
 */
export const START_TILE_ID = 'tile_CRFR';

/**
 * Создаёт перемешанную колоду из всех тайлов.
 *
 * @param seed Строка-зерно для детерминированного перемешивания (sfc32, 128 бит).
 *             Если не передан — используется Math.random (для локальной игры).
 * @returns Перемешанный массив тайлов (включая тайл, который станет стартовым)
 */
export function createDeck(seed?: string): Tile[] {
  const deck: Tile[] = [];

  for (const def of TILE_DEFINITIONS) {
    for (let i = 0; i < def.quantity; i++) {
      deck.push(def);
    }
  }

  const random = seed ? createDeckRandom(seed) : Math.random;

  // Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

/**
 * 🏁 Достаёт из колоды стартовый тайл (фиксированного типа START_TILE_ID).
 * Общая функция для локальной и сетевой игры, чтобы старт был одинаковым.
 * Если в наборе нет тайла START_TILE_ID (другой набор) — берётся верхний.
 *
 * @returns стартовый тайл и колода БЕЗ него (исходный массив не мутируется)
 */
export function takeStartTile(deck: Tile[]): { startTile: Tile; deck: Tile[] } {
  const index = deck.findIndex(t => t.id === START_TILE_ID);
  const pick = index === -1 ? deck.length - 1 : index;
  const rest = deck.slice();
  const [startTile] = rest.splice(pick, 1);
  return { startTile, deck: rest };
}

/**
 * 🌟 Ищет играбельный тайл в колоде (сверху вниз, т.е. с конца массива).
 *
 * Неиграбельные тайлы НЕ перемешиваются обратно и не теряются: остаются на своих
 * местах и могут стать играбельными позже, когда доска изменится.
 * Поиск детерминирован и всегда просматривает ВСЕ тайлы колоды — «ложного» конца
 * игры при наличии играбельного тайла быть не может.
 *
 * Используется и клиентом (локальная игра), и сервером (сетевая игра).
 *
 * @returns Найденный тайл и колода без него, либо drawnTile = null, если
 *          в колоде нет ни одного играбельного тайла (→ конец игры)
 */
export function drawPlayableTile(
  deck: Tile[],
  board: Map<string, PlacedTile>
): { drawnTile: Tile | null; newDeck: Tile[] } {
  for (let i = deck.length - 1; i >= 0; i--) {
    if (hasValidPlacement(deck[i], board)) {
      const newDeck = deck.slice();
      const [drawnTile] = newDeck.splice(i, 1);
      return { drawnTile, newDeck };
    }
  }
  return { drawnTile: null, newDeck: deck };
}
