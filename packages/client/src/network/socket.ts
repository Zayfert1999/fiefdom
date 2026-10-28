// packages/client/src/network/socket.ts
// 🌟 Обёртка над socket.io-client.
// Единственная точка создания socket-соединения.

import { netLog } from '@/network/netLog';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@fiefdom/shared/protocol/events';

// 🌟 Типизированный socket
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// 🌟 URL сервера: из env (VITE_SERVER_URL), по умолчанию — локальный сервер.
// Сервер должен разрешать origin клиента (см. CORS_ORIGINS на сервере).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

let socket: GameSocket | null = null;

/**
 * Получить (или создать) экземпляр socket-соединения.
 * Синглтон — соединение создаётся один раз.
 */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,          // Подключаемся вручную через connectToServer()
      reconnection: true,          // Авто-reconnect
      reconnectionDelay: 1000,     // 1 сек между попытками
      reconnectionDelayMax: 5000,  // Максимум 5 сек
      // Сервер хранит игрока в комнате ~5 минут → пытаемся вернуться примерно столько же
      // (60 попыток × до 5 сек). 10 попыток = ~40 сек, после чего игра терялась.
      reconnectionAttempts: 60,
      transports: ['websocket', 'polling'],
    });

    // 🌟 Базовые логи для отладки
    socket.on('connect', () => {
      netLog(`🔌 [Socket] Подключено: ${socket?.id}`);
    });

    socket.on('disconnect', (reason) => {
      console.warn(`❌ [Socket] Отключено: ${reason}`);
    });

    socket.on('connect_error', (error) => {
      console.error(`🚫 [Socket] Ошибка подключения:`, error.message);
    });

    // 🌟 ИСПРАВЛЕНО: правильные имена событий (без "ion")
    socket.io.on('reconnect_attempt', (attempt: number) => {
      netLog(`🔄 [Socket] Попытка переподключения #${attempt}`);
    });

    socket.io.on('reconnect', () => {
      netLog(`✅ [Socket] Переподключение успешно`);
    });

    socket.io.on('reconnect_failed', () => {
      console.error(`❌ [Socket] Не удалось переподключиться`);
    });
  }
  return socket;
}

/**
 * Полностью разорвать соединение (при выходе из игры).
 */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
    netLog(`🔌 [Socket] Соединение закрыто`);
  }
}
