// packages/shared/src/core/geometryToSvg.ts
// ============================================
// 🛠️ УНИВЕРСАЛЬНЫЙ ПОСТРОИТЕЛЬ SVG PATH
// ============================================
import type { Ring, Polygon, MultiPolygon } from '../../../../shared/src/core/geometry.types';

// ============================================
// 🔍 ОПРЕДЕЛЕНИЕ ТИПА ПО ВЛОЖЕННОСТИ
// ============================================

/** Проверяет, является ли значение Ring (массив точек) */
function isRing(data: unknown): data is Ring {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof (data as unknown[])[0] === 'object' &&
    Array.isArray((data as unknown[])[0]) &&
    typeof ((data as unknown[])[0] as unknown[])[0] === 'number'
  );
}

/** Проверяет, является ли значение Polygon (массив rings) */
function isPolygon(data: unknown): data is Polygon {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    isRing((data as unknown[])[0])
  );
}

// ============================================
// 🛠️ БАЗОВЫЕ ФУНКЦИИ
// ============================================

/** 🛠️ Один Ring → d-строка. Автоматически замыкает путь командой Z. */
export function ringToPathD(points: Ring): string {
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
 * Принимает геометрию любого уровня вложенности:
 * • `Ring`         → один замкнутый контур
 * • `Polygon`      → полигон с дырками (fill-rule="evenodd")
 * • `MultiPolygon` → мультиполигон
 */
export function toPathD(data: Ring | Polygon | MultiPolygon): string {
  if (isRing(data)) {
    return ringToPathD(data);
  }

  if (isPolygon(data)) {
    return (data as Polygon)
      .map(ring => ringToPathD(ring))
      .join(' ');
  }

  // MultiPolygon
  const mp = data as MultiPolygon;
  return mp
    .map(polygon =>
      polygon.map(ring => ringToPathD(ring)).join(' ')
    )
    .join(' ');
}