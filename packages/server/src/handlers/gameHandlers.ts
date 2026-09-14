// packages/server/src/handlers/gameHandlers.ts
// 🌟 Обработчики игровых событий (place-tile, place-meeple, skip)

import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager';
import { PlaceTileSchema, PlaceMeepleSchema } from '@fiefdom/shared/protocol/schemas';
import { logger } from '../utils/logger';

export function registerGameHandlers(io: Server, socket: Socket, roomManager: RoomManager): void {

  /** Хелпер: получить комнату и игрока по socket */
  const getContext = () => {
    const { roomId, playerId } = socket.data;
    const room = roomManager.getRoom(roomId);
    if (!room || !playerId) return null;
    return { room, playerId };
  };

  // ============================================
  // 🎴 УСТАНОВКА ТАЙЛА
  // ============================================
  // 🌟 ИСПРАВЛЕНО: заменяем place-tile и place-meeple на commit-move
  socket.on('game:commit-move', (data) => {
    logger.info('[GameHandler]', `📥 Получено game:commit-move от ${socket.data.playerId}`, data);

    const ctx = getContext();
    if (!ctx) {
      logger.warn('[GameHandler]', '❌ Контекст не найден');
      return;
    }
    const { room, playerId } = ctx;

    // 🌟 ИСПРАВЛЕНО: валидация тайла через Zod
    const tileParsed = PlaceTileSchema.safeParse(data.tile);
    if (!tileParsed.success) {
      logger.warn('[GameHandler]', 'Невалидные данные тайла', tileParsed.error.format());
      socket.emit('error', { code: 'INVALID_DATA', message: 'Неверные данные тайла' });
      return;
    }

    // 🌟 ИСПРАВЛЕНО: валидация мипла (опциональный)
    let meeple: { featureId: string; x: number; y: number } | null = null;
    if (data.meeple !== null && data.meeple !== undefined) {
      const meepleParsed = PlaceMeepleSchema.safeParse(data.meeple);
      if (!meepleParsed.success) {
        logger.warn('[GameHandler]', 'Невалидные данные мипла', meepleParsed.error.format());
        socket.emit('error', { code: 'INVALID_DATA', message: 'Неверные данные мипла' });
        return;
      }
      meeple = meepleParsed.data;
    }

    const result = room.handleCommitMove(playerId, tileParsed.data, meeple);

    if (!result.success) {
      socket.emit('error', { code: result.error!, message: `Ошибка хода: ${result.error}` });
    }
  });
}