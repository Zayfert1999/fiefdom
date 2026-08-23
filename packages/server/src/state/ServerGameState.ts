// packages/server/src/state/ServerGameState.ts
// 🌟 Авторитарное состояние игры на сервере.
// Переиспользует чистую логику из @carcassonne/shared.
// ВАЖНО: drawnTile отправляется ТОЛЬКО текущему игроку.

import type { Player, PlacedTile, Tile } from '@carcassonne/shared/core/types';
import type { FeatureKey } from '@carcassonne/shared/core/regionManager';
import { RegionManager } from '@carcassonne/shared/core/regionManager';
import { createDeck, drawPlayableTile } from '@carcassonne/shared/core/deck';
import {
  applyTileToBoardAndRM,
  getTileSides,
  getValidPlacementCells,
  rotateFeatures,      // 🌟 НОВОЕ: для валидации
  isValidPlacement,    // 🌟 НОВОЕ: для валидации
} from '@carcassonne/shared/core/tileUtils';
import {
  findCompletedRegionsOnTile,
  findAllIncompleteRegionsWithMeeples,
  type CompletedRegion,
} from '@carcassonne/shared/core/scoring';
import type { SerializedGameState } from '@carcassonne/shared/core/serialization';
import { createSeededRandom } from '@carcassonne/shared/prng/seedRandom';
import { logger } from '../utils/logger';

export type ServerPhase = 'lobby' | 'playing' | 'gameOver';

export class ServerGameState {
  public board = new Map<string, PlacedTile>();
  public regionManager = new RegionManager();
  public players: Player[] = [];
  public deck: Tile[] = [];
  public totalTiles: number = 0;
  public currentTurn = 0;
  public drawnTile: Tile | null = null;
  public phase: ServerPhase = 'lobby';
  public seed: string = '';
  public lastPlacedTiles: Record<string, { x: number; y: number; color: string }> = {};
  // 🌟 НОВОЕ: время начала игры
  public gameStartTime: number | null = null;
  // 🌟 НОВОЕ: флаг старта игры
  public get isGameStarted(): boolean {
    return this.phase !== 'lobby';
  }


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
    this.totalTiles = this.deck.length;
    this.board = new Map();
    this.regionManager = new RegionManager();
    this.currentTurn = 0;
    this.phase = 'playing';
    this.lastPlacedTiles = {};

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
    // 🌟 ИСПОЛЬЗУЕМ ОБЩУЮ ФУНКЦИЮ ИЗ SHARED
    // Передаём seed-based PRNG для детерминизма
    const { drawnTile, newDeck } = drawPlayableTile(
      this.deck,
      this.board,
      // 🌟 Детерминированный PRNG на основе seed
      createSeededRandom(`${this.seed}-draw-${this.deck.length}`)
    );

    this.deck = newDeck;

    if (!drawnTile) {
      logger.info('[GameState]', 'Нет играбельных тайлов → конец игры');
      this.phase = 'gameOver';
      return false;
    }

    this.drawnTile = drawnTile;
    logger.info('[GameState]', `Тайл выдан: ${drawnTile.id} игроку ${this.currentPlayer.name}`);
    return true;
  }

  // 🌟 ИСПРАВЛЕНО: объединяем placeTile и placeMeeple
  commitMove(
    playerId: string,
    tileData: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
    meepleData: { featureId: string; x: number; y: number } | null
  ): { error?: string } {
    logger.info('[GameState]', `🎴 commitMove: игрок=${playerId}`);

    // Валидация: чей ход?
    if (playerId !== this.currentPlayer.id) {
      return { error: 'NOT_YOUR_TURN' };
    }
    if (!this.drawnTile) {
      return { error: 'NO_TILE_DRAWN' };
    }
    if (this.board.has(`${tileData.x},${tileData.y}`)) {
      return { error: 'CELL_OCCUPIED' };
    }

    // Валидация размещения тайла
    const rotatedFeatures = rotateFeatures(this.drawnTile.features, tileData.rotation);
    if (!isValidPlacement(this.board, tileData.x, tileData.y, rotatedFeatures)) {
      return { error: 'INVALID_PLACEMENT' };
    }

    // Применяем тайл
    const { newBoard, newRM } = applyTileToBoardAndRM(
      this.board, this.regionManager, this.drawnTile,
      tileData.x, tileData.y, tileData.rotation
    );
    this.board = newBoard;
    this.regionManager = newRM;
    this.drawnTile = null;

    this.lastPlacedTiles[playerId] = {
      x: tileData.x,
      y: tileData.y,
      color: this.currentPlayer.color,
    };

    logger.info('[GameState]', `✅ Тайл установлен: (${tileData.x}, ${tileData.y})`);

    // Применяем мипла (если есть)
    if (meepleData) {
      const player = this.currentPlayer;
      if (player.meepleCount <= 0) {
        return { error: 'NO_MEEPLES' };
      }

      const featureKey: FeatureKey = `${tileData.x},${tileData.y}:${meepleData.featureId}`;
      const owners = this.regionManager.getFeatureOwners(featureKey);
      if (owners.length > 0) {
        return { error: 'FEATURE_OCCUPIED' };
      }

      const tile = this.board.get(`${tileData.x},${tileData.y}`);
      if (!tile) {
        return { error: 'TILE_NOT_FOUND' };
      }

      tile.meeple = {
        playerId: player.id,
        featureId: meepleData.featureId,
        color: player.color,
        x: meepleData.x,
        y: meepleData.y,
      };
      player.meepleCount -= 1;
      this.regionManager.addMeeple(featureKey, player.id);
      this.regionManager.addOwner(featureKey, player.id);

      logger.info('[GameState]', `✅ Мипл размещён: ${meepleData.featureId}`);
    } else {
      logger.info('[GameState]', `⏭️ Мипл пропущен`);
    }

    return {};
  }

  /** Пропуск хода (таймаут или автопропуск). Возвращает тайл в колоду */
  skipTurn(): void {
    if (this.drawnTile) {
      this.deck.push(this.drawnTile);
      this.drawnTile = null;
      logger.info('[GameState]', `Тайл возвращён в колоду из-за пропуска хода`);
    }
    this.nextTurn();
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
        const meta = this.regionManager.getMetadata(region.rootKey);
        if (player && meta) {
          player.meepleCount += meta.meepleCounts.get(ownerId) ?? 0;
        }
      }

      // Удаляем миплы с board
      for (const featureKey of region.featureKeys) {
        const [tileCoord, featureId] = featureKey.split(':');
        const tile = this.board.get(tileCoord);
        if (tile?.meeple?.featureId === featureId) {
          tile.meeple = undefined;
          logger.info('[GameState]', `🗑️ Мипл удалён с тайла ${tileCoord} (фича ${featureId})`);
        }
      }

      logger.info('[GameState]', `Регион ${region.type} завершён: +${region.points}, победители: ${region.winners.join(',')}`);
    }
  }

  /** Финальный подсчёт очков в конце игры */
  finalizeGame(): CompletedRegion[] {
    logger.info('[GameState]', '🏁 === КОНЕЦ ИГРЫ: финальный подсчёт ===');

    // 🌟 Используем shared-функцию
    const regionsWithMeeples = findAllIncompleteRegionsWithMeeples(
      this.board,
      this.regionManager
    );

    // Применяем через тот же applyCompletedRegions
    this.applyCompletedRegions(regionsWithMeeples);

    logger.info('[GameState]', `🏁 Финальный подсчёт: ${regionsWithMeeples.length} регионов`);
    return regionsWithMeeples;
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
      totalTiles: this.totalTiles,
      lastPlacedTiles: this.lastPlacedTiles,
    };
  }
}