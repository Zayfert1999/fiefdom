// packages/shared/src/core/coordUtils.ts
// ============================================
// 📐 КОНВЕРТАЦИЯ КООРДИНАТ МЕЖДУ СИСТЕМАМИ
// ============================================
// Логическая система: [-50, 50], центр тайла = (0, 0)
// SVG-система:        [0, 100],  верхний левый угол = (0, 0)
//
// Конвертация нужна при рендеринге в SVG (viewBox="0 0 100 100")
// и при обратной конвертации из редакторов.
// ============================================

import { TILE_SIZE } from './constants';

/** Половина размера тайла — смещение от центра к краю */
export const TILE_HALF = TILE_SIZE / 2; // 50

/**
 * Логическая координата [-50, 50] → SVG-координата [0, 100].
 * Используется при рендеринге спотов в SVG-тайл.
 *
 * @example toSvg(0)   → 50   (центр)
 * @example toSvg(-50) → 0    (левый/верхний край)
 * @example toSvg(50)  → 100  (правый/нижний край)
 */
export const toSvg = (coord: number): number => coord + TILE_HALF;

/**
 * SVG-координата [0, 100] → логическая координата [-50, 50].
 * Используется при импорте данных из SVG-редакторов.
 */
export const fromSvg = (coord: number): number => coord - TILE_HALF;

/** Конвертация точки целиком */
export const pointToSvg = (p: Spot): Spot => ({
  x: toSvg(p.x),
  y: toSvg(p.y),
});

/** Валидация: координата в допустимом диапазоне [-50, 50] */
export const isInTileBounds = (coord: number): boolean =>
  coord >= -TILE_HALF && coord <= TILE_HALF;

import type { Spot } from './types';