// packages/server/src/state/ServerGameState.ts
// 🌟 Авторитарное состояние игры на сервере.
// Переиспользует чистую логику из @fiefdom/shared.
// ВАЖНО: drawnTile отправляется ТОЛЬКО текущему игроку.

import type { Player, PlacedTile, Tile } from '@fiefdom/shared/core/types';
import type { FeatureKey } from '@fiefdom/shared/core/regionManager';
import { RegionManager } from '@fiefdom/shared/core/regionManager';
import { createDeck, drawPlayableTile } from '@fiefdom/shared/core/deck';
import {
  applyTileToBoardAndRM,
  getTilePorts,
  getValidPlacementCells,
  rotateFeatures,      // 🌟 НОВОЕ: для валидации
  isValidPlacement,    // 🌟 НОВОЕ: для валидации
} from '@fiefdom/shared/core/tileUtils';
import {
  findCompletedRegionsOnTile,
  findAllIncompleteRegionsWithMeeples,
  type CompletedRegion,
} from '@fiefdom/shared/core/scoring';
import type { SerializedGameState } from '@fiefdom/shared/core/serialization';
import { createSeededRandom } from '@fiefdom/shared/prng/seedRandom';
import { logger } from '../utils/logger';

export type ServerPhase = 'lobby' | 'playing' | 'gameOver';

export class ServerGameState {
  public board = new Map<string, PlacedTile>();
  public regionManager = new RegionManager();
  public players: Player[] = [];
  public deck: Tile[] = [];
  public totalTiles: number = 0;
  public currentTurn = 0;

  /**
   * 🚪 Игроки, выбывшие из партии (вышли сами или пропустили слишком много ходов
   * офлайн). В очереди ходов они пропускаются автоматически и без таймера,
   * но их очки и миплы на доске остаются и учитываются в финальном подсчёте.
   */
  private leftPlayerIds = new Set<string>();
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
    this.leftPlayerIds.clear();

    // 🌟 Стартовый тайл в центре (0,0)
    const startingTile = this.deck.pop();
    if (startingTile) {
      this.board.set('0,0', {
        templateId: startingTile.id,
        x: 0, y: 0, rotation: 0,
        features: startingTile.features,
        derivedPorts: getTilePorts(startingTile),
      });
      for (const feature of startingTile.features) {
        this.regionManager.makeSet(`0,0:${feature.id}`, feature.type, feature.shieldSpot !== undefined);
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

  /**
   * Применить ход: тайл + (опционально) мипл.
   *
   * 🌟 Операция АТОМАРНА: сначала всё валидируется на локальных копиях,
   * и только потом состояние игры меняется. Раньше тайл ставился на доску
   * ДО проверки мипла — отказ по миплу (NO_MEEPLES / FEATURE_OCCUPIED) оставлял
   * на доске «чужой» тайл, drawnTile обнулялся, а ход не завершался.
   */
  commitMove(
    playerId: string,
    tileData: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
    meepleData: { featureId: string; x: number; y: number } | null
  ): { error?: string } {
    logger.info('[GameState]', `🎴 commitMove: игрок=${playerId}`);

    // ============================================
    // 1. ВАЛИДАЦИЯ (состояние НЕ меняется)
    // ============================================
    if (this.phase !== 'playing') {
      return { error: 'GAME_NOT_STARTED' };
    }
    if (playerId !== this.currentPlayer.id) {
      return { error: 'NOT_YOUR_TURN' };
    }
    if (!this.drawnTile) {
      return { error: 'NO_TILE_DRAWN' };
    }
    if (this.board.has(`${tileData.x},${tileData.y}`)) {
      return { error: 'CELL_OCCUPIED' };
    }

    const rotatedFeatures = rotateFeatures(this.drawnTile.features, tileData.rotation);
    if (!isValidPlacement(this.board, tileData.x, tileData.y, rotatedFeatures)) {
      return { error: 'INVALID_PLACEMENT' };
    }

    const player = this.currentPlayer;
    if (meepleData) {
      if (player.meepleCount <= 0) {
        return { error: 'NO_MEEPLES' };
      }
      // Мипл можно поставить только на область только что положенного тайла
      if (!rotatedFeatures.some(f => f.id === meepleData.featureId)) {
        return { error: 'FEATURE_NOT_FOUND' };
      }
    }

    // ============================================
    // 2. ПРИМЕНЯЕМ НА КОПИЯХ (applyTileToBoardAndRM не мутирует исходные board/RM)
    // ============================================
    const { newBoard, newRM } = applyTileToBoardAndRM(
      this.board, this.regionManager, this.drawnTile,
      tileData.x, tileData.y, tileData.rotation
    );

    const featureKey: FeatureKey = `${tileData.x},${tileData.y}:${meepleData?.featureId ?? ''}`;
    if (meepleData) {
      // Проверка занятости — на ОБЪЕДИНЁННЫХ регионах (после добавления тайла)
      if (newRM.getFeatureOwners(featureKey).length > 0) {
        return { error: 'FEATURE_OCCUPIED' };
      }
      if (!newBoard.get(`${tileData.x},${tileData.y}`)) {
        return { error: 'TILE_NOT_FOUND' };
      }
    }

    // ============================================
    // 3. КОММИТ (дальше ошибок быть не может)
    // ============================================
    this.board = newBoard;
    this.regionManager = newRM;
    this.drawnTile = null;

    this.lastPlacedTiles[playerId] = {
      x: tileData.x,
      y: tileData.y,
      color: player.color,
    };

    logger.info('[GameState]', `✅ Тайл установлен: (${tileData.x}, ${tileData.y})`);

    if (meepleData) {
      const tile = this.board.get(`${tileData.x},${tileData.y}`)!;
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

  /**
   * Пропуск хода (таймаут или автопропуск).
   * 🗑️ Тайл из руки ВЫБРАСЫВАЕТСЯ (в колоду не возвращается): иначе при игроках,
   * которые не ходят, один и тот же тайл вечно ходил бы по кругу, а партия не заканчивалась.
   */
  skipTurn(): void {
    if (this.drawnTile) {
      logger.info('[GameState]', `Тайл ${this.drawnTile.id} выброшен из-за пропуска хода`);
      this.drawnTile = null;
    }
    this.nextTurn();
  }

  // ============================================
  // 🚪 ВЫБЫВШИЕ ИГРОКИ
  // ============================================

  /** Пометить игрока выбывшим. @returns false, если он уже был выбывшим / не найден */
  markPlayerLeft(playerId: string): boolean {
    if (this.leftPlayerIds.has(playerId)) return false;
    if (!this.players.some(p => p.id === playerId)) return false;
    this.leftPlayerIds.add(playerId);
    return true;
  }

  isPlayerLeft(playerId: string): boolean {
    return this.leftPlayerIds.has(playerId);
  }

  /** Сколько игроков ещё участвуют в партии */
  get activePlayerCount(): number {
    return this.players.length - this.leftPlayerIds.size;
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
    // Выбывшие игроки пропускаются автоматически (без таймера и без выдачи тайла)
    for (let i = 0; i < this.players.length; i++) {
      this.currentTurn = (this.currentTurn + 1) % this.players.length;
      if (!this.leftPlayerIds.has(this.currentPlayer.id)) break;
    }
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
