// packages/client/src/sandbox/view/colors.ts
import type { TileFeature } from '@fiefdom/shared/core/types';

// ============================================
// 🎨 ЦВЕТОВАЯ СХЕМА
// ============================================

export const COLORS = {
  field: '#6a994e',
  road: '#c9b38c',
  city: '#a67c52',
  monastery: '#d47843',
  plaza: '#ac9978',
  shield: '#ffd700',
  meeple: '#ffffff',
} as const;

// ============================================
// 🧭 ПОРЯДОК СЛОЁВ ОТРИСОВКИ
// ============================================
// 0 — поля, рисуем нижним слоем;
// 1 — дороги;
// 2 — города и монастыри;
// 9 — неизвестное.
export const getFeatureLayer = (type: TileFeature['type']): number => {
  switch (type) {
    case 'field':
      return 0;
    case 'road':
      return 1;
    case 'city':
    case 'monastery':
      return 2;
    default:
      return 9;
  }
};

export const getFeatureFill = (feature: Pick<TileFeature, 'type'>): string => {
  switch (feature.type) {
    case 'city':
      return COLORS.city;
    case 'road':
      return COLORS.road;
    case 'field':
      return COLORS.field;
    case 'monastery':
      return COLORS.monastery;
    default:
      return '#71717a';
  }
};
