// packages/shared/src/core/tileData.ts
import type { Tile } from './types';
import tileSetData from '../data/base.json';

// ============================================
// 📦 ОСНОВНЫЕ ЭКСПОРТЫ
// ============================================
export const TILE_DEFINITIONS: Tile[] = tileSetData.tiles as unknown as Tile[];
