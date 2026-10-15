// packages/shared/src/prng/perlin.ts
// ============================================
// 🌊 СИДИРОВАННЫЙ ШУМ ПЕРЛИНА
// ============================================
// Детерминированный 2D-шум на основе строки-зерна.
// Использует существующий createSeededRandom из seedRandom
// для генерации перестановочной таблицы.
//
// Единый источник истины для клиента и сервера:
//   • Клиент: рендеринг геометрии тайлов
//   • Сервер: валидация геометрии (если потребуется)
//
// Возвращает значения в диапазоне [-1, 1].
// ============================================
import { createSeededRandom } from '@fiefdom/shared/prng/seedRandom';

// ============================================
// 🧩 ПЕРЕСТАНОВОЧНАЯ ТАБЛИЦА
// ============================================

/**
 * Создаёт перестановочную таблицу (256 уникальных значений)
 * на основе сидированного PRNG.
 *
 * @param seed Строка-зерно
 * @returns Uint8Array из 256 перемешанных значений [0..255]
 */
function createPermutation(seed: string): Uint8Array {
    const rng = createSeededRandom(seed);
    const p = new Uint8Array(256);

    // Инициализация [0, 1, 2, ..., 255]
    for (let i = 0; i < 256; i++) {
        p[i] = i;
    }

    // Fisher-Yates shuffle с сидированным PRNG
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = p[i];
        p[i] = p[j];
        p[j] = tmp;
    }

    return p;
}

// ============================================
// 📐 ГРАДИЕНТЫ И ИНТЕРПОЛЯЦИЯ
// ============================================

/** 8 единичных градиентных векторов для 2D-шума */
const GRAD2: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
];

/** Функция сглаживания Перлина: 6t⁵ − 15t⁴ + 10t³ */
function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Линейная интерполяция */
function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
}

/** Скалярное произведение градиента и вектора смещения */
function grad(hash: number, x: number, y: number): number {
    const g = GRAD2[hash & 7];
    return g[0] * x + g[1] * y;
}

// ============================================
// 📤 PUBLIC API
// ============================================

/** Тип функции 2D-шума: (x, y) → [-1, 1] */
export type Noise2D = (x: number, y: number) => number;

/**
 * Создаёт детерминированную функцию 2D-шума Перлина.
 *
 * @param seed Строка-зерно (обычно `tile.artId`)
 * @returns Функция (x, y) → значение в диапазоне [-1, 1]
 *
 * @example
 * const noise = createNoise2D('tile_CCFC');
 * noise(0.5, 0.3); // детерминированное значение ≈ -0.42
 */
export function createNoise2D(seed: string): Noise2D {
    const perm = createPermutation(seed);

    // Удваиваем таблицу для быстрого доступа без операции % 256
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
        p[i] = perm[i & 255];
    }

    return (x: number, y: number): number => {
        // Координаты ячейки сетки (целая часть)
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        // Дробная часть внутри ячейки
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);

        // Сглаживание для интерполяции
        const u = fade(xf);
        const v = fade(yf);

        // Хеш-координаты четырёх углов ячейки
        const aa = p[p[X] + Y];
        const ba = p[p[X + 1] + Y];
        const ab = p[p[X] + Y + 1];
        const bb = p[p[X + 1] + Y + 1];

        // Градиенты в углах ячейки
        const n00 = grad(aa, xf, yf);
        const n10 = grad(ba, xf - 1, yf);
        const n01 = grad(ab, xf, yf - 1);
        const n11 = grad(bb, xf - 1, yf - 1);

        // Билинейная интерполяция
        return lerp(
            lerp(n00, n10, u),
            lerp(n01, n11, u),
            v
        );
    };
}

/**
 * Многооктавный шум (fractal Brownian motion).
 * Даёт более детализированную неровность: крупный шум + мелкие детали.
 *
 * @param noise Базовая функция шума (одна октава)
 * @param octaves Количество октав (1 = без наложения)
 * @param lacunarity Множитель частоты между октавами (обычно 2.0)
 * @param gain Множитель амплитуды между октавами (обычно 0.5)
 * @returns Нормализованная функция шума в диапазоне [-1, 1]
 *
 * @example
 * const base = createNoise2D('tile_CCFC');
 * const noise = createFBM(base, 2); // крупный + мелкий шум
 */
export function createFBM(
    noise: Noise2D,
    octaves: number = 2,
    lacunarity: number = 2.0,
    gain: number = 0.5
): Noise2D {
    return (x: number, y: number): number => {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0; // для нормализации результата

        for (let i = 0; i < octaves; i++) {
            value += noise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= gain;
            frequency *= lacunarity;
        }

        return value / maxValue;
    };
}