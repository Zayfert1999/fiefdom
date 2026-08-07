// packages/server/src/rooms/RoomManager.ts
// 🌟 Реестр всех активных комнат. Создание, поиск, удаление.

import type { Room } from './Room';
import { logger } from '../utils/logger';

export class RoomManager {
  private rooms = new Map<string, Room>();

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
}