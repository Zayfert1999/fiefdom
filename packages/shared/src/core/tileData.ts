import type { Tile } from './types';
// 🌟 Импортируем весь объект, а не только массив
import tileSetData from '../data/base.json';

export const TILE_DEFINITIONS: Tile[] = tileSetData.tiles as unknown as Tile[];

// ============================================
// 🎨 МАППИНГ ЛОГИЧЕСКИЙ ID → ГРАФИКА
// ============================================
export const ART_ID_MAP: Record<string, string> = Object.fromEntries(
  TILE_DEFINITIONS.map(def => [def.id, def.artId])
);