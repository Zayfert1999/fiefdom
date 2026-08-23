// packages/server/src/rooms/RoomManager.ts
// 🌟 Реестр всех активных комнат. Создание, поиск, удаление.

import type { Room } from './Room';
import { logger } from '../utils/logger';

export class RoomManager {
  private rooms = new Map<string, Room>();

  // 🌟 НОВОЕ: Интервал очистки (каждые 60 секунд)
  private cleanupInterval: ReturnType<typeof setInterval>;

  // Таймаут: если все игроки отключены более 5 минут — удаляем комнату
  private readonly DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupZombieRooms(), 60_000);
    logger.info('[RoomManager]', `🧹 Cleanup запущен (интервал: 60с, таймаут: ${this.DISCONNECT_TIMEOUT_MS / 1000}с)`);
  }

  /** Генерация уникального 6-значного кода комнаты */
  generateRoomId(): string {
    // Исключаем похожие символы (0/O, 1/I) для удобства ввода
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    do {
      id = '';
      for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(id)); // гарантируем уникальность
    return id;
  }

  addRoom(room: Room): void {
    this.rooms.set(room.id, room);
    logger.info('[RoomManager]', `Комната ${room.id} создана (всего: ${this.rooms.size})`);
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  removeRoom(roomId: string): void {
    this.rooms.delete(roomId);
    logger.info('[RoomManager]', `Комната ${roomId} удалена (осталось: ${this.rooms.size})`);
  }

  /** Список публичных комнат для браузера лобби */
  listPublicRooms() {
    return Array.from(this.rooms.values())
      .filter(r => !r.settings.isPrivate)
      .map(r => r.toRoomInfo());
  }

  private cleanupZombieRooms(): void {
    const now = Date.now();
    const roomsToRemove: string[] = [];

    for (const [roomId, room] of this.rooms) {
      // Комната "зомби" если все игроки отключены
      const allDisconnected = Array.from(room.players.values())
        .every(p => p.isDisconnected);

      if (!allDisconnected) continue;

      // Находим самое раннее время disconnect
      const earliestDisconnect = Math.min(
        ...Array.from(room.players.values())
          .map(p => p.disconnectedAt ?? now)
      );

      const timeSinceDisconnect = now - earliestDisconnect;

      if (timeSinceDisconnect >= this.DISCONNECT_TIMEOUT_MS) {
        roomsToRemove.push(roomId);
        logger.warn('[RoomManager]', `🧹 Удаление зомби-комнаты ${roomId} (все отключены ${Math.round(timeSinceDisconnect / 1000)}с)`);
      }
    }

    for (const roomId of roomsToRemove) {
      const room = this.rooms.get(roomId);
      room?.dispose();
      this.rooms.delete(roomId);
    }

    if (roomsToRemove.length > 0) {
      logger.info('[RoomManager]', `Удалено зомби-комнат: ${roomsToRemove.length}`);
    }
  }

  // 🌟 Вызывается при остановке сервера
  dispose(): void {
    clearInterval(this.cleanupInterval);
  }

  /**
 * Находим последнюю активную игру игрока.
 * Возвращаем имя и цвет из данных сервера.
 */
  findLastActiveGameForPlayer(playerId: string): {
    roomId: string;
    playerName: string;
    playerColor: string;
    isHost: boolean;
    gameStarted: boolean;
    playerCount: number;
  } | null {
    let lastGame: {
      roomId: string;
      playerName: string;
      playerColor: string;
      isHost: boolean;
      gameStarted: boolean;
      playerCount: number;
      disconnectedAt: number;
    } | null = null;

    for (const [roomId, room] of this.rooms) {
      const conn = room.players.get(playerId);
      if (!conn) continue;

      const disconnectedAt = conn.disconnectedAt ?? 0;

      if (!lastGame || disconnectedAt > lastGame.disconnectedAt) {
        lastGame = {
          roomId,
          playerName: conn.player.name,
          playerColor: conn.player.color,
          isHost: room.hostId === playerId,
          gameStarted: room.isGameStarted,
          playerCount: Array.from(room.players.values())
            .filter(p => !p.isDisconnected).length,
          disconnectedAt,
        };
      }
    }

    if (lastGame) {
      const { disconnectedAt, ...result } = lastGame;
      return result;
    }

    return null;
  }

}