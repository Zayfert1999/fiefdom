// packages/shared/src/core/deck.ts
// 🌟 Логика создания и перемешивания колоды
// Вынесена из gameSlice для переиспользования сервером

import type { Tile } from './types';
import { TILE_DEFINITIONS } from './tileData';
import { createSeededRandom } from '../prng/seedRandom';

/**
 * Создаёт перемешанную колоду из всех тайлов.
 * 
 * @param seed Строка-зерно для детерминированного перемешивания.
 *             Если не передан — используется Math.random (для локальной игры).
 * @returns Перемешанный массив тайлов
 */
export function createDeck(seed?: string): Tile[] {
  const deck: Tile[] = [];
  
  // 🌟 Собираем все тайлы согласно quantity
  for (const def of TILE_DEFINITIONS) {
    for (let i = 0; i < def.quantity; i++) {
      deck.push(def);
    }
  }
  
  // 🌟 Перемешивание Fisher-Yates
  // Используем seed-based PRNG если seed передан, иначе Math.random
  const random = seed ? createSeededRandom(seed) : Math.random;
  
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
    console.log(`🎴 [Deck] Создана колода: ${deck.length} тайлов (seed: ${seed || 'random'})`);
  return deck;
}