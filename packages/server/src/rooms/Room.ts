// packages/server/src/rooms/Room.ts
// 🌟 Комната: лобби + игра. Управляет игроками, состоянием, таймером.

import type { Socket } from 'socket.io';
import type { Player } from '@carcassonne/shared/core/types';
import type { RoomSettings, RoomInfo, LobbyPlayer } from '@carcassonne/shared/protocol/events';
import type { SerializedGameState } from '@carcassonne/shared/core/serialization';  // 🌟 НОВОЕ
import { AVAILABLE_COLORS } from '@carcassonne/shared/core/constants';
import { generateGameSeed } from '@carcassonne/shared/prng/seedRandom';
import { PlayerConnection } from '../state/PlayerConnection';
import { ServerGameState } from '../state/ServerGameState';
import { TurnTimer } from '../services/TurnTimer';
import { logger } from '../utils/logger';

// 🌟 Время, в течение которого все видят мипла перед проверкой регионов
const MEEPLE_VISIBLE_DELAY = 1000; // 1 секунда

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

  /**.
 * Вызывается при socket disconnect (перезагрузка страницы, потеря связи).
 * Игрок может reconnect в течение DISCONNECT_TIMEOUT.
 */
  markPlayerDisconnected(playerId: string): void {
    const conn = this.players.get(playerId);
    if (!conn) return;

    conn.markDisconnected();
    logger.info('[Room]', `⚠️ Игрок ${conn.name} отключился (комната ${this.id}) — ожидание reconnect`);

    // Уведомляем остальных игроков
    this.broadcast('lobby:player-disconnected', { playerId });
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
    logger.info('[Room]', `🔄 beginTurn: игрок ${gs.currentPlayer.name}`);

    const canContinue = gs.drawTile();
    if (!canContinue) {
      this.endGame();
      return;
    }

    this.broadcastState();

    const currentConn = this.players.get(gs.currentPlayer.id);
    if (currentConn && gs.drawnTile) {
      currentConn.emit('game:your-turn', { drawnTile: gs.drawnTile });
    }

    this.turnTimer.start(
      this.settings.turnTimerSeconds,
      (remaining) => this.broadcast('game:timer-update', { remainingSeconds: remaining }),
      () => this.handleTimeout()
    );
  }


  /** ⏰ Таймаут: авто-пропуск хода */
  private handleTimeout(): void {
    logger.warn('[Room]', `Игрок ${this.gameState.currentPlayer.name} не успел → пропуск хода`);

    // Возвращаем тайл в колоду и передаём ход
    this.gameState.skipTurn();

    // Проверяем конец игры
    if (this.gameState.deck.length === 0) {
      this.endGame();
      return;
    }

    // Передаём ход следующему игроку
    this.broadcastState();
    this.beginTurn();
  }

  // 🌟 НОВОЕ: обработка commit-move
  handleCommitMove(
    playerId: string,
    tileData: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
    meepleData: { featureId: string; x: number; y: number } | null
  ): { success: boolean; error?: string } {
    const gs = this.gameState;

    // ============================================
    // ФАЗА 1: Применяем тайл + мипл (БЕЗ регионов)
    // ============================================
    const result = gs.commitMove(playerId, tileData, meepleData);

    if (result.error) {
      logger.warn('[Room]', `❌ commitMove отклонён: ${result.error}`);
      return { success: false, error: result.error };
    }

    logger.info('[Room]', `✅ commitMove принят (фаза 1: тайл + мипл)`);
    this.turnTimer.stop();

    // Рассылаем move-committed
    this.broadcast('game:move-committed', {
      playerId,
      tile: {
        x: tileData.x,
        y: tileData.y,
        rotation: tileData.rotation,
        tileId: gs.board.get(`${tileData.x},${tileData.y}`)?.templateId ?? '',
      },
      meeple: meepleData,
    });

    // 🌟 Рассылаем state С миплом (все видят мипла!)
    this.broadcastState();

    // ============================================
    // ФАЗА 2: Пауза, чтобы все увидели мипла
    // ============================================
    logger.info('[Room]', `⏱️ Фаза 2: пауза ${MEEPLE_VISIBLE_DELAY}мс (все видят мипла)`);

    setTimeout(() => {
      // ============================================
      // ФАЗА 3: Проверяем завершённые регионы
      // ============================================
      const completedRegions = gs.findCompletedRegions();
      logger.info('[Room]', `🔍 Фаза 3: найдено завершённых регионов: ${completedRegions.length}`);

      if (completedRegions.length > 0) {
        // Рассылаем данные для анимации ДО применения
        this.broadcast('game:regions-completed', {
          regions: completedRegions.map(r => ({
            rootKey: r.rootKey,
            type: r.type,
            points: r.points,
            winners: r.winners,
            allMeepleOwners: r.allMeepleOwners,
            featureKeys: r.featureKeys,
          })),
        });

        // Применяем регионы (удаляет миплы, начисляет очки)
        gs.applyCompletedRegions(completedRegions);
        logger.info('[Room]', `✅ Фаза 3: регионы применены (миплы удалены, очки начислены)`);

        // Рассылаем state БЕЗ миплов (финальное состояние)
        this.broadcastState();

        // ============================================
        // ФАЗА 4: Ждём завершения анимаций
        // ============================================
        const animationDelay = completedRegions.length * 3000;
        logger.info('[Room]', `⏱️ Фаза 4: ждём ${animationDelay}мс (анимация регионов)`);

        setTimeout(() => {
          this.proceedToNextTurn();
        }, animationDelay);

      } else {
        // Нет регионов — сразу передаём ход
        logger.info('[Room]', `✅ Фаза 3: регионов нет → немедленная передача хода`);
        this.proceedToNextTurn();
      }
    }, MEEPLE_VISIBLE_DELAY);

    return { success: true };
  }

  // 🌟 НОВОЕ: вынесено в отдельный метод для переиспользования
  private proceedToNextTurn(): void {
    const gs = this.gameState;

    // Проверяем конец игры
    if (gs.deck.length === 0) {
      logger.info('[Room]', `🏁 Колода пуста → конец игры`);
      this.endGame();
      return;
    }

    gs.nextTurn();
    this.broadcastState();
    this.beginTurn();
  }
  // ============================================
  // 🏁 КОНЕЦ ИГРЫ
  // ============================================

  private endGame(): void {
    this.turnTimer.stop();

    // 🌟 Финальный подсчёт
    const finalRegions = this.gameState.finalizeGame();

    this.gameState.phase = 'gameOver';
    logger.info('[Room]', `🏁 Игра окончена в комнате ${this.id}`);

    // Рассылаем данные для анимации
    if (finalRegions.length > 0) {
      this.broadcast('game:final-scoring', { regions: finalRegions });
    }

    // Ждём анимации перед финальным state
    const animationDelay = finalRegions.length * 3000;
    setTimeout(() => {
      this.broadcast('game:over', { finalScores: this.gameState.players });
      this.broadcastState();
    }, animationDelay);
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

  /**
 * 🌟 Попытка восстановления игрока в комнате.
 * Возвращает успех и данные для отправки клиенту.
 */
  reconnectPlayer(
    oldPlayerId: string,
    playerName: string,
    newSocket: Socket
  ): {
    success: boolean;
    reason?: string;
    data?: {
      roomId: string;
      playerId: string;
      players: LobbyPlayer[];
      settings: RoomSettings;
      isHost: boolean;
      gameState?: SerializedGameState;
    };
  } {
    const conn = this.players.get(oldPlayerId);

    if (!conn) {
      logger.warn('[Room]', `❌ Reconnect: игрок ${oldPlayerId} не найден в комнате ${this.id}`);
      return { success: false, reason: 'Игрок не найден в комнате' };
    }

    if (conn.player.name !== playerName) {
      logger.warn('[Room]', `❌ Reconnect: имя не совпадает`);
      return { success: false, reason: 'Имя игрока не совпадает' };
    }

    // 🌟 Обновляем socket
    newSocket.join(this.id);
    conn.markReconnected(newSocket);
    newSocket.data.playerId = oldPlayerId;
    newSocket.data.roomId = this.id;

    logger.info('[Room]', `✅ Игрок ${playerName} восстановлен в комнате ${this.id}`);

    // Собираем данные для отправки
    const players = Array.from(this.players.values())
      .map(c => c.toLobbyPlayer(c.id === this.hostId));

    const data: any = {
      roomId: this.id,
      playerId: oldPlayerId,
      players,
      settings: this.settings,
      isHost: this.hostId === oldPlayerId,
    };

    // 🌟 Если игра уже началась — отправляем состояние
    if (this.gameStarted) {
      data.gameState = this.gameState.serializeForPlayer(oldPlayerId);

      // 🌟 Если сейчас ход этого игрока и у него есть drawnTile — отправляем отдельно
      if (this.gameState.currentPlayer.id === oldPlayerId && this.gameState.drawnTile) {
        // Через setTimeout, чтобы client успел применить state-update
        setTimeout(() => {
          conn.emit('game:your-turn', { drawnTile: this.gameState.drawnTile! });
        }, 100);
      }
    }

    // 🌟 Уведомляем остальных игроков
    this.broadcast('lobby:player-reconnected', { playerId: oldPlayerId });

    return { success: true, data };
  }
}