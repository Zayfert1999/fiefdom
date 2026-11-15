// packages/client/src/renderer3d/spotUtils.ts
// ============================================
// 📍 СПОТЫ МИПЛОВ
// ============================================
// Позиция мипла берётся из ПРОЦЕДУРНОЙ геометрии (bundle.spots: «полюс
// недоступности» города/поля, середина видимого участка дороги), поэтому
// фигурка всегда внутри своей фичи, даже после шума. Ручной meepleSpot из
// данных — запасной вариант, если геометрия фичи не построилась.
//
// Координаты на выходе — локальные логические [-50, 50] (центр тайла в 0,
// поворот не применён).
// ============================================
import type { TileFeature } from '@fiefdom/shared/core/types';
import type { TileBundle } from '@/core/geometry/tileMesh';
import type { LocalPoint } from './boardMath';

export function resolveMeepleSpot(
  bundle: TileBundle | null,
  featureId: string,
  fallback: LocalPoint | undefined
): LocalPoint | null {
  const computed = bundle?.spots.get(featureId)?.meeple;
  if (computed) return { x: computed[0], y: computed[1] };
  return fallback ?? null;
}

/** Фича тайла по id */
export const findFeature = (features: readonly TileFeature[], featureId: string): TileFeature | undefined =>
  features.find((feature) => feature.id === featureId);
