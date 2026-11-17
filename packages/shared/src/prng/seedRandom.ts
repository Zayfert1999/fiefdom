// packages/shared/src/prng/seedRandom.ts
// 🌟 Seed-based PRNG: createSeededRandom (лёгкий, для визуальных эффектов) и
// createDeckRandom (sfc32, 128 бит состояния — для колоды)
// Детерминированная генерация случайных чисел из seed-строки
// Используется для перемешивания колоды — одинаковый seed = одинаковая колода

/**
 * Создаёт функцию генерации случайных чисел [0, 1) из seed-строки.
 * Внутри — итерированный финализатор murmur3 (fmix32) от 32-битного состояния:
 * быстрый, но недостаточный по энтропии для перемешивания колоды — для неё
 * используйте createDeckRandom.
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
  
  // fmix32
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * 🎴 PRNG для перемешивания колоды: sfc32 с 128-битным состоянием.
 * Seed-строка хэшируется (cyrb128) в четыре 32-битных слова, поэтому
 * достижимы не 2^32, а 2^128 начальных состояний.
 * Детерминирован: один seed → одна и та же последовательность.
 */
export function createDeckRandom(seed: string): () => number {
  // cyrb128
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  let a = (h1 ^ h2 ^ h3 ^ h4) >>> 0;
  let b = (h2 ^ h1) >>> 0;
  let c = (h3 ^ h1) >>> 0;
  let d = (h4 ^ h1) >>> 0;

  // sfc32
  const next = (): number => {
    const t0 = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const t = (t0 + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next(); // прогрев
  return next;
}

/**
 * Генерирует уникальный seed для игры (128 бит из криптографического ГСЧ).
 * Используется сервером при создании комнаты. Seed клиентам не отправляется.
 */
export function generateGameSeed(): string {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    const words = c.getRandomValues(new Uint32Array(4));
    return Array.from(words, w => w.toString(16).padStart(8, '0')).join('');
  }
  // Запасной вариант (среда без Web Crypto)
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomPart}`;
}
