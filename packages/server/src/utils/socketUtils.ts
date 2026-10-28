// packages/server/src/utils/socketUtils.ts
// 🌟 Общие хелперы для socket-обработчиков:
// - emitError — единый формат ошибок (код + русский текст из shared)
// - onSafe — обёртка: защита от исключений + rate limiting

import type { GameSocket } from '../types';
import type { ClientToServerEvents } from '@fiefdom/shared/protocol/events';
import { getErrorMessage } from '@fiefdom/shared/protocol/errors';
import { logger } from './logger';

/**
 * Отправить клиенту событие 'error'.
 * Текст берётся из общего справочника, чтобы клиент и сервер говорили одно и то же.
 */
export function emitError(socket: GameSocket, code: string, message?: string): void {
  socket.emit('error', { code, message: message ?? getErrorMessage(code) });
}

// ============================================
// 🚦 RATE LIMITING (скользящее окно, на сокет и событие)
// ============================================

interface Limit {
  /** Сколько событий разрешено за окно */
  max: number;
  windowMs: number;
}

/** Лимит по умолчанию для любого события */
const DEFAULT_LIMIT: Limit = { max: 30, windowMs: 5_000 };

/**
 * Более строгие лимиты там, где событие дорогое или им можно подбирать секреты
 * (reconnect / check-active — перебор токенов сессии).
 */
const LIMITS: Record<string, Limit> = {
  'lobby:create-room': { max: 5, windowMs: 60_000 },
  'lobby:join-room': { max: 15, windowMs: 30_000 },
  'lobby:reconnect': { max: 10, windowMs: 30_000 },
  'session:check-active': { max: 10, windowMs: 30_000 },
  'lobby:subscribe-rooms': { max: 10, windowMs: 10_000 },
  'lobby:list-rooms': { max: 10, windowMs: 10_000 },
  'game:commit-move': { max: 10, windowMs: 5_000 },
  'game:request-sync': { max: 6, windowMs: 10_000 },
  'game:activity': { max: 10, windowMs: 5_000 },
  'net:ping': { max: 20, windowMs: 10_000 },
};

/** Не чаще одного уведомления «слишком много запросов» в этот интервал */
const NOTIFY_INTERVAL_MS = 2_000;

interface Bucket {
  /** Времена недавних событий (мс) */
  hits: number[];
  lastNotifiedAt: number;
}

// WeakMap: записи исчезают вместе с сокетом, чистить вручную не нужно
const buckets = new WeakMap<GameSocket, Map<string, Bucket>>();

/** true — событие разрешено; false — лимит превышен */
function consume(socket: GameSocket, event: string, now = Date.now()): { allowed: boolean; notify: boolean } {
  let perSocket = buckets.get(socket);
  if (!perSocket) {
    perSocket = new Map();
    buckets.set(socket, perSocket);
  }

  let bucket = perSocket.get(event);
  if (!bucket) {
    bucket = { hits: [], lastNotifiedAt: 0 };
    perSocket.set(event, bucket);
  }

  const { max, windowMs } = LIMITS[event] ?? DEFAULT_LIMIT;
  // Выбрасываем отметки, вышедшие из окна
  while (bucket.hits.length > 0 && now - bucket.hits[0] >= windowMs) {
    bucket.hits.shift();
  }

  if (bucket.hits.length >= max) {
    const notify = now - bucket.lastNotifiedAt >= NOTIFY_INTERVAL_MS;
    if (notify) bucket.lastNotifiedAt = now;
    return { allowed: false, notify };
  }

  bucket.hits.push(now);
  return { allowed: true, notify: false };
}

/** Нетипизированный on() — только для внутренней реализации onSafe */
interface RawListener {
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Зарегистрировать обработчик события с защитой.
 *
 * 1. Rate limiting — флуд и перебор токенов сессии отсекаются до обработки.
 * 2. try/catch — без него любая ошибка в обработчике (например, `data.tile`
 *    при `data === null` от кривого клиента) всплывает как uncaughtException
 *    и роняет весь сервер.
 *
 * Если последний аргумент события — ack-колбэк, отказ/ошибка сообщаются через него.
 */
export function onSafe(
  socket: GameSocket,
  event: keyof ClientToServerEvents,
  handler: (...args: unknown[]) => void
): void {
  // Имя события проверяется по контракту (опечатка = ошибка компиляции).
  // Аргументы приходят от клиента и потому намеренно `unknown` — их проверяет zod
  // в самом обработчике, поэтому регистрируем через нетипизированный on().
  (socket as unknown as RawListener).on(event, (...args: unknown[]) => {
    const lastArg = args[args.length - 1];
    const ack = typeof lastArg === 'function' ? (lastArg as (res: unknown) => void) : null;

    const fail = (code: string): void => {
      if (ack) ack({ ok: false, code, message: getErrorMessage(code) });
      else emitError(socket, code);
    };

    const limit = consume(socket, event);
    if (!limit.allowed) {
      logger.warn('[Socket]', `🚦 Лимит превышен: ${event} от ${socket.id}`);
      // С ack отвечаем всегда (клиент ждёт); без ack — не чаще раза в NOTIFY_INTERVAL_MS
      if (ack || limit.notify) fail('RATE_LIMITED');
      return;
    }

    try {
      handler(...args);
    } catch (err) {
      logger.error('[Socket]', `Необработанная ошибка в обработчике "${event}"`, err);
      fail('INTERNAL_ERROR');
    }
  });
}
