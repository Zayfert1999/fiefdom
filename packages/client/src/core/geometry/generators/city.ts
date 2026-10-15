// packages/client/src/core/geometry/generators/city.ts
// ============================================
// 🏰 ГЕНЕРАЦИЯ ГОРОДА ПО ПОРТАМ
// ============================================
// Форма определяется набором сторон, которые занимает город:
//
//   4 стороны            → квадрат на весь тайл
//   3 стороны            → квадрат с дугой-вырезом на свободной стороне
//   2 противоположные    → «песочные часы»: дуги на обеих свободных сторонах
//   2 соседние           → диагональная граница с изгибом
//   1 сторона            → «шапка» — дуга у одной стороны
//
// Размеры эталонных форм (jitter = 0) совпадают с нарисованными в base.json.
// Рандомизация меняет только кривизну дуг и их симметрию; концы дуг
// остаются в углах тайла, поэтому город стыкуется с соседним тайлом.
// ============================================
import type {
  AreaGeometry,
  OutlineSegment,
  Point,
} from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { pointInRing } from '../geometryPointInPolygon';
import { tessellateArea } from '../tessellate';
import {
  ALL_SIDES,
  HALF,
  centerSides,
  mod4,
  rotatePoint,
  type Rng,
  type RngFactory,
  type Side,
  type TileContext,
} from './sides';

/** Параметры форм (в единицах тайла 100×100). Меняйте здесь. */
export const CITY_PARAMS = {
  /** Глубина «шапки» и выреза (расстояние от стороны тайла до вершины дуги) */
  capDepth: 20,
  /** Глубина выреза, в который упирается дорога (дорога ведёт до вершины дуги) */
  roadArcDepth: 30,
  /** Изгиб диагональной границы (смещение контрольной точки по каждой оси) */
  diagBulge: 20,
  /** Разброс глубины дуги */
  depthJitter: 3,
  /** Разброс смещения вершины дуги вдоль стороны (асимметрия) */
  shiftJitter: 5,
  /** Разброс изгиба диагонали */
  diagJitter: 3,
  /** Разброс смещения изгиба диагонали вдоль хорды */
  diagShiftJitter: 4,
} as const;

export interface CityResult {
  readonly geometry: AreaGeometry;
  /** Глубина дуг, к которым подходят дороги (side → глубина от границы тайла) */
  readonly arcDepth: ReadonlyMap<Side, number>;
  /** true — рандомизированная форма не покрыла метки, использован эталон */
  readonly fallback: boolean;
}

const line = (to: Point): OutlineSegment => ({ type: 'line', to });
const quad = (cp: Point, to: Point): OutlineSegment => ({ type: 'quadratic', cp, to });
const CLOSE: OutlineSegment = { type: 'close' };

function rotateOutline(start: Point, outline: readonly OutlineSegment[], k: number): AreaGeometry {
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

function build(
  city: TileFeature,
  ctx: TileContext,
  rng: Rng,
  amp: number,
): Omit<CityResult, 'fallback'> | null {
  const P = CITY_PARAMS;
  const sides = centerSides(city);
  /** Случайное число из [−range, +range], масштабированное амплитудой */
  const j = (range: number): number => (rng() * 2 - 1) * range * amp + 0;
  const arcDepth = new Map<Side, number>();

  let start: Point;
  let outline: OutlineSegment[];
  let k: number;

  switch (sides.length) {
    case 4: {
      start = [-HALF, -HALF];
      outline = [line([-HALF, HALF]), line([HALF, HALF]), line([HALF, -HALF]), CLOSE];
      k = 0;
      break;
    }

    case 3: {
      // Каноника: свободная сторона — S (2)
      const missing = ALL_SIDES.find(s => !sides.includes(s)) as Side;
      const withRoad = ctx.deadEndRoadSides.has(missing);
      const depth = withRoad ? P.roadArcDepth : P.capDepth + j(P.depthJitter);
      const shift = withRoad ? 0 : j(P.shiftJitter);
      start = [-HALF, -HALF];
      outline = [
        line([-HALF, HALF]),
        quad([shift, HALF - 2 * depth], [HALF, HALF]),
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
        // Две противоположные стороны. Каноника: E–W, свободные N и S
        k = s0 === 0 ? 1 : 0;
        const mN = mod4(k);
        const mS = mod4(2 + k);
        const roadN = ctx.deadEndRoadSides.has(mN);
        const roadS = ctx.deadEndRoadSides.has(mS);
        const dN = roadN ? P.roadArcDepth : P.capDepth + j(P.depthJitter);
        const dS = roadS ? P.roadArcDepth : P.capDepth + j(P.depthJitter);
        const xN = roadN ? 0 : j(P.shiftJitter);
        const xS = roadS ? 0 : j(P.shiftJitter);
        start = [-HALF, -HALF];
        outline = [
          quad([xN, -HALF + 2 * dN], [HALF, -HALF]),
          line([HALF, HALF]),
          quad([xS, HALF - 2 * dS], [-HALF, HALF]),
          CLOSE,
        ];
        if (roadN) arcDepth.set(mN, dN);
        if (roadS) arcDepth.set(mS, dS);
      } else {
        // Две соседние стороны (a, a+1). Каноника: N+E, угол K = NE
        const a = (ALL_SIDES.find(s => sides.includes(s) && sides.includes(mod4(s + 1))) ?? 0) as Side;
        // Если дорога занимает противоположный угол — город уступает ей место (вогнутая граница)
        const inward = ctx.roadSides.has(mod4(a + 2)) || ctx.roadSides.has(mod4(a + 3));
        const sign = inward ? -1 : 1;
        const m = P.diagBulge + j(P.diagJitter);
        const t = j(P.diagShiftJitter);
        start = [-HALF, -HALF];
        outline = [
          quad([-sign * m + t, sign * m + t], [HALF, HALF]),
          line([HALF, -HALF]),
          CLOSE,
        ];
        k = a;
      }
      break;
    }

    case 1: {
      // Каноника: город у стороны N
      const depth = P.capDepth + j(P.depthJitter);
      const shift = j(P.shiftJitter);
      start = [HALF, -HALF];
      outline = [quad([shift, -HALF + 2 * depth], [-HALF, -HALF]), CLOSE];
      k = sides[0];
      break;
    }

    default:
      return null;
  }

  return { geometry: rotateOutline(start, outline, k), arcDepth };
}

/** Метки города (щит, место для мипла) должны лежать внутри контура */
function spotsInside(geometry: AreaGeometry, city: TileFeature): boolean {
  const ring = tessellateArea(geometry);
  if (!pointInRing([city.meepleSpot.x, city.meepleSpot.y], ring)) return false;
  if (city.shieldSpot && !pointInRing([city.shieldSpot.x, city.shieldSpot.y], ring)) return false;
  return true;
}

/**
 * Генерирует контур города по его портам.
 * @param amp амплитуда рандомизации 0..1 (0 — эталонная форма)
 * @returns null, если набор портов не поддерживается
 */
export function generateCity(
  city: TileFeature,
  ctx: TileContext,
  makeRng: RngFactory,
  amp: number,
): CityResult | null {
  const result = build(city, ctx, makeRng(), amp);
  if (!result) return null;

  if (amp > 0 && !spotsInside(result.geometry, city)) {
    const baseline = build(city, ctx, makeRng(), 0);
    if (baseline) return { ...baseline, fallback: true };
  }
  return { ...result, fallback: false };
}