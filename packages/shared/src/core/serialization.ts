// src/core/serialization.ts
import type { Player, PlacedTile, Tile, FeatureType } from './types';

// 🌟 Сериализованный RegionManager
export interface SerializedRegionManager {
  parent: Record<string, string>;
  metadata: Record<string, SerializedRegionMetadata>;
}

export interface SerializedRegionMetadata {
  type: FeatureType;
  owners: string[];              // Set → Array
  segments: number;
  hasShield: boolean;
  featureKeys: string[];         // Set → Array
  meepleCounts: Record<string, number>;  // Map → Record
  isComplete: boolean;
  points: number;
}

// 🌟 Сериализованное состояние игры
export interface SerializedGameState {
  board: Record<string, PlacedTile>;
  regionManager: SerializedRegionManager;
  players: Player[];
  deck: Tile[];
  currentTurn: number;
  phase: string;
  drawnTile: Tile | null;
  totalTiles: number;
  lastPlacedTiles: Record<string, { x: number; y: number; color: string }>;
}