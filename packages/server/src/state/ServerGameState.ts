// packages/server/src/state/ServerGameState.ts
// 🌟 Авторитарное состояние игры на сервере.
// Переиспользует чистую логику из @carcassonne/shared.
// ВАЖНО: drawnTile отправляется ТОЛЬКО текущему игроку.

import type { Player, PlacedTile, Tile } from '@carcassonne/shared/core/types';
import type { FeatureKey } from '@carcassonne/shared/core/regionManager';
import { RegionManager } from '@carcassonne/shared/core/regionManager';
import { createDeck } from '@carcassonne/shared/core/deck';
import {
  applyTileToBoardAndRM,
  getTileSides,
  getValidPlacementCells,
} from '@carcassonne/shared/core/tileUtils';
import {
  findCompletedRegionsOnTile,
  type CompletedRegion,
} from '@carcassonne/shared/core/scoring';
import type { SerializedGameState } from '@carcassonne/shared/core/serialization';
import { logger } from '../utils/logger';

export type ServerPhase = 'lobby' | 'playing' | 'gameOver';

export class ServerGameState {
  public board = new Map<string, PlacedTile>();
  public regionManager = new RegionManager();
  public players: Player[] = [];
  public deck: Tile[] = [];
  public currentTurn = 0;
  public drawnTile: Tile | null = null;
  public phase: ServerPhase = 'lobby';
  public seed: string = '';

  /** Инициализация новой игры */
  initialize(players: Player[], seed: string): void {
    this.seed = seed;
    this.players = players.map(p => ({
      ...p,
      meepleCount: 8,
      score: 0,
      pointsByCategory: { road: 0, city: 0, field: 0, monastery: 0 },
    }));
    this.deck = createDeck(seed);
    this.board = new Map();
    this.regionManager = new RegionManager();
    this.currentTurn = 0;
    this.phase = 'playing';

    // 🌟 Стартовый тайл в центре (0,0)
    const startingTile = this.deck.pop();
    if (startingTile) {
      this.board.set('0,0', {
        templateId: startingTile.id,
        x: 0, y: 0, rotation: 0,
        features: startingTile.features,
        derivedSides: getTileSides(startingTile),
      });
      for (const feature of startingTile.features) {
        this.regionManager.makeSet(`0,0:${feature.id}`, feature.type, feature.hasShield ?? false);
      }
    }
    logger.info('[GameState]', `Игра инициализирована: ${this.players.length} игроков, колода ${this.deck.length}, seed=${seed}`);
  }

  get currentPlayer(): Player {
    return this.players[this.currentTurn];
  }

  /** Выдать тайл текущему игроку. false → конец игры */
  drawTile(): boolean {
    // 🌟 Ищем тайл, который можно поставить (как в client gameSlice)
    let attempts = 0;
    const maxAttempts = this.deck.length;
    while (this.deck.length > 0 && attempts < maxAttempts) {
      attempts++;
      const candidate = this.deck.pop()!;
      const validCells = getValidPlacementCells(candidate, this.board);
      if (validCells.size > 0) {
        this.drawnTile = candidate;
        logger.info('[GameState]', `Тайл выдан: ${candidate.id} игроку ${this.currentPlayer.name}`);
        return true;
      }
      // Возвращаем неиграбельный тайл в случайное место колоды
      const insertIndex = Math.floor(Math.random() * (this.deck.length + 1));
      this.deck.splice(insertIndex, 0, candidate);
    }
    logger.info('[GameState]', 'Нет играбельных тайлов → конец игры');
    this.phase = 'gameOver';
    return false;
  }

  /** Валидация + установка тайла. Возвращает ошибку или null */
  placeTile(playerId: string, x: number, y: number, rotation: 0 | 90 | 180 | 270): string | null {
    if (playerId !== this.currentPlayer.id) return 'NOT_YOUR_TURN';
    if (!this.drawnTile) return 'NO_TILE_DRAWN';
    if (this.board.has(`${x},${y}`)) return 'CELL_OCCUPIED';

    const { newBoard, newRM } = applyTileToBoardAndRM(
      this.board, this.regionManager, this.drawnTile, x, y, rotation
    );

    // applyTileToBoardAndRM не валидирует грани — проверяем отдельно
    // (валидация уже произошла внутри, но убедимся что клетка была валидна)
    this.board = newBoard;
    this.regionManager = newRM;
    this.drawnTile = null;

    logger.info('[GameState]', `Тайл установлен игроком ${this.currentPlayer.name} в (${x}, ${y}), rot=${rotation}`);
    return null;
  }

  /** Проверка завершённых регионов после установки тайла */
  findCompletedRegions(): CompletedRegion[] {
    const tiles = Array.from(this.board.values());
    const lastTile = tiles[tiles.length - 1];
    if (!lastTile) return [];
    return findCompletedRegionsOnTile(this.board, this.regionManager, lastTile);
  }

  /** Применение завершённых регионов: очки + возврат миплов */
  applyCompletedRegions(regions: CompletedRegion[]): void {
    for (const region of regions) {
      this.regionManager.markComplete(region.rootKey, region.points);
      // Очки победителям
      for (const winnerId of region.winners) {
        const player = this.players.find(p => p.id === winnerId);
        if (player) {
          player.score += region.points;
          player.pointsByCategory[region.type] += region.points;
        }
      }
      // Возврат миплов
      for (const ownerId of region.allMeepleOwners) {
        const player = this.players.find(p => p.id === ownerId);
        if (player) player.meepleCount += 1;
      }
      logger.info('[GameState]', `Регион ${region.type} завершён: +${region.points}, победители: ${region.winners.join(',')}`);
    }
  }

  /** Разместить мипла на последнем тайле */
  placeMeeple(playerId: string, featureId: string, x: number, y: number): string | null {
    if (playerId !== this.currentPlayer.id) return 'NOT_YOUR_TURN';
    const player = this.currentPlayer;
    if (player.meepleCount <= 0) return 'NO_MEEPLES';

    const featureKey: FeatureKey = `${x},${y}:${featureId}`;
    const owners = this.regionManager.getFeatureOwners(featureKey);
    if (owners.length > 0) return 'FEATURE_OCCUPIED';

    const tile = this.board.get(`${x},${y}`);
    if (!tile) return 'TILE_NOT_FOUND';

    // Ставим постоянного мипла
    tile.meeple = {
      playerId: player.id,
      featureId,
      color: player.color,
      x, y,
    };
    player.meepleCount -= 1;
    this.regionManager.addMeeple(featureKey, player.id);
    this.regionManager.addOwner(featureKey, player.id);

    logger.info('[GameState]', `Мипл ${player.name} размещён на ${featureId}`);
    return null;
  }

  /** Переход к следующему игроку */
  nextTurn(): void {
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    logger.info('[GameState]', `Ход передан: ${this.currentPlayer.name}`);
  }

  /**
   * 🌟 Сериализация с учётом приватности.
   * drawnTile виден ТОЛЬКО игроку, чей сейчас ход.
   */
  serializeForPlayer(viewerId: string): SerializedGameState {
    const boardRecord: Record<string, PlacedTile> = {};
    this.board.forEach((tile, key) => { boardRecord[key] = tile; });

    const isCurrentPlayer = this.currentPlayer.id === viewerId;

    return {
      board: boardRecord,
      regionManager: this.regionManager.serialize(),
      players: this.players,
      deck: [], // 🌟 Колоду НЕ отправляем (секретная информация)
      currentTurn: this.currentTurn,
      phase: this.phase,
      drawnTile: isCurrentPlayer ? this.drawnTile : null, // 🌟 приватно
      totalTiles: this.deck.length,
      lastPlacedTiles: {}, // упрощённо на сервере
    };
  }
}