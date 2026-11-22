// packages/client/src/sandbox/types.ts
// Общие типы песочницы геометрии.
import type { TileFeature } from '@fiefdom/shared/core/types';

/**
 * Минимальная структурная типизация тайла, чтобы не зависеть
 * от конкретного экспорта Tile в разных версиях проекта.
 */
export interface SandboxTile {
  id: string;
  artId?: string;
  quantity: number;
  features: readonly TileFeature[];
}

/** Вкладки правой части: тайл, галерея, 2D доска (режим `seams`), 3D доска */
export type SandboxViewMode = 'tile' | 'gallery' | 'seams' | 'board3d';

/** Слои визуализации одного тайла (вкладка «Тайл») */
export interface TileLayers {
  grid: boolean;
  axes: boolean;
  /** Ручные споты из данных */
  spots: boolean;
  /** Споты, вычисленные из геометрии */
  autoSpots: boolean;
  ports: boolean;
  geometry: boolean;
  /** Вершины тесселяции */
  vertices: boolean;
}

export const DEFAULT_TILE_LAYERS: TileLayers = {
  grid: true,
  axes: true,
  spots: true,
  autoSpots: true,
  ports: true,
  geometry: true,
  vertices: false,
};
