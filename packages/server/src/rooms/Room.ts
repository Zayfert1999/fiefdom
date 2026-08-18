// packages/server/src/rooms/Room.ts
// 🌟 Комната: фасад для лобби и игры.
// Делегирует работу специализированным модулям.

import type { Socket } from 'socket.io';
import type { RoomSettings, RoomInfo, LobbyPlayer } from '@carcassonne/shared/protocol/events';
import type { SerializedGameState } from '@carcassonne/shared/core/serialization';
import type { PlayerConnection } from '../state/PlayerConnection';
import { ServerGameState } from '../state/ServerGameState';
import { RoomPlayerManager } from './RoomPlayerManager';
import { RoomBroadcaster } from './RoomBroadcaster';
import { RoomGameLoop } from './RoomGameLoop';
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

  constructor(id: string, settings: RoomSettings, host: PlayerConnection) {
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

    // Добавляем хоста в комнату
    this.playerManager.addPlayer(host);
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

  /** Восстановить игрока в комнате */
  reconnectPlayer(oldPlayerId: string, newSocket: Socket): {
    success: boolean;
    reason?: string;
    data?: {
      roomId: string;
      playerId: string;
      players: LobbyPlayer[];
      settings: RoomSettings;
      isHost: boolean;
      gameState?: SerializedGameState;
      gameStartTime: number | null;
    };
  } {
    return this.playerManager.reconnectPlayer(oldPlayerId, newSocket, this.hostId);
  }

  // ============================================
  // 🎮 ДЕЛЕГИРОВАНИЕ: ИГРОВОЙ ЦИКЛ
  // ============================================

  /** Начать игру */
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
      isPrivate: this.settings.isPrivate,
      isPlaying: this.gameState.isGameStarted,
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

  get canStart(): boolean {
    return this.players.size >= 2 && !this.gameState.isGameStarted;
  }

  get isGameStarted(): boolean {
    return this.gameState.isGameStarted;
  }
}