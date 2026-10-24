// packages/server/src/utils/socketUtils.ts
// 🌟 Общие хелперы для socket-обработчиков:
// - emitError — единый формат ошибок (код + русский текст из shared)
// - onSafe — обёртка, не дающая исключению в обработчике уронить процесс

import type { Socket } from 'socket.io';
import { getErrorMessage } from '@fiefdom/shared/protocol/errors';
import { logger } from './logger';

/**
 * Отправить клиенту событие 'error'.
 * Текст берётся из общего справочника, чтобы клиент и сервер говорили одно и то же.
 */
export function emitError(socket: Socket, code: string, message?: string): void {
  socket.emit('error', { code, message: message ?? getErrorMessage(code) });
}

/**
 * Зарегистрировать обработчик события с защитой от исключений.
 *
 * Без обёртки любая ошибка в обработчике (например, `data.tile` при `data === null`
 * от кривого клиента) всплывает как uncaughtException и роняет весь сервер.
 */
export function onSafe(
  socket: Socket,
  event: string,
  handler: (...args: unknown[]) => void
): void {
  socket.on(event, (...args: unknown[]) => {
    try {
      handler(...args);
    } catch (err) {
      logger.error('[Socket]', `Необработанная ошибка в обработчике "${event}"`, err);
      emitError(socket, 'INTERNAL_ERROR');
    }
  });
}
