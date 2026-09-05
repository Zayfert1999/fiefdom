export type Direction = 
  | 'N' | 'E' | 'S' | 'W' | 'C' 
  | 'NW' | 'NE' | 'SE' | 'SW'
  | 'NE(E)' | 'NE(N)' | 'NW(N)' | 'NW(W)'
  | 'SE(S)' | 'SE(E)' | 'SW(S)' | 'SW(W)';
export type FeatureType = 'road' | 'city' | 'monastery' | 'field';

export interface MeepleSpot {
  x: number;
  y: number;
}

export interface TileFeature {
  id: string;
  type: FeatureType;
  shieldSpot?: MeepleSpot;
  directions: Direction[];
  spots: MeepleSpot[];
  adjacentCities?: string[];
}

export interface Tile {
  id: string;
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
  derivedSides: [FeatureType, FeatureType, FeatureType, FeatureType];
  meeple?: PlacedMeeple;
}

// Превью тайла
export interface PreviewTile {
  tile: Tile;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  displayRotation: number;           // 🌟 Явный тип
  validRotations: (0 | 90 | 180 | 270)[]; // 🌟 Явный тип массива
  currentRotationIndex: number;
}