// packages/server/src/rooms/RoomPlayerManager.ts
// 🌟 Управление игроками в комнате.
// Отделён от Room для чёткого разделения ответственности.

import type { Socket } from 'socket.io';
import type { Player } from '@fiefdom/shared/core/types';
import type { RoomSettings, LobbyPlayer } from '@fiefdom/shared/protocol/events';
import type { SerializedGameState } from '@fiefdom/shared/core/serialization';
import { AVAILABLE_COLORS } from '@fiefdom/shared/core/constants';
import type { PlayerConnection } from '../state/PlayerConnection';
import type { ServerGameState } from '../state/ServerGameState';
import type { RoomBroadcaster } from './RoomBroadcaster';
import type { RoomSnapshot } from '@fiefdom/shared/protocol/events';
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
  ) { }

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
   * 🌟 Восстановить игрока в комнате.
   * Возвращает RoomSnapshot вместо фрагментарных данных.
   */
  reconnectPlayer(
    oldPlayerId: string,
    newSocket: Socket,
    hostId: string,
    getSnapshot: (viewerId: string) => RoomSnapshot
  ): {
    success: boolean;
    reason?: string;
    snapshot?: RoomSnapshot;
  } {
    const conn = this.players.get(oldPlayerId);

    if (!conn) {
      logger.warn('[PlayerManager]', `❌ Reconnect: игрок ${oldPlayerId} не найден в комнате ${this.roomId}`);
      return { success: false, reason: 'Игрок не найден в комнате' };
    }

    // 🌟 Если у игрока ещё жив старый сокет (сервер не успел заметить обрыв) —
    // отвязываем его: «последнее подключение побеждает», а запоздалый disconnect
    // старого сокета не должен помечать игрока отключённым.
    const oldSocket = conn.socket;
    if (oldSocket && oldSocket.id !== newSocket.id) {
      oldSocket.leave(this.roomId);
      delete oldSocket.data.roomId;
      delete oldSocket.data.playerId;
    }

    // Восстанавливаем подключение
    newSocket.join(this.roomId);
    conn.markReconnected(newSocket);
    newSocket.data.playerId = oldPlayerId;
    newSocket.data.roomId = this.roomId;

    logger.info('[PlayerManager]', `✅ Игрок ${conn.player.name} восстановлен в комнате ${this.roomId}`);

    // Уведомляем ОСТАЛЬНЫХ игроков (самому вернувшемуся это событие не нужно)
    this.broadcaster.broadcastExcept(oldPlayerId, 'lobby:player-reconnected', { playerId: oldPlayerId });

    // 🌟 Единый snapshot. Если сейчас ход этого игрока, drawnTile уже внутри snapshot
    // (и в snapshot.gameState) — клиент сам переводит фазу в placeTile,
    // отдельный game:your-turn с setTimeout-хаком больше не нужен.
    const snapshot = getSnapshot(oldPlayerId);

    return { success: true, snapshot };
  }
}
