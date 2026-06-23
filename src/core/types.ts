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
  hasShield?: boolean;
  directions: Direction[];
  spots: MeepleSpot[];
  adjacentCities?: string[];
}

export interface Tile {
  id: string;
  quantity: number;
  features: TileFeature[];
}

// Игровые сущности
export interface Player {
  id: string;
  name: string;
  color: string;
  meepleCount: number;
  pointsByCategory: {
    road: number,
    city: number,
    field: number,
    monastery: number,
  };
  score: number;
}

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
  rotation: 0 | 90 | 180 | 270;           // 🌟 Явный тип
  validRotations: (0 | 90 | 180 | 270)[]; // 🌟 Явный тип массива
  currentRotationIndex: number;
}