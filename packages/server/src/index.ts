// packages/server/src/index.ts
// 🌟 Точка входа сервера: HTTP + Socket.IO + регистрация handlers

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@fiefdom/shared/protocol/events';
import type { InterServerEvents, SocketData } from './types';
import cors from 'cors';
import { RoomManager } from './rooms/RoomManager';
import { registerLobbyHandlers } from './handlers/lobbyHandlers';
import { registerGameHandlers } from './handlers/gameHandlers';
import { registerRoomBrowserHandlers, bindRoomBrowserBroadcast } from './handlers/roomBrowserHandlers';
import { registerSystemHandlers } from './handlers/systemHandlers';
import { logger } from './utils/logger';
import { ipGuard, getClientIp, TRUST_PROXY } from './utils/ipGuard';

// 🌟 Разрешённые источники. Для продакшена: CORS_ORIGINS="https://game.example.com,https://example.github.io"
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const app = express();
// За прокси (TRUST_PROXY=1) req.ip берётся из X-Forwarded-For
if (TRUST_PROXY) app.set('trust proxy', true);
// REST и Socket.IO используют один и тот же список источников
app.use(cors({ origin: ALLOWED_ORIGINS }));

// 🛡️ Частота HTTP-запросов с одного адреса
app.use((req, res, next) => {
  if (ipGuard.allowHttpRequest(req.ip ?? 'unknown')) return next();
  res.status(429).json({ error: 'Слишком много запросов' });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
  // Сообщения протокола крошечные; по умолчанию (1 МБ) один клиент мог бы засыпать сервер крупными пакетами
  maxHttpBufferSize: 64 * 1024,
});

// 🛡️ Лимит одновременных соединений с одного IP
io.use((socket, next) => {
  const ip = getClientIp(socket.handshake.address, socket.handshake.headers);
  if (!ipGuard.tryAcquireConnection(ip)) {
    logger.warn('[Server]', `🚫 Отклонено соединение: слишком много подключений с одного адреса`);
    return next(new Error('TOO_MANY_CONNECTIONS'));
  }
  socket.data.ip = ip;
  // Освобождаем слот по закрытию транспорта (engine.io 'close' срабатывает всегда,
  // в отличие от socket 'disconnect', который не приходит, если клиент ушёл до завершения рукопожатия)
  socket.conn.once('close', () => ipGuard.releaseConnection(ip));
  next();
});

const roomManager = new RoomManager();

// 🌟 Изменения в списке комнат → рассылка подписчикам браузера комнат
bindRoomBrowserBroadcast(io, roomManager);

// 🌟 Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 🌟 Список публичных комнат (REST-вариант того же списка, что приходит по сокету)
app.get('/api/rooms', (_req, res) => {
  res.json(roomManager.listPublicRooms());
});

// 🌟 Подключения
io.on('connection', (socket) => {
  logger.info('[Server]', `🔌 Клиент подключился: ${socket.id}`);

  registerLobbyHandlers(io, socket, roomManager);
  registerGameHandlers(io, socket, roomManager);
  registerRoomBrowserHandlers(io, socket, roomManager);
  registerSystemHandlers(io, socket);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  logger.info('[Server]', `🚀 Запущен на http://localhost:${PORT}`);
  logger.info('[Server]', `🔌 Socket.IO готов к подключениям (CORS: ${ALLOWED_ORIGINS.join(', ')})`);
});

// ============================================
// 🛑 GRACEFUL SHUTDOWN
// Останавливаем таймеры комнат и интервалы, закрываем соединения.
// ============================================
let shuttingDown = false;
const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('[Server]', `🛑 Получен ${signal} — остановка сервера`);

  roomManager.dispose();
  ipGuard.dispose();
  io.close(() => process.exit(0));

  // Страховка: если соединения не закрылись — выходим принудительно
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
