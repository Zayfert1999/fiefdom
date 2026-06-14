export type Direction = 'N' | 'E' | 'S' | 'W' | 'C' | 'NW' | 'NE' | 'SE' | 'SW';
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
  score: number;
  meepleCount: number;
}

export interface PlacedMeeple {
  playerId: string;
  featureId: string;
  color: string;
  x: number;
  y: number;
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