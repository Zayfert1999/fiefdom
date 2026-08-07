// packages/server/src/index.ts
// 🌟 Точка входа сервера: HTTP + Socket.IO + регистрация handlers

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@carcassonne/shared/protocol/events';
import cors from 'cors';
import { RoomManager } from './rooms/RoomManager';
import { registerLobbyHandlers } from './handlers/lobbyHandlers';
import { registerGameHandlers } from './handlers/gameHandlers';
import { logger } from './utils/logger';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();

// 🌟 Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 🌟 Список публичных комнат (для будущего браузера лобби)
app.get('/api/rooms', (_req, res) => {
  res.json(roomManager.listPublicRooms());
});

// 🌟 Подключения
io.on('connection', (socket) => {
  logger.info('[Server]', `🔌 Клиент подключился: ${socket.id}`);

  registerLobbyHandlers(io, socket as any, roomManager);
  registerGameHandlers(io, socket as any, roomManager);

  socket.on('disconnect', () => {
    logger.info('[Server]', `❌ Клиент отключился: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  logger.info('[Server]', `🚀 Запущен на http://localhost:${PORT}`);
  logger.info('[Server]', '🔌 Socket.IO готов к подключениям');
});