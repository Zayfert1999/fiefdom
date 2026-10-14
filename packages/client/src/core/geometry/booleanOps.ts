// packages/client/src/core/geometry/booleanOps.ts
// ============================================
// 🔲 БУЛЕВЫ ОПЕРАЦИИ НАД ПОЛИГОНАМИ (clipper2-ts)
// ============================================
// Модуль живёт ТОЛЬКО на клиенте (рендеринг/песочница).
//
// Отличия от прежней реализации на polygon-clipping:
//   • clipper2-ts принимает/возвращает ПЛОСКИЕ пути {x, y}:
//     внешние контуры и дырки — в одном массиве, различаются
//     ориентацией (положительная площадь = внешний контур)
//   • наш внутренний формат — Polygon = [outer, ...holes],
//     поэтому здесь конвертеры в обе стороны + нормализация
//     ориентации колец (обязательна для FillRule.NonZero)
// ============================================
import { difference, union, intersect, FillRule } from 'clipper2-ts';
import type { Point, Ring, Polygon, MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import { pointInRing } from './geometryPointInPolygon';

// Плоские пути, которые ожидает и возвращает clipper2-ts
type ClipPoint = { x: number; y: number };
type ClipPaths = ClipPoint[][];

const FILL_RULE = FillRule.NonZero;

// ============================================
// 📐 БАЗОВЫЙ КВАДРАТ ТАЙЛА
// ============================================
export const TILE_SQUARE: Ring = [
  [-50, -50],
  [50, -50],
  [50, 50],
  [-50, 50],
];

// ============================================
// 📏 ОРИЕНТАЦИЯ КОЛЕЦ
// ============================================

/** Знаковая площадь (shoelace). > 0 — обход против часовой (матем. ориентация). */
function signedArea(ring: Ring): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** Возвращает кольцо с требуемой ориентацией (входное не мутирует). */
function orientRing(ring: Ring, positive: boolean): Ring {
  return (signedArea(ring) > 0) === positive ? ring : [...ring].reverse();
}

// ============================================
// 🔄 КОНВЕРТЕРЫ ФОРМАТОВ
// ============================================

/** MultiPolygon ([outer, ...holes]) → плоские пути clipper2-ts. */
function toClipPaths(mp: MultiPolygon): ClipPaths {
  const paths: ClipPaths = [];
  for (const polygon of mp) {
    if (polygon.length === 0 || polygon[0].length < 3) continue;
    // Внешний контур — положительная площадь, дырки — отрицательная
    paths.push(orientRing(polygon[0], true).map(([x, y]) => ({ x, y })));
    for (let i = 1; i < polygon.length; i++) {
      if (polygon[i].length < 3) continue;
      paths.push(orientRing(polygon[i], false).map(([x, y]) => ({ x, y })));
    }
  }
  return paths;
}

/**
 * Плоские пути clipper2-ts → наш MultiPolygon.
 * Внешние контуры (площадь > 0) и дырки (площадь < 0) разводим по знаку
 * площади; каждую дырку привязываем к внешнему контуру, который её содержит.
 */
function fromClipPaths(paths: ClipPaths): MultiPolygon {
  const outers: Array<{ ring: Ring; holes: Ring[] }> = [];
  const holes: Ring[] = [];

  for (const path of paths) {
    if (path.length < 3) continue;
    const ring = path.map(p => [p.x, p.y] as Point);
    const area = signedArea(ring);
    if (Math.abs(area) < 1e-9) continue; // вырожденное кольцо
    if (area > 0) outers.push({ ring, holes: [] });
    else holes.push(ring);
  }

  for (const hole of holes) {
    const parent = outers.find(o => pointInRing(hole[0], o.ring));
    if (parent) {
      parent.holes.push(hole);
    } else {
      // При корректных входных данных недостижимо —
      // предупреждаем, а не молча рисуем артефакт
      console.warn('⚠️ [booleanOps] Дырка без внешнего контура — пропущена');
    }
  }

  return outers.map(o => [o.ring, ...o.holes]);
}

/**
 * Дочистка решения: union по пустому клипу снимает касания
 * между соседними полигонами (рекомендация из документации Clipper2).
 */
function cleanup(paths: ClipPaths): ClipPaths {
  if (paths.length <= 1) return paths;
  try {
    return union(paths, [], FILL_RULE);
  } catch {
    return paths; // не ломаем пайплайн из-за неожиданного поведения порта
  }
}

// ============================================
// 🧮 БУЛЕВЫ ОПЕРАЦИИ (публичный API — сигнатуры прежние)
// ============================================

/**
 * Вычитает массив полигонов из subject.
 * Вычитание идёт по одному полигону — семантика старого кода сохранена.
 */
export function subtractPolygons(
  subject: MultiPolygon,
  subtract: MultiPolygon
): MultiPolygon {
  if (subject.length === 0) return [];

  const clipPaths = toClipPaths(subtract);
  if (clipPaths.length === 0) return subject;

  let result = toClipPaths(subject);
  for (const clipPath of clipPaths) {
    result = difference(result, [clipPath], FILL_RULE);
    if (result.length === 0) break;
  }

  return fromClipPaths(cleanup(result));
}

/** Быстрая операция: вычитание одного полигона из subject */
export function subtractOne(
  subject: MultiPolygon,
  polygon: Polygon
): MultiPolygon {
  if (subject.length === 0) return [];
  return fromClipPaths(
    difference(toClipPaths(subject), toClipPaths([polygon]), FILL_RULE)
  );
}

/** Объединение двух MultiPolygon */
export function unionPolygons(
  a: MultiPolygon,
  b: MultiPolygon
): MultiPolygon {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  return fromClipPaths(cleanup(union(toClipPaths(a), toClipPaths(b), FILL_RULE)));
}

/** Пересечение двух MultiPolygon */
export function intersectPolygons(
  a: MultiPolygon,
  b: MultiPolygon
): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];
  return fromClipPaths(intersect(toClipPaths(a), toClipPaths(b), FILL_RULE));
}