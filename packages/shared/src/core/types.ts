// packages/shared/src/core/types.ts

/** Индекс порта на периметре тайла (0-11) */
export type Port = number;

/** Направление соседа: 0=верх, 1=право, 2=низ, 3=лево */
export type Dir = 0 | 1 | 2 | 3;

export type FeatureType = 'road' | 'city' | 'monastery' | 'field';

export interface Spot {
  x: number;
  y: number;
}

export interface TileFeature {
  id: string;
  type: FeatureType;
  shieldSpot?: Spot;
  ports: Port[];
  meepleSpot: Spot[];
  adjacentCities?: string[];
}

export interface Tile {
  id: string;
  artId: string;
  quantity: number;
  features: TileFeature[];
}

// ПРОФИЛЬ ИГРОКА (мета-данные, не меняются в игре)
export interface PlayerProfile {
  id: string;
  name: string;
  color: string;
}

// ИГРОВОЕ СОСТОЯНИЕ (меняется в течение игры)
export interface PlayerGameState {
  meepleCount: number;
  pointsByCategory: {
    road: number;
    city: number;
    field: number;
    monastery: number;
  };
  score: number;
}

// ПОЛНЫЙ ИГРОК (композиция профиля и игрового состояния)
export type Player = PlayerProfile & PlayerGameState;

export interface PlacedMeeple {
  playerId: string;
  featureId: string;
  color: string;
  x: number;
  y: number;
  isCompleting?: boolean; // Помечен для удаления (анимация)
  points?: number;        // Очки, полученные за регион
  isTemporary?: boolean; // Временный мипл (редактируется)
}

export interface PlacedTile {
  templateId: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  features: TileFeature[];
  derivedPorts: FeatureType[];
  meeple?: PlacedMeeple;
}

// Превью тайла
export interface PreviewTile {
  tile: Tile;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  displayRotation: number;
  validRotations: (0 | 90 | 180 | 270)[];
  currentRotationIndex: number;
}