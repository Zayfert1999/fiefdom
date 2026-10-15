// packages/shared/src/core/tessellate.ts
// ============================================
// 📐 ТЕССЕЛЯЦИЯ КРИВЫХ В ПОЛИЛИНИИ
// ============================================
import type {
  Point,
  Ring,
  AreaGeometry,
  LineGeometry,
  OutlineSegment,
  PathSegment,
} from '@fiefdom/shared/core/geometry.types';

/** Количество сегментов на одну кривую Безье */
export const TESSELLATION = 8;

// ============================================
// 📐 ПРИВАТНЫЕ ХЕЛПЕРЫ: точка на кривой
// ============================================

/** Точка на квадратичной Безье при параметре t ∈ [0, 1] */
const quadAt = (p0: Point, cp: Point, p1: Point, t: number): Point => {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * cp[0] + t * t * p1[0],
    mt * mt * p0[1] + 2 * mt * t * cp[1] + t * t * p1[1],
  ];
};

/** Точка на кубической Безье при параметре t ∈ [0, 1] */
const cubicAt = (p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return [
    mt2 * mt * p0[0] + 3 * mt2 * t * c1[0] + 3 * mt * t2 * c2[0] + t2 * t * p1[0],
    mt2 * mt * p0[1] + 3 * mt2 * t * c1[1] + 3 * mt * t2 * c2[1] + t2 * t * p1[1],
  ];
};

// ============================================
// 🧩 ОБЩИЙ ИТЕРАТОР ПО СЕГМЕНТАМ
// ============================================

/**
 * Развёртывает массив сегментов в плоский массив точек.
 * Кривые Безье заменяются на TESSELLATION промежуточных точек.
 */
function tessellateSegments(
  segments: readonly (OutlineSegment | PathSegment)[],
  start: Point
): Ring {
  const points: Point[] = [start];
  let current = start;

  for (const seg of segments) {
    switch (seg.type) {
      case 'line':
        points.push(seg.to);
        current = seg.to;
        break;
      case 'quadratic':
        for (let i = 1; i <= TESSELLATION; i++) {
          points.push(quadAt(current, seg.cp, seg.to, i / TESSELLATION));
        }
        current = seg.to;
        break;
      case 'bezier':
        for (let i = 1; i <= TESSELLATION; i++) {
          points.push(cubicAt(current, seg.cp1, seg.cp2, seg.to, i / TESSELLATION));
        }
        current = seg.to;
        break;
      case 'close':
        break;
      case 'arc':
        points.push(seg.to);
        current = seg.to;
        break;
    }
  }

  return points;
}

// ============================================
// 🏛️ AREA: замкнутая область → Ring
// ============================================

/**
 * Преобразует `AreaGeometry` в Ring (замкнутый контур).
 */
export function tessellateArea(geo: AreaGeometry): Ring {
  return tessellateSegments(geo.outline, geo.start);
}

// ============================================
// 🛤️ LINE: путь → TessellatedLine
// ============================================

/** Результат тесселяции дороги */
export interface TessellatedLine {
  /** Центральная осевая линия (для отладки) */
  center: Ring;
  /** Левый контур (смещён на +lineWidth/2 по нормали) */
  left: Ring;
  /** Правый контур (смещён на -lineWidth/2 по нормали) */
  right: Ring;
}

/**
 * Преобразует `LineGeometry` в три полилинии.
 */
export function tessellateLine(geo: LineGeometry): TessellatedLine {
  const center = tessellateSegments(geo.path, geo.start);
  const halfWidth = geo.lineWidth / 2;
  const left: Point[] = [];
  const right: Point[] = [];

  for (let i = 0; i < center.length; i++) {
    const prev = center[Math.max(0, i - 1)];
    const next = center[Math.min(center.length - 1, i + 1)];
    const curr = center[i];

    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) {
      left.push(curr);
      right.push(curr);
      continue;
    }

    const nx = -dy / len;
    const ny = dx / len;

    left.push([curr[0] + nx * halfWidth, curr[1] + ny * halfWidth]);
    right.push([curr[0] - nx * halfWidth, curr[1] - ny * halfWidth]);
  }

  return { center, left, right };
}

// ============================================
// 🏗️ УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ ЛЮБОЙ ФИЧИ
// ============================================

/**
 * Тесселирует любую фичу в Ring (замкнутый контур).
 * Для `area` — возвращает outline.
 * Для `line` — возвращает left + reverse(right).
 */
export function tessellateFeature(
  geometry: AreaGeometry | LineGeometry
): Ring {
  if (geometry.kind === 'area') {
    return tessellateArea(geometry);
  }
  const { left, right } = tessellateLine(geometry);
  const reversedRight = [...right].reverse();
  return [...left, ...reversedRight];
}