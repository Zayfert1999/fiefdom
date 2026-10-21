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
import {
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
export const ROAD_PARAMS = {
  /** Ширина дороги */
  width: 20,
  /** Длина прямого «хвоста» у края в повороте */
  cornerStub: 25,
  /** Вынос контрольных точек скругления */
  cornerCtrl: 15,
  /** Длина прямого «хвоста» в прямой дороге */
  straightStub: 20,
  /** Глубина дуги города для тупиковой дороги */
  cityArcDepth: 30,
  /**
   * Заход тупиковой дороги ПОД город/монастырь (юниты).
   * Дорога всё равно вычитается из контура города в пайплайне,
   * но без захода шум на контуре города оставляет щель между
   * торцом дороги и городом.
   */
  endOverlap: 6,
} as const;

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
  width: number,
  arcDepth: ReadonlyMap<Side, number>
): LineGeometry | null {
  const P = ROAD_PARAMS;
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
    const s1_ = P.cornerStub;
    const s2_ = P.cornerStub;
    const c1 = P.cornerCtrl;
    const c2 = P.cornerCtrl;

    const path: PathSegment[] = [
      line([0, HALF - s1_]),
      bezier([0, HALF - s1_ - c1], [s2_ - c2, 0], [s2_, 0]),
      line([HALF, 0]),
    ];
    return rotatePath([0, HALF], path, k, width);
  }

  if (sides.length === 1) {
    // Тупик
    const side = sides[0];
    let reach = HALF;

    if (ctx.monasteryHalf !== null) {
      reach = HALF - ctx.monasteryHalf + P.endOverlap;
    } else if (ctx.cityArcSides.has(side)) {
      reach = (arcDepth.get(side) ?? P.cityArcDepth) + P.endOverlap;
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
  width: number,
  arcDepth: ReadonlyMap<Side, number>
): RoadResult | null {
  const geometry = build(road, ctx, width, arcDepth);
  if (!geometry) return null;
  return { geometry };
}