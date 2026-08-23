import type { Tile, PlacedTile, PreviewTile } from '@carcassonne/shared/core/types';
import type { RegionManager } from '@carcassonne/shared/core/regionManager';
import type { CompletedRegion } from '@carcassonne/shared/core/scoring';

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