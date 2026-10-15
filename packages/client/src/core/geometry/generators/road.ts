// packages/client/src/core/geometry/generators/road.ts
// ============================================
// 🛤️ ГЕНЕРАЦИЯ ДОРОГИ ПО ПОРТАМ
// ============================================
//   2 противоположных порта → прямая (с лёгким изгибом при рандомизации)
//   2 соседних порта        → поворот: прямой «хвост», скругление, прямой «хвост»
//   1 порт                  → тупик: от края тайла до цели
//                             (центр / край монастыря / вершина дуги города)
//
// Правило стыковки: дорога всегда входит в сторону тайла строго перпендикулярно
// и ровно в её центре — прямым отрезком. Рандомизация трогает только
// внутреннюю часть, поэтому дороги соседних тайлов продолжают друг друга без излома.
// ============================================
import type {
  LineGeometry,
  PathSegment,
  Point,
} from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { tessellateLine } from '../tessellate';
import {
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
export const ROAD_PARAMS = {
  /** Ширина дороги */
  width: 20,
  /** Длина прямого «хвоста» у края в повороте */
  cornerStub: 25,
  /** Вынос контрольных точек скругления (чем больше, тем плавнее поворот) */
  cornerCtrl: 15,
  cornerStubJitter: 3,
  cornerCtrlJitter: 2.5,
  /** Длина прямого «хвоста» у края в прямой дороге (используется при изгибе) */
  straightStub: 20,
  straightStubJitter: 4,
  /** Максимальный боковой прогиб прямой дороги в середине тайла */
  bowJitter: 3.5,
  /** Глубина дуги города, до которой доходит тупиковая дорога (если дуга не сгенерирована) */
  cityArcDepth: 30,
} as const;

export interface RoadResult {
  readonly geometry: LineGeometry;
  /** true — рандомизированная форма не покрыла метку мипла, использован эталон */
  readonly fallback: boolean;
}

const line = (to: Point): PathSegment => ({ type: 'line', to });
const bezier = (cp1: Point, cp2: Point, to: Point): PathSegment => ({ type: 'bezier', cp1, cp2, to });

function rotatePath(
  start: Point,
  path: readonly PathSegment[],
  k: number,
  lineWidth: number,
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

function build(
  road: TileFeature,
  ctx: TileContext,
  rng: Rng,
  amp: number,
  width: number,
  arcDepth: ReadonlyMap<Side, number>,
): LineGeometry | null {
  const P = ROAD_PARAMS;
  const sides = centerSides(road);
  const j = (range: number): number => (rng() * 2 - 1) * range * amp + 0;

  if (sides.length === 2) {
    const [s0, s1] = sides;

    if (mod4(s1 - s0) === 2) {
      // ── Прямая. Каноника: с севера на юг
      const k = s0 === 0 ? 0 : 1;
      const a = P.straightStub + j(P.straightStubJitter);
      const b = P.straightStub + j(P.straightStubJitter);
      const bow = j(P.bowJitter);
      const start: Point = [0, -HALF];

      if (bow === 0) {
        return rotatePath(start, [line([0, HALF])], k, width);
      }
      // Прогиб: хвосты вдоль оси, середина смещена на bow, касательные в узлах — вдоль оси (G1)
      const k1 = (HALF - a) * 0.55;
      const k2 = (HALF - b) * 0.55;
      const path: PathSegment[] = [
        line([0, -HALF + a]),
        bezier([0, -HALF + a + k1], [bow, -k1], [bow, 0]),
        bezier([bow, k2], [0, HALF - b - k2], [0, HALF - b]),
        line([0, HALF]),
      ];
      return rotatePath(start, path, k, width);
    }

    // ── Поворот между соседними сторонами. Каноника: от S к E (стороны 2 → 1)
    const a = sides.find(s => sides.includes(mod4(s + 1))) ?? s0; // меньшая в паре (a, a+1)
    const k = mod4(a - 1);
    const s1_ = P.cornerStub + j(P.cornerStubJitter);
    const s2_ = P.cornerStub + j(P.cornerStubJitter);
    const c1 = P.cornerCtrl + j(P.cornerCtrlJitter);
    const c2 = P.cornerCtrl + j(P.cornerCtrlJitter);
    const path: PathSegment[] = [
      line([0, HALF - s1_]),
      bezier([0, HALF - s1_ - c1], [s2_ - c2, 0], [s2_, 0]),
      line([HALF, 0]),
    ];
    return rotatePath([0, HALF], path, k, width);
  }

  if (sides.length === 1) {
    // ── Тупик. Каноника: от стороны N вглубь тайла
    const side = sides[0];
    let reach = HALF; // по умолчанию — до центра (перекрёсток)
    if (ctx.monasteryHalf !== null) {
      reach = HALF - ctx.monasteryHalf; // до края монастыря
    } else if (ctx.cityArcSides.has(side)) {
      reach = arcDepth.get(side) ?? P.cityArcDepth; // до вершины дуги города
    }
    return rotatePath([0, -HALF], [line([0, -HALF + reach])], side, width);
  }

  return null;
}

/** Расстояние от точки до ломаной */
function distanceToPolyline(p: Point, pts: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return best;
}

/** Место для мипла должно остаться на дороге */
function spotOnRoad(geometry: LineGeometry, road: TileFeature): boolean {
  const { center } = tessellateLine(geometry);
  return distanceToPolyline([road.meepleSpot.x, road.meepleSpot.y], center) <= geometry.lineWidth / 2;
}

/**
 * Генерирует осевую линию дороги по её портам.
 * @param arcDepth глубины дуг сгенерированных городов (дорога-тупик доходит до вершины дуги)
 * @param amp амплитуда рандомизации 0..1 (0 — эталонная форма)
 * @returns null, если набор портов не поддерживается
 */
export function generateRoad(
  road: TileFeature,
  ctx: TileContext,
  makeRng: RngFactory,
  amp: number,
  width: number,
  arcDepth: ReadonlyMap<Side, number>,
): RoadResult | null {
  const geometry = build(road, ctx, makeRng(), amp, width, arcDepth);
  if (!geometry) return null;

  if (amp > 0 && !spotOnRoad(geometry, road)) {
    const baseline = build(road, ctx, makeRng(), 0, width, arcDepth);
    if (baseline) return { geometry: baseline, fallback: true };
  }
  return { geometry, fallback: false };
}