// packages/shared/src/core/booleanOps.ts
// ============================================
// 🔲 БУЛЕВЫ ОПЕРАЦИИ НАД ПОЛИГОНАМИ
// ============================================
// Изолированная обёртка над polygon-clipping.
// Скрывает мутабельные типы библиотеки внутри модуля.
// Внешний API работает только с readonly Point[][][].
// ============================================
import polygonClipping from 'polygon-clipping';
import type { Point } from './geometry.types';

/** Внутренний мутабельный тип, требуемый polygon-clipping */
type MutablePoint = [number, number];
type MutablePolygon = MutablePoint[][];
type MutableMultiPolygon = MutablePolygon[];

// ============================================
// 📐 БАЗОВЫЙ КВАДРАТ ТАЙЛА
// ============================================

/** Квадрат тайла в системе координат [-50, 50] */
export const TILE_SQUARE: readonly Point[] = [
    [-50, -50],
    [50, -50],
    [50, 50],
    [-50, 50],
];

// ============================================
// 🔒 ЗАМЫКАНИЕ RING (требуется для polygon-clipping)
// ============================================

/**
 * Замыкает ring: если первая и последняя точки различаются —
 * добавляет копию первой в конец.
 * polygon-clipping требует замкнутых полигонов.
 */
const closeRing = (ring: readonly Point[]): MutablePoint[] => {
    if (ring.length < 2) return [...ring] as MutablePoint[];
    const first = ring[0];
    const last = ring[ring.length - 1];
    const mutable = [...ring] as MutablePoint[];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        mutable.push([...first] as MutablePoint);
    }
    return mutable;
};

/** Замыкает все rings в MultiPolygon */
const closeMultiPolygon = (mp: readonly Point[][][]): MutableMultiPolygon =>
    mp.map(polygon => polygon.map(ring => closeRing(ring)));

// ============================================
// 🔄 ОБНОВЛЁННЫЕ КАСТЫ (с замыканием)
// ============================================

const toMutable = (mp: readonly Point[][][]): MutableMultiPolygon =>
    closeMultiPolygon(mp);

// toReadonly остаётся без изменений
const toReadonly = (mp: MutableMultiPolygon): readonly Point[][][] =>
    mp as unknown as readonly Point[][][];

// ============================================
// 🧮 БУЛЕВЫ ОПЕРАЦИИ
// ============================================

/**
 * Вычитает массив полигонов из subject.
 * @param subject  Исходный MultiPolygon (например, квадрат тайла)
 * @param subtract Массив полигонов для вычитания
 * @returns Новый MultiPolygon после вычитания
 */
export function subtractPolygons(
    subject: readonly Point[][][],
    subtract: readonly Point[][][]
): readonly Point[][][] {
    const mutableSubject = toMutable(subject);
    const mutableSubtract = toMutable(subtract);

    // Вычитаем по одному (polygon-clipping принимает один MultiPolygon)
    let result = mutableSubject;
    for (const poly of mutableSubtract) {
        result = polygonClipping.difference(result, [poly]);
        if (result.length === 0) break;
    }

    return toReadonly(result);
}

/**
 * Быстрая операция: вычитание одного полигона из subject.
 */
export function subtractOne(
    subject: readonly Point[][][],
    polygon: readonly Point[][]
): readonly Point[][][] {
    const mutableSubject = toMutable(subject);
    const mutablePolygon = polygon as unknown as MutablePolygon;
    return toReadonly(
        polygonClipping.difference(mutableSubject, [mutablePolygon])
    );
}

/**
 * Объединение двух MultiPolygon.
 */
export function unionPolygons(
    a: readonly Point[][][],
    b: readonly Point[][][]
): readonly Point[][][] {
    return toReadonly(
        polygonClipping.union(toMutable(a), toMutable(b))
    );
}

/**
 * Пересечение двух MultiPolygon.
 */
export function intersectPolygons(
    a: readonly Point[][][],
    b: readonly Point[][][]
): readonly Point[][][] {
    return toReadonly(
        polygonClipping.intersection(toMutable(a), toMutable(b))
    );
}