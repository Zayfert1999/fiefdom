// packages/shared/src/core/geometryPointInPolygon.ts
// ============================================
// 📐 ПРОВЕРКА ТОЧКИ ВНУТРИ ПОЛИГОНА
// ============================================
// Используется для привязки вычисленных полигонов
// к полевым фичам через `meepleSpot`.
// ============================================
import type { Point } from './geometry.types';

/**
 * Алгоритм лучевого трассирования (ray casting).
 * Работает с полигоном любой ориентации (по/против часовой).
 * @param point Проверяемая точка
 * @param ring  Замкнутый контур (массив точек)
 * @returns true, если точка внутри контура
 */
export function pointInRing(point: Point, ring: readonly Point[]): boolean {
    const [px, py] = point;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];

        const intersects =
            (yi > py) !== (yj > py) &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

        if (intersects) inside = !inside;
    }

    return inside;
}

/**
 * Проверка точки в полигоне с учётом дырок.
 * Полигон = [внешний контур, ...дырки].
 * Точка внутри, если она во внешнем контуре И НЕ в дырках.
 */
export function pointInPolygon(
    point: Point,
    polygon: readonly Point[][]
): boolean {
    if (polygon.length === 0) return false;

    // Должна быть внутри внешнего контура
    if (!pointInRing(point, polygon[0])) return false;

    // Не должна быть ни в одной дырке
    for (let i = 1; i < polygon.length; i++) {
        if (pointInRing(point, polygon[i])) return false;
    }

    return true;
}

/** Проверка точки в MultiPolygon */
export function multiPolygonContainsPoint(
    multiPolygon: readonly Point[][][],
    point: Point
): boolean {
    return multiPolygon.some(polygon => pointInPolygon(point, polygon));
}