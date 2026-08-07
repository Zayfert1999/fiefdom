// packages/server/src/handlers/gameHandlers.ts
// 🌟 Обработчики игровых событий (place-tile, place-meeple, skip)

import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager';
import { PlaceTileSchema, PlaceMeepleSchema } from '@carcassonne/shared/protocol/schemas';
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
  socket.on('game:place-tile', (data) => {
    const ctx = getContext();
    if (!ctx) return;
    const { room, playerId } = ctx;

    const parsed = PlaceTileSchema.safeParse(data);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_DATA', message: 'Неверные координаты тайла' });
      return;
    }

    const { x, y, rotation } = parsed.data;
    const gs = room.gameState;

    // 🌟 Валидация + применение (сервер — источник истины)
    const error = gs.placeTile(playerId, x, y, rotation);
    if (error) {
      socket.emit('error', { code: error, message: `Невозможно поставить тайл: ${error}` });
      logger.warn('[Game]', `Отклонено place-tile от ${playerId}: ${error}`);
      return;
    }

    // 🌟 Успех — рассылаем всем
    room.broadcast('game:tile-placed', {
      playerId, x, y, rotation,
      tileId: gs.currentPlayer.id, // для идентификации
    });

    // 🌟 Проверяем завершённые регионы
    const completed = gs.findCompletedRegions();
    room.finishTurn(completed);
  });

  // ============================================
  // 🔶 УСТАНОВКА МИПЛА
  // ============================================
  socket.on('game:place-meeple', (data) => {
    const ctx = getContext();
    if (!ctx) return;
    const { room, playerId } = ctx;

    const parsed = PlaceMeepleSchema.safeParse(data);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_DATA', message: 'Неверные данные мипла' });
      return;
    }

    const { featureId, x, y } = parsed.data;
    const gs = room.gameState;

    const error = gs.placeMeeple(playerId, featureId, x, y);
    if (error) {
      socket.emit('error', { code: error, message: `Невозможно поставить мипла: ${error}` });
      return;
    }

    room.broadcast('game:meeple-placed', { playerId, featureId, x, y });
    room.broadcastState();
    logger.info('[Game]', `Мипл размещён игроком ${playerId}`);
  });

  // ============================================
  // ⏭️ ПРОПУСК МИПЛА
  // ============================================
  socket.on('game:skip-meeple', () => {
    const ctx = getContext();
    if (!ctx) return;
    const { room, playerId } = ctx;

    if (room.gameState.currentPlayer.id !== playerId) {
      socket.emit('error', { code: 'NOT_YOUR_TURN', message: 'Сейчас не ваш ход' });
      return;
    }

    room.broadcast('game:meeple-skipped', { playerId });
    logger.info('[Game]', `Игрок ${playerId} пропустил мипла`);
  });
}