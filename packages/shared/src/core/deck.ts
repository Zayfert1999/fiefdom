// packages/shared/src/core/deck.ts
// 🌟 Логика создания и перемешивания колоды
// Вынесена из gameSlice для переиспользования сервером

import type { Tile, PlacedTile } from './types';
import { TILE_DEFINITIONS } from './tileData';
import { createSeededRandom } from '../prng/seedRandom';
import { getValidPlacementCells } from './tileUtils'; 

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

/**
 * 🌟 Ищет играбельный тайл в колоде.
 * Перебирает тайлы с конца колоды, проверяя возможность размещения.
 * Неиграбельные тайлы возвращаются в случайное место колоды.
 *
 * Используется и клиентом (локальная игра), и сервером (сетевая игра).
 *
 * @param deck Текущая колода тайлов
 * @param board Текущая доска
 * @param random Функция генерации случайных чисел (для детерминизма на сервере)
 * @returns Найденный тайл и обновлённая колода, либо null если играбельных нет
 */
export function drawPlayableTile(
    deck: Tile[],
    board: Map<string, PlacedTile>,
    random: () => number = Math.random
): { drawnTile: Tile | null; newDeck: Tile[] } {
    const newDeck = [...deck];
    let attempts = 0;
    const maxAttempts = newDeck.length;

    while (newDeck.length > 0 && attempts < maxAttempts) {
        attempts++;
        const candidate = newDeck.pop()!;
        const validCells = getValidPlacementCells(candidate, board);

        // 🌟 Нашли играбельный тайл
        if (validCells.size > 0) {
            console.log(`🎴 [Deck] Найден играбельный тайл: ${candidate.id} (попытка ${attempts}/${maxAttempts})`);
            return { drawnTile: candidate, newDeck };
        }

        // 🌟 Последний тайл в колоде и он неиграбельный
        if (newDeck.length === 0) {
            console.log(`🏁 [Deck] Последний тайл нельзя поставить`);
            break;
        }

        // 🌟 Возвращаем неиграбельный тайл в случайное место колоды
        const insertIndex = Math.floor(random() * (newDeck.length + 1));
        newDeck.splice(insertIndex, 0, candidate);
    }

    // 🌟 Играбельных тайлов нет → конец игры
    console.log(`🏁 [Deck] Нет играбельных тайлов → конец игры`);
    return { drawnTile: null, newDeck };
}