// packages/shared/src/core/pathBuilder.ts
// ============================================
// 🛠️ УНИВЕРСАЛЬНЫЙ ПОСТРОИТЕЛЬ SVG PATH
// ============================================
// Единая точка входа для преобразования любой геометрии
// в SVG path d-строку. Используется в песочнице и рендерере.
//
// Поддерживает три уровня вложенности:
//   • Point[]       → один контур (один замкнутый путь)
//   • Point[][]     → полигон с дырками (первый контур — внешний)
//   • Point[][][]   → мультиполигон (массив полигонов)
//
// Примеры:
//   toPathD([[0,0], [10,0], [10,10]])
//   → "M 0,0 L 10,0 L 10,10 Z"
//
//   toPathD([outerRing, holeRing])
//   → "M ... Z M ... Z"  (evenodd создаст дырку)
// ============================================
import type { Point } from './geometry.types';

// ============================================
// 🔍 ОПРЕДЕЛЕНИЕ ТИПА ПО ВЛОЖЕННОСТИ
// ============================================

/**
 * Проверяет, является ли значение плоским массивом точек.
 * Точка = [число, число]
 */
function isPointArray(data: unknown): data is readonly Point[] {
    return (
        Array.isArray(data) &&
        data.length > 0 &&
        typeof (data as unknown[])[0] === 'object' &&
        Array.isArray((data as unknown[])[0]) &&
        typeof ((data as unknown[])[0] as unknown[])[0] === 'number'
    );
}

/**
 * Проверяет, является ли значение полигоном (массив контуров).
 * Полигон = [контур1, контур2, ...]
 */
function isPolygon(data: unknown): data is readonly Point[][] {
    return (
        Array.isArray(data) &&
        data.length > 0 &&
        isPointArray((data as unknown[])[0])
    );
}

// ============================================
// 🛠️ БАЗОВЫЕ ФУНКЦИИ
// ============================================

/**
 * 🛠️ Один контур → d-строка.
 * Автоматически замыкает путь командой Z.
 *
 * @example
 * ringToPathD([[0,0], [10,0], [10,10]])
 * // "M 0,0 L 10,0 L 10,10 Z"
 */
export function ringToPathD(points: readonly Point[]): string {
    if (points.length === 0) return '';

    const [first, ...rest] = points;
    const commands: string[] = [`M ${first[0]},${first[1]}`];

    for (const [x, y] of rest) {
        commands.push(`L ${x},${y}`);
    }

    commands.push('Z');
    return commands.join(' ');
}

// ============================================
// 🎯 ГЛАВНАЯ ФУНКЦИЯ
// ============================================

/**
 * 🎯 ЕДИНАЯ УНИВЕРСАЛЬНАЯ ФУНКЦИЯ.
 *
 * Принимает геометрию любого уровня вложенности и строит d-строку:
 *   • `Point[]`     → один замкнутый контур
 *   • `Point[][]`   → полигон с дырками (использовать с fill-rule="evenodd")
 *   • `Point[][][]` → мультиполигон
 *
 * @example
 * // Один полигон
 * toPathD([[0,0], [10,0], [10,10]])
 *
 * // Полигон с дыркой (поле вокруг монастыря)
 * toPathD([outerRing, holeRing])
 *
 * // Мультиполигон (несколько частей поля)
 * toPathD(multiPolygon)
 */
export function toPathD(
    data: readonly Point[] | readonly Point[][] | readonly Point[][][]
): string {
    // Один контур: Point[]
    if (isPointArray(data)) {
        return ringToPathD(data);
    }

    // Полигон с дырками: Point[][]
    if (isPolygon(data)) {
        return (data as readonly Point[][])
            .map(ring => ringToPathD(ring))
            .join(' ');
    }

    // Мультиполигон: Point[][][]
    const mp = data as readonly Point[][][];
    return mp
        .map(polygon =>
            polygon.map(ring => ringToPathD(ring)).join(' ')
        )
        .join(' ');
}