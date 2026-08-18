// packages/server/src/rooms/RoomPlayerManager.ts
// 🌟 Управление игроками в комнате.
// Отделён от Room для чёткого разделения ответственности.

import type { Socket } from 'socket.io';
import type { Player } from '@carcassonne/shared/core/types';
import type { RoomSettings, LobbyPlayer } from '@carcassonne/shared/protocol/events';
import type { SerializedGameState } from '@carcassonne/shared/core/serialization';
import { AVAILABLE_COLORS } from '@carcassonne/shared/core/constants';
import type { PlayerConnection } from '../state/PlayerConnection';
import type { ServerGameState } from '../state/ServerGameState';
import type { RoomBroadcaster } from './RoomBroadcaster';
import { logger } from '../utils/logger';

/**
 * 🌟 Управляет игроками в комнате:
 * - Добавление и удаление
 * - Отключение и переподключение
 * - Назначение цветов
 */
export class RoomPlayerManager {
  constructor(
    private readonly roomId: string,
    public players: Map<string, PlayerConnection>,
    private settings: RoomSettings,
    private gameState: ServerGameState,
    private broadcaster: RoomBroadcaster
  ) {}

  // ============================================
  // ➕ ДОБАВЛЕНИЕ ИГРОКА
  // ============================================

  /**
   * Добавить игрока в комнату.
   * Назначает цвет с учётом предпочтений и доступности.
   */
  addPlayer(conn: PlayerConnection, preferredColor?: string): void {
    const usedColors = new Set(
      Array.from(this.players.values()).map(p => p.player.color)
    );

    // Проверяем предпочтительный цвет
    let assignedColor: string;
    if (preferredColor && !usedColors.has(preferredColor)) {
      assignedColor = preferredColor;
      logger.info('[PlayerManager]', `Игроку ${conn.name} назначен предпочтительный цвет: ${preferredColor}`);
    } else {
      const freeColor = AVAILABLE_COLORS.find((c: string) => !usedColors.has(c));
      assignedColor = freeColor ?? '#ffffff';

      if (preferredColor) {
        logger.info('[PlayerManager]', `Цвет ${preferredColor} занят, назначен: ${assignedColor}`);
      } else {
        logger.info('[PlayerManager]', `Игроку ${conn.name} назначен цвет: ${assignedColor}`);
      }
    }

    conn.player.color = assignedColor;

    this.players.set(conn.id, conn);
    conn.socket?.join(this.roomId);
    logger.info('[PlayerManager]', `Игрок ${conn.name} присоединился к ${this.roomId} (цвет: ${assignedColor})`);
  }

  // ============================================
  // ➖ УДАЛЕНИЕ ИГРОКА
  // ============================================

  /**
   * Удалить игрока из комнаты.
   * Возвращает нового хоста, если ушёл хост.
   */
  removePlayer(playerId: string, currentHostId: string): string {
    const conn = this.players.get(playerId);
    if (!conn) return currentHostId;

    conn.socket?.leave(this.roomId);
    this.players.delete(playerId);
    logger.info('[PlayerManager]', `Игрок ${conn.name} покинул комнату ${this.roomId}`);

    // Передача хоста, если ушёл хост
    if (currentHostId === playerId && this.players.size > 0) {
      const newHost = Array.from(this.players.values())[0];
      logger.info('[PlayerManager]', `Новый хост: ${newHost.name}`);
      return newHost.id;
    }

    return currentHostId;
  }

  // ============================================
  // 🔌 ОТКЛЮЧЕНИЕ ИГРОКА
  // ============================================

  /**
   * Пометить игрока как отключённого.
   * Вызывается при socket disconnect (перезагрузка страницы, потеря связи).
   */
  markPlayerDisconnected(playerId: string): void {
    const conn = this.players.get(playerId);
    if (!conn) return;

    // Не помечаем повторно
    if (conn.isDisconnected) return;

    conn.markDisconnected();
    logger.info('[PlayerManager]', `⚠️ Игрок ${conn.name} отключился (комната ${this.roomId}) — ожидание reconnect`);

    // Уведомляем остальных игроков (broadcast уже пропускает отключённых)
    this.broadcaster.broadcast('lobby:player-disconnected', { playerId });
  }

  // ============================================
  // 🔄 ПЕРЕПОДКЛЮЧЕНИЕ ИГРОКА
  // ============================================

  /**
   * Восстановить игрока в комнате.
   * Возвращает данные для отправки клиенту.
   */
  reconnectPlayer(
    oldPlayerId: string,
    newSocket: Socket,
    hostId: string
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
      gameStartTime: number | null;
    };
  } {
    const conn = this.players.get(oldPlayerId);

    if (!conn) {
      logger.warn('[PlayerManager]', `❌ Reconnect: игрок ${oldPlayerId} не найден в комнате ${this.roomId}`);
      return { success: false, reason: 'Игрок не найден в комнате' };
    }

    // Восстанавливаем подключение
    newSocket.join(this.roomId);
    conn.markReconnected(newSocket);
    newSocket.data.playerId = oldPlayerId;
    newSocket.data.roomId = this.roomId;

    logger.info('[PlayerManager]', `✅ Игрок ${conn.player.name} восстановлен в комнате ${this.roomId}`);

    // Уведомляем остальных игроков
    this.broadcaster.broadcast('lobby:player-reconnected', { playerId: oldPlayerId });

    // Собираем данные для отправки
    const players = Array.from(this.players.values())
      .map(c => c.toLobbyPlayer(c.id === hostId));

    const data: any = {
      roomId: this.roomId,
      playerId: oldPlayerId,
      players,
      settings: this.settings,
      isHost: hostId === oldPlayerId,
      gameStartTime: this.gameState.gameStartTime ?? null,
    };

    // Если игра уже началась — отправляем состояние
    if (this.gameState.isGameStarted) {
      const gameState = this.gameState.serializeForPlayer(oldPlayerId);
      data.gameState = gameState;

      // Если сейчас ход этого игрока и у него есть drawnTile — отправляем отдельно
      if (this.gameState.currentPlayer.id === oldPlayerId && this.gameState.drawnTile) {
        setTimeout(() => {
          conn.emit('game:your-turn', { drawnTile: this.gameState.drawnTile! });
        }, 100);
      }
    }

    return { success: true, data };
  }
}