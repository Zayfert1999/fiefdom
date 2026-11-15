// packages/client/src/renderer3d/boardMath.ts
// ============================================
// 📐 МАТЕМАТИКА 3D-ДОСКИ
// ============================================
// Чистые функции без three и React (тестируются в node).
//
// 🧭 СИСТЕМА КООРДИНАТ (та же, что в tileMesh.ts)
//   • клетка (x, y) игры → центр тайла в мире (x·TILE_SIZE, 0, y·TILE_SIZE);
//     юг (y растёт) = +z = низ экрана при виде сверху, как в SVG;
//   • локальная точка тайла (логические координаты [-50, 50], центр (0, 0))
//     поворачивается по часовой стрелке на rotation° — формула rotatePoint
//     из shared, поэтому споты 3D совпадают с гексами правил;
//   • мипл в сторе хранит координаты в SVG-системе тайла [0, 100]
//     (toSvg/fromSvg) — протокол не менялся.
// ============================================
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { fromSvg, toSvg } from '@fiefdom/shared/core/coordUtils';
import type { FeatureType } from '@fiefdom/shared/core/types';
import type { MeshParams, MeshSurface } from '@/core/geometry/tileMesh';

export type Rotation = 0 | 90 | 180 | 270;

export interface LocalPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

// ============================================
// 🔲 КЛЕТКИ
// ============================================

/** Центр тайла клетки (x, y) в мире */
export const cellToWorld = (x: number, y: number): WorldPoint => ({
  x: x * TILE_SIZE,
  z: y * TILE_SIZE,
});

/** Клетка, в которую попала точка мира (тайл (x, y) покрывает ±TILE_SIZE/2 вокруг центра) */
export const worldToCell = (worldX: number, worldZ: number): { x: number; y: number } => ({
  // `+ 0` превращает -0 в 0, чтобы ключ клетки был "0,0", а не "-0,0"
  x: Math.round(worldX / TILE_SIZE) + 0,
  y: Math.round(worldZ / TILE_SIZE) + 0,
});

export const cellKey = (x: number, y: number): string => `${x},${y}`;

// ============================================
// 🔄 ПОВОРОТЫ
// ============================================

/** Поворот локальной точки на rotation° по часовой стрелке (точно для кратных 90°) */
export function rotateLocal(x: number, y: number, rotation: number): LocalPoint {
  const r = ((Math.round(rotation / 90) % 4) + 4) % 4;
  switch (r) {
    case 1:
      return { x: -y, y: x };
    case 2:
      return { x: -x, y: -y };
    case 3:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}

/** Локальная точка тайла (tileX, tileY, rotation) → точка мира */
export function localToWorld(
  tileX: number,
  tileY: number,
  rotation: number,
  local: LocalPoint
): WorldPoint {
  const rotated = rotateLocal(local.x, local.y, rotation);
  return {
    x: tileX * TILE_SIZE + rotated.x,
    z: tileY * TILE_SIZE + rotated.y,
  };
}

// ============================================
// 🔁 SVG ↔ ЛОГИЧЕСКИЕ КООРДИНАТЫ ТАЙЛА
// ============================================

/** Логическая точка [-50, 50] → точка в системе стора/сервера [0, 100] */
export const toStorePoint = (p: LocalPoint): LocalPoint => ({ x: toSvg(p.x), y: toSvg(p.y) });

/** Точка из стора/сервера [0, 100] → логическая [-50, 50] */
export const fromStorePoint = (p: LocalPoint): LocalPoint => ({ x: fromSvg(p.x), y: fromSvg(p.y) });

// ============================================
// 🏔️ ВЫСОТЫ ПОВЕРХНОСТЕЙ
// ============================================

export function featureSurface(type: FeatureType): Exclude<MeshSurface, 'base'> {
  switch (type) {
    case 'city':
      return 'city';
    case 'monastery':
      return 'monastery';
    case 'road':
      return 'road';
    default:
      return 'field';
  }
}

type HeightParams = Pick<MeshParams, 'baseHeight' | 'heights'>;

/** Высота верха поверхности над землёй (юниты) */
export const surfaceTopY = (params: HeightParams, surface: Exclude<MeshSurface, 'base'>): number =>
  params.baseHeight + params.heights[surface];

/** Высота самой высокой поверхности тайла */
export const maxTopY = (params: HeightParams): number =>
  Math.max(...Object.values(params.heights)) + params.baseHeight;

// ============================================
// 🔑 КЛЮЧИ ФИЧ
// ============================================

export interface FeatureKeyParts {
  readonly x: number;
  readonly y: number;
  readonly featureId: string;
}

/** "3,-2:city1" → { x: 3, y: -2, featureId: 'city1' } */
export function parseFeatureKey(key: string): FeatureKeyParts | null {
  const sep = key.indexOf(':');
  if (sep < 0) return null;
  const [xs, ys] = key.slice(0, sep).split(',');
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, featureId: key.slice(sep + 1) };
}

// ============================================
// 🎞 ПЛАВНОСТЬ
// ============================================

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

/** Линейная интерполяция */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
