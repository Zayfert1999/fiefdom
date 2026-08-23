// packages/shared/src/prng/seedRandom.ts
// 🌟 Простой seed-based PRNG (алгоритм Mulberry32)
// Детерминированная генерация случайных чисел из seed-строки
// Используется для перемешивания колоды — одинаковый seed = одинаковая колода

/**
 * Создаёт функцию генерации случайных чисел [0, 1) из seed-строки.
 * Алгоритм Mulberry32 — быстрый и достаточно качественный для игр.
 * 
 * @param seed Строка-зерно (например, timestamp или UUID)
 * @returns Функция, возвращающая псевдослучайное число [0, 1)
 */
export function createSeededRandom(seed: string): () => number {
  // Преобразуем строку в 32-битное число (простой hash)
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  
  // Mulberry32
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Генерирует уникальный seed для игры.
 * Используется сервером при создании комнаты.
 */
export function generateGameSeed(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomPart}`;
}