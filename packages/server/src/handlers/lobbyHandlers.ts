// packages/server/src/handlers/lobbyHandlers.ts
// 🌟 Обработчики событий лобби (create/join/leave/ready/start)

import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager';
import { Room } from '../rooms/Room';
import { PlayerConnection } from '../state/PlayerConnection';
import { Player } from '@carcassonne/shared/core/types';
import { CreateRoomSchema, JoinRoomSchema } from '@carcassonne/shared/protocol/schemas';
import { logger } from '../utils/logger';

export function registerLobbyHandlers(io: Server, socket: Socket, roomManager: RoomManager): void {
  // ============================================
  // 🏠 СОЗДАНИЕ КОМНАТЫ
  // ============================================
  socket.on('lobby:create-room', (data) => {
    const parsed = CreateRoomSchema.safeParse(data);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_DATA', message: 'Неверные данные комнаты' });
      logger.warn('[Lobby]', 'Невалидные данные create-room', parsed.error.format());
      return;
    }

    const { playerName, settings } = parsed.data;
    const roomId = roomManager.generateRoomId();

    // 🌟 Создаём профиль игрока-хоста
    const hostPlayer: Player = {
      id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: playerName,
      color: '', // назначит Room.addPlayer
      meepleCount: 8,
      score: 0,
      pointsByCategory: { road: 0, city: 0, field: 0, monastery: 0 },
    };
    const hostConn = new PlayerConnection(hostPlayer, socket);
    socket.data.playerId = hostPlayer.id;
    socket.data.roomId = roomId;

    const room = new Room(roomId, settings, hostConn);
    roomManager.addRoom(room);

    socket.emit('lobby:room-created', { roomId, playerId: hostPlayer.id });
    socket.emit('lobby:room-joined', {
      roomId,
      playerId: hostPlayer.id,
      players: [hostConn.toLobbyPlayer(true)], // 🌟 Хост — первый игрок
      settings,
    });
    logger.info('[Lobby]', `${playerName} создал комнату ${roomId} (private=${settings.isPrivate})`);
  });

  // ============================================
  // 🚪 ПРИСОЕДИНЕНИЕ К КОМНАТЕ
  // ============================================
  socket.on('lobby:join-room', (data) => {
    const parsed = JoinRoomSchema.safeParse(data);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_DATA', message: 'Неверные данные' });
      return;
    }

    const { roomId, playerName } = parsed.data;
    const room = roomManager.getRoom(roomId);

    if (!room) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Комната не найдена' });
      return;
    }
    if (room.isFull) {
      socket.emit('error', { code: 'ROOM_FULL', message: 'Комната заполнена' });
      return;
    }

    const newPlayer: Player = {
      id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: playerName,
      color: '',
      meepleCount: 8,
      score: 0,
      pointsByCategory: { road: 0, city: 0, field: 0, monastery: 0 },
    };
    const newConn = new PlayerConnection(newPlayer, socket);
    socket.data.playerId = newPlayer.id;
    socket.data.roomId = roomId;

    room.addPlayer(newConn);

    // 🌟 Новому игроку — полный список + настройки
    const players = Array.from(room.players.values())
      .map(c => c.toLobbyPlayer(c.id === room.hostId));
    socket.emit('lobby:room-joined', {
      roomId,
      playerId: newPlayer.id,
      players,
      settings: room.settings,
    });

    // 🌟 Остальным — что пришёл новый
    socket.to(roomId).emit('lobby:player-joined', newConn.toLobbyPlayer(false));
    logger.info('[Lobby]', `${playerName} присоединился к ${roomId}`);
  });

  // ============================================
  // 👋 ЯВНЫЙ ВЫХОД ИЗ КОМНАТЫ (кнопка "Выйти")
  // ============================================
  const handleLeaveRoom = () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    logger.info('[Lobby]', `👋 Игрок ${playerId} вышел из ${roomId}`);

    // Полное удаление игрока
    room.removePlayer(playerId);

    // Уведомляем остальных
    socket.to(roomId).emit('lobby:player-left', {
      playerId,
      newHostId: room.hostId,
    });

    // Удаляем пустую комнату
    if (room.players.size === 0) {
      room.dispose();
      roomManager.removeRoom(roomId);
      logger.info('[Lobby]', `🗑️ Комната ${roomId} удалена (пуста)`);
    }

    // Очищаем данные socket
    delete socket.data.roomId;
    delete socket.data.playerId;
  };

  // ============================================
  // 🔌 DISCONNECT (перезагрузка страницы, потеря связи)
  // ============================================
  const handleDisconnect = (reason: string) => {
    const { roomId, playerId } = socket.data;
    logger.info('[Server]', `❌ Клиент отключился: ${socket.id} (причина: ${reason})`);

    if (!roomId || !playerId) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // 🌟 НЕ удаляем игрока — только помечаем как отключённого
    // Это позволяет reconnect в течение таймаута cleanup
    room.markPlayerDisconnected(playerId);

    // 🌟 Проверяем, все ли игроки отключились
    const allDisconnected = Array.from(room.players.values())
      .every(p => p.isDisconnected);

    if (allDisconnected) {
      logger.info('[Server]', `⏱️ Все игроки отключились в комнате ${roomId} — ожидание cleanup`);
      // Cleanup произойдёт через таймер RoomManager (5 минут)
    }
  };

  socket.on('lobby:leave-room', handleLeaveRoom);
  socket.on('disconnect', handleDisconnect);

  // ============================================
  // ✅ ГОТОВНОСТЬ
  // ============================================
  socket.on('lobby:set-ready', (ready: boolean) => {
    const { roomId, playerId } = socket.data;
    const room = roomManager.getRoom(roomId);
    const conn = room?.players.get(playerId);
    if (!room || !conn) return;

    conn.isReady = ready;
    room.broadcast('lobby:player-ready', { playerId, isReady: ready });
    logger.info('[Lobby]', `${conn.name} ready=${ready}`);
  });

  // ============================================
  // 🚀 СТАРТ ИГРЫ (только хост)
  // ============================================
  socket.on('lobby:start-game', () => {
    const { roomId, playerId } = socket.data;
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (room.hostId !== playerId) {
      socket.emit('error', { code: 'NOT_HOST', message: 'Только хост может начать игру' });
      return;
    }
    room.startGame();
  });

  // ============================================
  // 🔄 ВОССТАНОВЛЕНИЕ СОЕДИНЕНИЯ
  // ============================================
  socket.on('lobby:reconnect', (data) => {
    const { playerId, roomId, playerName } = data;
    logger.info('[Lobby]', `🔄 Запрос reconnect: ${playerName} → комната ${roomId}`);

    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit('lobby:reconnect-failed', { reason: 'Комната не найдена (возможно, была удалена)' });
      return;
    }

    const result = room.reconnectPlayer(playerId, playerName, socket);

    if (result.success && result.data) {
      socket.emit('lobby:reconnect-success', result.data);
    } else {
      socket.emit('lobby:reconnect-failed', { reason: result.reason || 'Неизвестная ошибка' });
    }
  });

}

