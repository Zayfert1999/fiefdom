// packages/client/src/core/geometry/generators/sides.ts
// ============================================
// 🧭 СТОРОНЫ ТАЙЛА, ПОВОРОТЫ И КОНТЕКСТ ТАЙЛА
// ============================================
// Генераторы работают в «канонической» ориентации и поворачивают
// результат на k·90° по часовой стрелке (ось Y направлена вниз).
// Поворот — точная перестановка координат, без sin/cos:
// углы тайла и центры сторон остаются целыми числами,
// а значит соседние тайлы стыкуются бит-в-бит.
// ============================================
import type { Point } from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { PORTS_PER_SIDE, getPortSide } from '@fiefdom/shared/core/portUtils';

/** Сторона тайла: 0=N, 1=E, 2=S, 3=W (как Dir в shared) */
export type Side = 0 | 1 | 2 | 3;

/** Половина стороны тайла: система координат [-50, 50] */
export const HALF = 50;

/** Половина стороны монастыря по умолчанию (если у монастыря нет геометрии) */
export const MONASTERY_HALF_DEFAULT = 20;

export const ALL_SIDES: readonly Side[] = [0, 1, 2, 3];

export const mod4 = (n: number): Side => (((n % 4) + 4) % 4) as Side;

/** Поворот точки на k·90° по часовой стрелке: (x, y) → (−y, x) */
export function rotatePoint(p: Point, k: number): Point {
  let x = p[0];
  let y = p[1];
  for (let i = mod4(k); i > 0; i--) {
    const nx = -y;
    y = x;
    x = nx;
  }
  return [x + 0, y + 0]; // «+ 0» превращает −0 в 0
}

/**
 * Стороны, чьи ЦЕНТРАЛЬНЫЕ порты (1, 4, 7, 10) занимает фича.
 * Города и дороги всегда привязаны к центрам сторон.
 */
export function centerSides(feature: TileFeature): Side[] {
  const sides = new Set<Side>();
  for (const port of feature.ports) {
    if (port % PORTS_PER_SIDE === 1) sides.add(getPortSide(port));
  }
  return [...sides].sort((a, b) => a - b);
}

/** Сторона, на которой у города «вырез» (дуга снаружи), если он занимает 3 стороны или 2 противоположные */
export function cityArcSides(citySides: readonly Side[]): Side[] {
  if (citySides.length === 3) {
    return ALL_SIDES.filter(s => !citySides.includes(s));
  }
  if (citySides.length === 2 && mod4(citySides[1] - citySides[0]) === 2) {
    return ALL_SIDES.filter(s => !citySides.includes(s));
  }
  return [];
}

/** Контекст тайла: то, что фичи должны знать друг о друге */
export interface TileContext {
  /** Половина стороны монастыря; null — монастыря на тайле нет */
  readonly monasteryHalf: number | null;
  /** Стороны, где дорога заканчивается внутри тайла (один центр-порт) */
  readonly deadEndRoadSides: ReadonlySet<Side>;
  /** Стороны, которые занимает любая дорога */
  readonly roadSides: ReadonlySet<Side>;
  /** Стороны, на которых у города дуга-вырез */
  readonly cityArcSides: ReadonlySet<Side>;
}

export function buildContext(features: readonly TileFeature[]): TileContext {
  const deadEnd = new Set<Side>();
  const roadSides = new Set<Side>();
  const arcSides = new Set<Side>();
  let monasteryHalf: number | null = null;

  for (const f of features) {
    if (f.type === 'road') {
      const sides = centerSides(f);
      for (const s of sides) roadSides.add(s);
      if (sides.length === 1) deadEnd.add(sides[0]);
    } else if (f.type === 'city') {
      for (const s of cityArcSides(centerSides(f))) arcSides.add(s);
    } else if (f.type === 'monastery') {
      monasteryHalf = MONASTERY_HALF_DEFAULT;
    }
  }

  return {
    monasteryHalf,
    deadEndRoadSides: deadEnd,
    roadSides,
    cityArcSides: arcSides,
  };
}