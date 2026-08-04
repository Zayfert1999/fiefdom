// packages/server/src/index.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`🔌 [Server] Клиент подключился: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`❌ [Server] Клиент отключился: ${socket.id}`);
  });
  
  // Эхо-тест для проверки связи
  socket.on('ping', (data: unknown) => {
    console.log(`📨 [Server] Получен ping:`, data);
    socket.emit('pong', { received: data, serverTime: Date.now() });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 [Server] Запущен на http://localhost:${PORT}`);
  console.log(`🔌 [Server] Socket.IO готов к подключениям`);
});