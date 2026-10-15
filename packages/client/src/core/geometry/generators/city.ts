// packages/client/src/core/geometry/generators/city.ts
// ============================================
// 🏰 ГЕНЕРАЦИЯ ГОРОДА ПО ПОРТАМ (ЧИСТЫЕ ФОРМЫ)
// ============================================
// Генератор строит эталонные формы БЕЗ рандомизации.
// Органическая неровность добавляется пост-процессором
// шума Перлина на этапе тесселяции.
//
//   4 стороны            → квадрат на весь тайл
//   3 стороны            → квадрат с дугой-вырезом
//   2 противоположные    → «песочные часы»
//   2 соседние           → диагональная граница
//   1 сторона            → «шапка»
// ============================================
import type {
  AreaGeometry,
  OutlineSegment,
  Point,
} from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import {
  ALL_SIDES,
  HALF,
  centerSides,
  mod4,
  rotatePoint,
  type Side,
  type TileContext,
} from './sides';

// ============================================
// ⚙️ ПАРАМЕТРЫ ФОРМ (ФИКСИРОВАННЫЕ)
// ============================================
export const CITY_PARAMS = {
  /** Глубина «шапки» и выреза */
  capDepth: 20,
  /** Глубина выреза для дороги */
  roadArcDepth: 30,
  /** Изгиб диагональной границы */
  diagBulge: 20,
} as const;

export interface CityResult {
  readonly geometry: AreaGeometry;
  /** Глубина дуг для дорог (side → глубина) */
  readonly arcDepth: ReadonlyMap<Side, number>;
}

// ============================================
// 🛠️ ХЕЛПЕРЫ
// ============================================
const line = (to: Point): OutlineSegment => ({ type: 'line', to });
const quad = (cp: Point, to: Point): OutlineSegment => ({ type: 'quadratic', cp, to });
const CLOSE: OutlineSegment = { type: 'close' };

function rotateOutline(
  start: Point,
  outline: readonly OutlineSegment[],
  k: number
): AreaGeometry {
  const rp = (p: Point): Point => rotatePoint(p, k);
  return {
    kind: 'area',
    start: rp(start),
    outline: outline.map((seg): OutlineSegment => {
      switch (seg.type) {
        case 'line':
          return { type: 'line', to: rp(seg.to) };
        case 'quadratic':
          return { type: 'quadratic', cp: rp(seg.cp), to: rp(seg.to) };
        case 'bezier':
          return { type: 'bezier', cp1: rp(seg.cp1), cp2: rp(seg.cp2), to: rp(seg.to) };
        default:
          return seg;
      }
    }),
  };
}

// ============================================
// 🏗️ ПОСТРОЕНИЕ ФОРМЫ
// ============================================
function build(
  city: TileFeature,
  ctx: TileContext
): Omit<CityResult, never> | null {
  const P = CITY_PARAMS;
  const sides = centerSides(city);
  const arcDepth = new Map<Side, number>();

  let start: Point;
  let outline: OutlineSegment[];
  let k: number;

  switch (sides.length) {
    case 4: {
      start = [-HALF, -HALF];
      outline = [
        line([-HALF, HALF]),
        line([HALF, HALF]),
        line([HALF, -HALF]),
        CLOSE,
      ];
      k = 0;
      break;
    }

    case 3: {
      const missing = ALL_SIDES.find(s => !sides.includes(s)) as Side;
      const withRoad = ctx.deadEndRoadSides.has(missing);
      const depth = withRoad ? P.roadArcDepth : P.capDepth;

      start = [-HALF, -HALF];
      outline = [
        line([-HALF, HALF]),
        quad([0, HALF - 2 * depth], [HALF, HALF]),
        line([HALF, -HALF]),
        CLOSE,
      ];
      k = mod4(missing - 2);
      if (withRoad) arcDepth.set(missing, depth);
      break;
    }

    case 2: {
      const [s0, s1] = sides;

      if (mod4(s1 - s0) === 2) {
        // Противоположные стороны → «песочные часы»
        k = s0 === 0 ? 1 : 0;
        const mN = mod4(k);
        const mS = mod4(2 + k);
        const roadN = ctx.deadEndRoadSides.has(mN);
        const roadS = ctx.deadEndRoadSides.has(mS);
        const dN = roadN ? P.roadArcDepth : P.capDepth;
        const dS = roadS ? P.roadArcDepth : P.capDepth;

        start = [-HALF, -HALF];
        outline = [
          quad([0, -HALF + 2 * dN], [HALF, -HALF]),
          line([HALF, HALF]),
          quad([0, HALF - 2 * dS], [-HALF, HALF]),
          CLOSE,
        ];
        if (roadN) arcDepth.set(mN, dN);
        if (roadS) arcDepth.set(mS, dS);
      } else {
        // Соседние стороны → диагональ
        const a = (ALL_SIDES.find(
          s => sides.includes(s) && sides.includes(mod4(s + 1))
        ) ?? 0) as Side;

        const inward =
          ctx.roadSides.has(mod4(a + 2)) ||
          ctx.roadSides.has(mod4(a + 3));
        const sign = inward ? -1 : 1;
        const m = P.diagBulge;

        start = [-HALF, -HALF];
        outline = [
          quad([-sign * m, sign * m], [HALF, HALF]),
          line([HALF, -HALF]),
          CLOSE,
        ];
        k = a;
      }
      break;
    }

    case 1: {
      const depth = P.capDepth;
      start = [HALF, -HALF];
      outline = [
        quad([0, -HALF + 2 * depth], [-HALF, -HALF]),
        CLOSE,
      ];
      k = sides[0];
      break;
    }

    default:
      return null;
  }

  return { geometry: rotateOutline(start, outline, k), arcDepth };
}

// ============================================
// 📤 PUBLIC API
// ============================================
/**
 * Генерирует контур города по портам.
 * Чистая форма без рандомизации — шум добавляется пост-процессором.
 *
 * @returns null если набор портов не поддерживается
 */
export function generateCity(
  city: TileFeature,
  ctx: TileContext
): CityResult | null {
  return build(city, ctx);
}