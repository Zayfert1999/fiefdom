import type { Tile, PlacedTile, PreviewTile, PlacedMeeple } from '@fiefdom/shared/core/types';
import type { RegionManager } from '@fiefdom/shared/core/regionManager';
import type { CompletedRegion } from '@fiefdom/shared/core/scoring';

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

// ============================================
// 🎬 АНИМАЦИЯ УСТАНОВКИ ТАЙЛА/МИПЛА
// Запускается при получении обновления от сервера (ход другого игрока)
// ============================================
export interface PlacementAnimation {
    /** Тайл для анимации (если новый), иначе null */
    tile: PlacedTile | null;
    /** Мипл для анимации (если есть), иначе null */
    meeple: PlacedMeeple | null;
    /** Время начала анимации */
    startTime: number;
}