// packages/server/src/rooms/Room.ts
// 🌟 Комната: фасад для лобби и игры.
// Делегирует работу специализированным модулям.

import type { Socket } from 'socket.io';
import type { RoomSettings, RoomInfo, LobbyPlayer } from '@fiefdom/shared/protocol/events';
import type { SerializedGameState } from '@fiefdom/shared/core/serialization';
import type { PlayerConnection } from '../state/PlayerConnection';
import { ServerGameState } from '../state/ServerGameState';
import { RoomPlayerManager } from './RoomPlayerManager';
import { RoomBroadcaster } from './RoomBroadcaster';
import { RoomGameLoop } from './RoomGameLoop';
import type { RoomSnapshot, SnapshotPlayer } from '@fiefdom/shared/protocol/events';
import type { ErrorCode } from '@fiefdom/shared/protocol/errors';
import { logger } from '../utils/logger';

/**
 * 🌟 Комната — фасад для управления лобби и игрой.
 * Делегирует работу специализированным модулям:
 * - RoomPlayerManager — управление игроками
 * - RoomBroadcaster — рассылка событий
 * - RoomGameLoop — игровой цикл
 */
export class Room {
  public readonly id: string;
  public readonly settings: RoomSettings;
  public players = new Map<string, PlayerConnection>();
  public hostId: string;
  public gameState = new ServerGameState();

  // 🌟 Специализированные модули
  private broadcaster: RoomBroadcaster;
  private playerManager: RoomPlayerManager;
  private gameLoop: RoomGameLoop;

  constructor(id: string, settings: RoomSettings, host: PlayerConnection, preferredColor?: string) {
    this.id = id;
    this.settings = settings;
    this.hostId = host.id;

    // Инициализируем модули
    this.broadcaster = new RoomBroadcaster(this.players, this.gameState);
    this.playerManager = new RoomPlayerManager(
      this.id,
      this.players,
      this.settings,
      this.gameState,
      this.broadcaster
    );
    this.gameLoop = new RoomGameLoop(
      this.players,
      this.gameState,
      this.broadcaster,
      this.settings
    );

    // Добавляем хоста в комнату (цвет назначается с учётом предпочтения)
    this.playerManager.addPlayer(host, preferredColor);
  }

  // ============================================
  // 📡 ДЕЛЕГИРОВАНИЕ: РАССЫЛКА
  // ============================================

  /** Отправить событие ВСЕМ подключённым игрокам */
  broadcast(event: string, data: unknown): void {
    this.broadcaster.broadcast(event, data);
  }

  /** Разослать состояние игры */
  broadcastState(): void {
    this.broadcaster.broadcastState();
  }

  // ============================================
  // 👥 ДЕЛЕГИРОВАНИЕ: ИГРОКИ
  // ============================================

  /** Добавить игрока в комнату */
  addPlayer(conn: PlayerConnection, preferredColor?: string): void {
    this.playerManager.addPlayer(conn, preferredColor);
  }

  /** Удалить игрока из комнаты */
  removePlayer(playerId: string): void {
    this.hostId = this.playerManager.removePlayer(playerId, this.hostId);
  }

  /** Пометить игрока как отключённого */
  markPlayerDisconnected(playerId: string): void {
    this.playerManager.markPlayerDisconnected(playerId);
  }

  /**
   * 🌟 Повторно отправить игроку актуальное состояние (state-update + your-turn).
   * Используется, когда сервер отклонил ход: клиент к этому моменту уже перевёл
   * себя в фазу endTurn, и без ресинка он остался бы в ней навсегда.
   */
  resyncPlayer(playerId: string): void {
    const conn = this.players.get(playerId);
    if (!conn || conn.isDisconnected || !this.gameState.isGameStarted) return;

    conn.emit('game:state-update', {
      gameState: this.gameState.serializeForPlayer(playerId),
    });

    if (this.gameState.currentPlayer?.id === playerId && this.gameState.drawnTile) {
      conn.emit('game:your-turn', { drawnTile: this.gameState.drawnTile });
    }
  }

  /** Восстановить игрока в комнате */
  reconnectPlayer(oldPlayerId: string, newSocket: Socket, sessionToken: string): {
    success: boolean;
    reason?: string;
    snapshot?: RoomSnapshot;
  } {
    return this.playerManager.reconnectPlayer(
      oldPlayerId,
      newSocket,
      sessionToken,
      this.hostId,
      (viewerId) => this.getSnapshot(viewerId)
    );
  }

  // ============================================
  // 🎮 ДЕЛЕГИРОВАНИЕ: ИГРОВОЙ ЦИКЛ
  // ============================================

  /** Инициализация игры БЕЗ начала хода */
  initializeGame(): void {
    this.gameLoop.initializeGame();
  }

  /** Начало первого хода */
  startFirstTurn(): void {
    this.gameLoop.startFirstTurn();
  }

  /** Начать игру (полный цикл) */
  startGame(): void {
    this.gameLoop.startGame();
  }

  /** Обработка хода игрока */
  handleCommitMove(
    playerId: string,
    tileData: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
    meepleData: { featureId: string; x: number; y: number } | null
  ): { success: boolean; error?: string } {
    return this.gameLoop.handleCommitMove(playerId, tileData, meepleData);
  }

  // ============================================
  // 📋 ИНФОРМАЦИЯ О КОМНАТЕ
  // ============================================

  /** Информация для списка комнат */
  toRoomInfo(): RoomInfo {
    const host = this.players.get(this.hostId);
    return {
      id: this.id,
      hostName: host?.name ?? 'Unknown',
      playerCount: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      turnTimerSeconds: this.settings.turnTimerSeconds,
      isPrivate: this.settings.isPrivate,
      isPlaying: this.gameState.isGameStarted,
    };
  }

  // ============================================
  // 📦 SNAPSHOT — единый снимок состояния
  // ============================================

  /**
   * 🌟 Создаёт полный снимок состояния комнаты для конкретного игрока.
   * Используется для reconnect и первоначальной синхронизации.
   *
   * @param viewerId ID игрока, для которого создаётся snapshot
   *                 (нужно для приватности drawnTile)
   */
  getSnapshot(viewerId: string): RoomSnapshot {
    // Собираем игроков с сетевым статусом
    const players: SnapshotPlayer[] = Array.from(this.players.values()).map(conn => ({
      // Профиль
      id: conn.player.id,
      name: conn.player.name,
      color: conn.player.color,
      // Игровое состояние (если игра началась)
      ...(this.gameState.isGameStarted ? {
        score: conn.player.score,
        meepleCount: conn.player.meepleCount,
        pointsByCategory: conn.player.pointsByCategory,
      } : {}),
      // Сетевой статус
      network: {
        isReady: conn.isReady,
        isHost: conn.id === this.hostId,
        isDisconnected: conn.isDisconnected,
      },
    }));

    // Игровое состояние (если игра началась)
    const gameState = this.gameState.isGameStarted
      ? this.gameState.serializeForPlayer(viewerId)
      : undefined;

    // Приватный drawnTile (только если сейчас ход этого игрока)
    const drawnTile = this.gameState.isGameStarted && this.gameState.currentPlayer?.id === viewerId
      ? this.gameState.drawnTile
      : null;

    return {
      roomId: this.id,
      hostId: this.hostId,
      settings: this.settings,
      gameStartTime: this.gameState.gameStartTime ?? null,
      players,
      gameState,
      yourPlayerId: viewerId,
      // 🔐 Токен виден только владельцу снапшота
      yourSessionToken: this.players.get(viewerId)?.sessionToken ?? '',
      drawnTile,
    };
  }

  // ============================================
  // 🧹 ЖИЗНЕННЫЙ ЦИКЛ
  // ============================================

  /** Освободить ресурсы */
  dispose(): void {
    this.gameLoop.dispose();
  }

  // ============================================
  // 📊 СВОЙСТВА
  // ============================================

  get isFull(): boolean {
    return this.players.size >= this.settings.maxPlayers;
  }

  /** Сколько игроков сейчас онлайн */
  get connectedCount(): number {
    let count = 0;
    for (const conn of this.players.values()) {
      if (!conn.isDisconnected) count++;
    }
    return count;
  }

  /** Есть ли в комнате хотя бы один подключённый игрок */
  get hasConnectedPlayers(): boolean {
    return this.connectedCount > 0;
  }

  /**
   * 🌟 Что мешает стартовать игру (null — можно стартовать).
   * Серверная проверка зеркалит условия кнопки «Начать игру» на клиенте:
   * кнопку можно обойти, поэтому сервер обязан проверять сам.
   */
  getStartBlocker(): ErrorCode | null {
    if (this.gameState.isGameStarted) return 'GAME_ALREADY_STARTED';

    const all = Array.from(this.players.values());
    if (all.length < 2) return 'NOT_ENOUGH_PLAYERS';
    if (all.some(p => p.isDisconnected || !p.isReady)) return 'NOT_ALL_READY';

    return null;
  }

  get canStart(): boolean {
    return this.getStartBlocker() === null;
  }

  get isGameStarted(): boolean {
    return this.gameState.isGameStarted;
  }
}
