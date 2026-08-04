import type { Tile, PlacedTile, PreviewTile } from '@/core/types';
import type { RegionManager } from '@/core/regionManager';
import type { CompletedRegion } from '@/core/scoring';

export type GamePhase = 'lobby' | 'startTurn' | 'placeTile' | 'placeMeeple' | 'endTurn' | 'gameOver';

export interface CompletionAnimation {
    region: CompletedRegion;
    startTime: number;
}

// Информация о последнем поставленном тайле игрока
export interface LastPlacedTile {
    x: number;
    y: number;
    color: string;  // Цвет игрока
}

// 🌟 НОВОЕ: Snapshot содержит ВСЁ состояние до confirmPreview
export interface MoveSnapshot {
    board: Map<string, PlacedTile>;
    regionManager: RegionManager;
    drawnTile: Tile;
    deck: Tile[];
    previewTile: PreviewTile;
    previewTileRegionManager: RegionManager;
}