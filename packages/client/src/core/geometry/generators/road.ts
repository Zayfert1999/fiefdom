// packages/client/src/core/geometry/generators/road.ts
// ============================================
// 🛤️ ГЕНЕРАЦИЯ ДОРОГИ ПО ПОРТАМ (ЧИСТЫЕ ФОРМЫ)
// ============================================
// Генератор строит эталонные формы БЕЗ рандомизации.
// Органическая неровность добавляется пост-процессором.
//
//   2 противоположных порта → прямая
//   2 соседних порта        → поворот
//   1 порт                  → тупик
//
// Правило стыковки: дорога входит в сторону тайла
// строго перпендикулярно и в её центре.
// ============================================
import type {
  LineGeometry,
  PathSegment,
  Point,
} from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { DEFAULT_SHAPE_PARAMS, type RoadShapeParams } from './shapeParams';
import {
  HALF,
  centerSides,
  mod4,
  rotatePoint,
  type Side,
  type TileContext,
} from './sides';

// ============================================
// ⚙️ ПАРАМЕТРЫ ФОРМЫ
// ============================================
/** @deprecated Значения по умолчанию. Используйте DEFAULT_SHAPE_PARAMS.road или параметры из geometryParams.json */
export const ROAD_PARAMS = DEFAULT_SHAPE_PARAMS.road;

export interface RoadResult {
  readonly geometry: LineGeometry;
}

// ============================================
// 🛠️ ХЕЛПЕРЫ
// ============================================
const line = (to: Point): PathSegment => ({ type: 'line', to });
const bezier = (
  cp1: Point, cp2: Point, to: Point
): PathSegment => ({ type: 'bezier', cp1, cp2, to });

function rotatePath(
  start: Point,
  path: readonly PathSegment[],
  k: number,
  lineWidth: number
): LineGeometry {
  const rp = (p: Point): Point => rotatePoint(p, k);
  return {
    kind: 'line',
    lineWidth,
    start: rp(start),
    path: path.map((seg): PathSegment => {
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
  road: TileFeature,
  ctx: TileContext,
  arcDepth: ReadonlyMap<Side, number>,
  P: RoadShapeParams,
  fallbackArcDepth: number
): LineGeometry | null {
  const width = P.width;
  const endOverlap = P.endOverlap;
  const sides = centerSides(road);

  if (sides.length === 2) {
    const [s0, s1] = sides;

    if (mod4(s1 - s0) === 2) {
      // Прямая: с севера на юг
      const k = s0 === 0 ? 0 : 1;
      const start: Point = [0, -HALF];
      return rotatePath(start, [line([0, HALF])], k, width);
    }

    // Поворот между соседними сторонами
    const a = sides.find(s => sides.includes(mod4(s + 1))) ?? s0;
    const k = mod4(a - 1);
    // Поворот из (0, HALF) в (HALF, 0): прямые хвосты длиной HALF − R у обоих краёв
    // и дуга от (0, R) до (R, 0). Вынос контрольных точек = R·натяжение
    // (≈0.55 даёт круг). При R = 25 и натяжении 0.6 форма как у прежних констант.
    const R = P.cornerRadius;
    const ctrl = R * P.cornerTension;

    const path: PathSegment[] = [
      line([0, R]),
      bezier([0, R - ctrl], [R - ctrl, 0], [R, 0]),
      line([HALF, 0]),
    ];
    return rotatePath([0, HALF], path, k, width);
  }

  if (sides.length === 1) {
    // Тупик
    const side = sides[0];
    let reach = HALF;

    if (ctx.monasteryHalf !== null) {
      reach = HALF - ctx.monasteryHalf + endOverlap;
    } else if (ctx.cityArcSides.has(side)) {
      reach = (arcDepth.get(side) ?? fallbackArcDepth) + endOverlap;
    }

    return rotatePath([0, -HALF], [line([0, -HALF + reach])], side, width);
  }

  return null;
}

// ============================================
// 📤 PUBLIC API
// ============================================
/**
 * Генерирует осевую линию дороги по портам.
 * Чистая форма без рандомизации.
 */
export function generateRoad(
  road: TileFeature,
  ctx: TileContext,
  arcDepth: ReadonlyMap<Side, number>,
  params: RoadShapeParams = DEFAULT_SHAPE_PARAMS.road,
  /** Глубина выреза города под дорогу, если города на этой стороне нет в arcDepth (запасное значение) */
  fallbackArcDepth: number = DEFAULT_SHAPE_PARAMS.city.roadArcDepth
): RoadResult | null {
  const geometry = build(road, ctx, arcDepth, params, fallbackArcDepth);
  if (!geometry) return null;
  return { geometry };
}