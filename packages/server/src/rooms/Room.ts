// packages/server/src/rooms/Room.ts
// 🌟 Комната: лобби + игра. Управляет игроками, состоянием, таймером.

import type { Socket } from 'socket.io';
import type { Player } from '@carcassonne/shared/core/types';
import type { RoomSettings, RoomInfo } from '@carcassonne/shared/protocol/events';
import { AVAILABLE_COLORS } from '@carcassonne/shared/core/constants';
import { generateGameSeed } from '@carcassonne/shared/prng/seedRandom';
import { PlayerConnection } from '../state/PlayerConnection';
import { ServerGameState } from '../state/ServerGameState';
import { TurnTimer } from '../services/TurnTimer';
import { logger } from '../utils/logger';

export class Room {
  public readonly id: string;
  public readonly settings: RoomSettings;
  public players = new Map<string, PlayerConnection>();
  public hostId: string;
  public gameState = new ServerGameState();
  private turnTimer = new TurnTimer();
  private gameStarted = false;

  constructor(id: string, settings: RoomSettings, host: PlayerConnection) {
    this.id = id;
    this.settings = settings;
    this.hostId = host.id;
    this.addPlayer(host);
  }

  // ============================================
  // 👥 УПРАВЛЕНИЕ ИГРОКАМИ
  // ============================================

  addPlayer(conn: PlayerConnection): void {
    // 🌟 Назначаем первый свободный цвет
    const usedColors = new Set(Array.from(this.players.values()).map(p => p.player.color));
    const freeColor = AVAILABLE_COLORS.find(c => !usedColors.has(c)) ?? '#ffffff';
    conn.player.color = freeColor;

    this.players.set(conn.id, conn);
    conn.socket?.join(this.id); // Socket.IO room
    logger.info('[Room]', `Игрок ${conn.name} присоединился к ${this.id} (цвет: ${freeColor})`);
  }

  removePlayer(playerId: string): void {
    const conn = this.players.get(playerId);
    if (!conn) return;
    conn.socket?.leave(this.id);
    this.players.delete(playerId);
    logger.info('[Room]', `Игрок ${conn.name} покинул комнату ${this.id}`);

    // Передача хоста если ушёл хост
    if (this.hostId === playerId && this.players.size > 0) {
      const newHost = Array.from(this.players.values())[0];
      this.hostId = newHost.id;
      logger.info('[Room]', `Новый хост: ${newHost.name}`);
    }
  }

  get isFull(): boolean {
    return this.players.size >= this.settings.maxPlayers;
  }

  get canStart(): boolean {
    return this.players.size >= 2 && !this.gameStarted;
  }

  // ============================================
  // 📡 РАССЫЛКА
  // ============================================

  /** Отправить событие ВСЕМ подключённым игрокам */
  broadcast(event: string, data: unknown): void {
    for (const conn of this.players.values()) {
      if (!conn.isDisconnected) conn.emit(event, data);
    }
  }

  /** 🌟 Разослать состояние с учётом приватности drawnTile */
  broadcastState(): void {
    for (const conn of this.players.values()) {
      if (conn.isDisconnected) continue;
      conn.emit('game:state-update', {
        gameState: this.gameState.serializeForPlayer(conn.id),
      });
    }
  }

  // ============================================
  // 🚀 СТАРТ ИГРЫ
  // ============================================

  startGame(): void {
    if (!this.canStart) {
      logger.warn('[Room]', 'Нельзя начать игру: недостаточно игроков');
      return;
    }
    const seed = generateGameSeed();
    const playerProfiles = Array.from(this.players.values()).map(c => c.player);
    this.gameState.initialize(playerProfiles, seed);
    this.gameStarted = true;

    logger.info('[Room]', `🎮 Игра стартовала в комнате ${this.id}, seed=${seed}`);
    this.beginTurn();
  }

  // ============================================
  // 🔄 ЦИКЛ ХОДА
  // ============================================

  /** Начало хода текущего игрока: выдача тайла + таймер */
  private beginTurn(): void {
    const gs = this.gameState;
    const canContinue = gs.drawTile();

    if (!canContinue) {
      this.endGame();
      return;
    }

    // Рассылаем состояние (drawnTile придёт только текущему игроку)
    this.broadcastState();

    // 🌟 Лично текущему игроку — его тайл
    const currentConn = this.players.get(gs.currentPlayer.id);
    if (currentConn && gs.drawnTile) {
      currentConn.emit('game:your-turn', { drawnTile: gs.drawnTile });
    }

    // 🌟 Таймер на ход
    this.turnTimer.start(
      this.settings.turnTimerSeconds,
      (remaining) => this.broadcast('game:timer-update', { remainingSeconds: remaining }),
      () => this.handleTimeout()
    );
  }

  /** ⏰ Таймаут: авто-пропуск хода */
  private handleTimeout(): void {
    logger.warn('[Room]', `Игрок ${this.gameState.currentPlayer.name} не успел → пропуск хода`);
    this.finishTurn([]);
  }

  /** Завершение хода: обработка регионов + передача хода */
  finishTurn(completedRegions: ReturnType<ServerGameState['findCompletedRegions']>): void {
    const gs = this.gameState;

    if (completedRegions.length > 0) {
      gs.applyCompletedRegions(completedRegions);
      // 🌟 Сообщаем клиентам о завершённых регионах (для анимаций)
      for (const region of completedRegions) {
        this.broadcast('game:region-completed', {
          rootKey: region.rootKey,
          type: region.type,
          points: region.points,
          winners: region.winners,
        });
      }
    }

    gs.nextTurn();

    // Проверка конца игры
    if (gs.deck.length === 0) {
      this.endGame();
      return;
    }

    this.broadcastState();
    this.beginTurn();
  }

  // ============================================
  // 🏁 КОНЕЦ ИГРЫ
  // ============================================

  private endGame(): void {
    this.turnTimer.stop();
    this.gameState.phase = 'gameOver';
    logger.info('[Room]', `🏁 Игра окончена в комнате ${this.id}`);
    this.broadcast('game:over', { finalScores: this.gameState.players });
    this.broadcastState();
  }

  // ============================================
  // 📋 ИНФО ДЛЯ СПИСКА КОМНАТ
  // ============================================

  toRoomInfo(): RoomInfo {
    const host = this.players.get(this.hostId);
    return {
      id: this.id,
      hostName: host?.name ?? 'Unknown',
      playerCount: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      isPrivate: this.settings.isPrivate,
      isPlaying: this.gameStarted,
    };
  }

  dispose(): void {
    this.turnTimer.stop();
  }
}