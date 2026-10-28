// packages/server/src/handlers/gameHandlers.ts
// 🌟 Обработчики игровых событий (commit-move, request-sync)

import type { GameServer, GameSocket } from '../types';
import type { RoomManager } from '../rooms/RoomManager';
import type { MoveAck } from '@fiefdom/shared/protocol/events';
import { getErrorMessage } from '@fiefdom/shared/protocol/errors';
import { PlaceTileSchema, PlaceMeepleSchema } from '@fiefdom/shared/protocol/schemas';
import { logger } from '../utils/logger';
import { emitError, onSafe } from '../utils/socketUtils';

export function registerGameHandlers(io: GameServer, socket: GameSocket, roomManager: RoomManager): void {

  /** Хелпер: получить комнату и игрока по socket */
  const getContext = () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return null;
    const room = roomManager.getRoom(roomId);
    if (!room) return null;
    return { room, playerId };
  };

  // ============================================
  // 🎴 ХОД: тайл + мипл одним сообщением
  //
  // Ответ — через ack-колбэк socket.io (MoveAck): клиент знает результат хода
  // детерминированно, а не по косвенным признакам. Если клиент ack не передал
  // (старая версия) — ошибка уходит событием 'error', как раньше.
  // ============================================
  onSafe(socket, 'game:commit-move', (data, ackArg) => {
    const ack = typeof ackArg === 'function' ? (ackArg as (result: MoveAck) => void) : null;

    const ctx = getContext();

    /** Отклонить ход: сообщить причину и вернуть клиенту актуальное состояние */
    const reject = (code: string, message?: string): void => {
      const text = message ?? getErrorMessage(code);
      if (ack) ack({ ok: false, code, message: text });
      else emitError(socket, code, text);
      // Клиент к этому моменту уже перевёл себя в фазу endTurn и ждёт ответа:
      // без ресинка он остался бы в ней навсегда
      ctx?.room.resyncPlayer(ctx.playerId);
    };

    if (!ctx) {
      logger.warn('[GameHandler]', '❌ commit-move: игрок не в комнате');
      reject('NOT_IN_ROOM');
      return;
    }
    const { room, playerId } = ctx;

    if (!room.isGameStarted) {
      reject('GAME_NOT_STARTED');
      return;
    }

    // 🌟 data приходит от клиента и может быть чем угодно (null, строка, ...):
    // доступ к полям — только после проверки на объект
    const payload = (typeof data === 'object' && data !== null)
      ? (data as { tile?: unknown; meeple?: unknown })
      : {};

    logger.debug('[GameHandler]', `📥 game:commit-move от ${playerId}`, payload);

    // Валидация тайла
    const tileParsed = PlaceTileSchema.safeParse(payload.tile);
    if (!tileParsed.success) {
      logger.warn('[GameHandler]', 'Невалидные данные тайла', tileParsed.error.format());
      reject('INVALID_DATA', 'Неверные данные тайла');
      return;
    }

    // Валидация мипла (опциональный)
    let meeple: { featureId: string; x: number; y: number } | null = null;
    if (payload.meeple !== null && payload.meeple !== undefined) {
      const meepleParsed = PlaceMeepleSchema.safeParse(payload.meeple);
      if (!meepleParsed.success) {
        logger.warn('[GameHandler]', 'Невалидные данные мипла', meepleParsed.error.format());
        reject('INVALID_DATA', 'Неверные данные мипла');
        return;
      }
      meeple = meepleParsed.data;
    }

    room.handleActivity(playerId);
    const result = room.handleCommitMove(playerId, tileParsed.data, meeple);

    if (!result.success) {
      reject(result.error ?? 'INVALID_ACTION');
      return;
    }

    // Новое состояние всем игрокам уходит отдельным game:state-update
    ack?.({ ok: true });
  });

  // ============================================
  // 🔄 ЗАПРОС СИНХРОНИЗАЦИИ
  // Клиент вызывает, если не дождался ack хода или подозревает рассинхрон.
  // ============================================
  // ============================================
  // 👋 «Я НА МЕСТЕ»
  // Клиент шлёт при действиях игрока в свой ход (мышь/клавиши/касания, не чаще раза
  // в пару секунд). Нет активности — ход пропускается как AFK, не дожидаясь конца часов.
  // ============================================
  onSafe(socket, 'game:activity', () => {
    const ctx = getContext();
    if (!ctx) return; // молча: это фоновый сигнал, ошибка тут только шум
    ctx.room.handleActivity(ctx.playerId);
  });

  onSafe(socket, 'game:request-sync', () => {
    const ctx = getContext();
    if (!ctx) {
      emitError(socket, 'NOT_IN_ROOM');
      return;
    }
    ctx.room.resyncPlayer(ctx.playerId);
  });
}
