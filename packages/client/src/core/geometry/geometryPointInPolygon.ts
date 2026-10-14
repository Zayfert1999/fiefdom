// packages/shared/src/core/geometryPointInPolygon.ts
// ============================================
// 📐 ПРОВЕРКА ТОЧКИ ВНУТРИ ПОЛИГОНА
// ============================================
import type { Point, Ring, Polygon, MultiPolygon } from '../../../../shared/src/core/geometry.types';

/**
 * Алгоритм лучевого трассирования (ray casting).
 * @param point Проверяемая точка
 * @param ring  Замкнутый контур (Ring)
 */
export function pointInRing(point: Point, ring: Ring): boolean {
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
 * Проверка точки в Polygon с учётом дырок.
 * Polygon = [внешний контур, ...дырки].
 */
export function pointInPolygon(
  point: Point,
  polygon: Polygon
): boolean {
  if (polygon.length === 0) return false;

  if (!pointInRing(point, polygon[0])) return false;

  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false;
  }

  return true;
}

/** Проверка точки в MultiPolygon */
export function multiPolygonContainsPoint(
  multiPolygon: MultiPolygon,
  point: Point
): boolean {
  return multiPolygon.some(polygon => pointInPolygon(point, polygon));
}