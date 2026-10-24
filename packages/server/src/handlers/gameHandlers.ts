// packages/server/src/handlers/gameHandlers.ts
// 🌟 Обработчики игровых событий (commit-move)

import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager';
import { PlaceTileSchema, PlaceMeepleSchema } from '@fiefdom/shared/protocol/schemas';
import { logger } from '../utils/logger';
import { emitError, onSafe } from '../utils/socketUtils';

export function registerGameHandlers(io: Server, socket: Socket, roomManager: RoomManager): void {

  /** Хелпер: получить комнату и игрока по socket */
  const getContext = () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return null;
    const room = roomManager.getRoom(roomId);
    if (!room) return null;
    return { room, playerId: playerId as string };
  };

  // ============================================
  // 🎴 ХОД: тайл + мипл одним сообщением
  // ============================================
  onSafe(socket, 'game:commit-move', (data) => {
    const ctx = getContext();
    if (!ctx) {
      logger.warn('[GameHandler]', '❌ commit-move: игрок не в комнате');
      emitError(socket, 'NOT_IN_ROOM');
      return;
    }
    const { room, playerId } = ctx;

    if (!room.isGameStarted) {
      emitError(socket, 'GAME_NOT_STARTED');
      return;
    }

    // 🌟 data приходит от клиента и может быть чем угодно (null, строка, ...):
    // доступ к полям — только после проверки на объект
    const payload = (typeof data === 'object' && data !== null)
      ? (data as { tile?: unknown; meeple?: unknown })
      : {};

    logger.info('[GameHandler]', `📥 game:commit-move от ${playerId}`, payload);

    // Валидация тайла
    const tileParsed = PlaceTileSchema.safeParse(payload.tile);
    if (!tileParsed.success) {
      logger.warn('[GameHandler]', 'Невалидные данные тайла', tileParsed.error.format());
      emitError(socket, 'INVALID_DATA', 'Неверные данные тайла');
      room.resyncPlayer(playerId);
      return;
    }

    // Валидация мипла (опциональный)
    let meeple: { featureId: string; x: number; y: number } | null = null;
    if (payload.meeple !== null && payload.meeple !== undefined) {
      const meepleParsed = PlaceMeepleSchema.safeParse(payload.meeple);
      if (!meepleParsed.success) {
        logger.warn('[GameHandler]', 'Невалидные данные мипла', meepleParsed.error.format());
        emitError(socket, 'INVALID_DATA', 'Неверные данные мипла');
        room.resyncPlayer(playerId);
        return;
      }
      meeple = meepleParsed.data;
    }

    const result = room.handleCommitMove(playerId, tileParsed.data, meeple);

    if (!result.success) {
      emitError(socket, result.error ?? 'INVALID_ACTION');
      // 🌟 Клиент уже перевёл себя в фазу endTurn и ждёт ответа сервера.
      // Отправляем ему актуальное состояние, иначе он «зависнет» после отказа.
      room.resyncPlayer(playerId);
    }
  });
}
