// packages/server/src/handlers/lobbyHandlers.ts
// 🌟 Обработчики событий лобби (create/join/leave/ready/start/reconnect/session-check)

import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager';
import { Room } from '../rooms/Room';
import { PlayerConnection } from '../state/PlayerConnection';
import { Player } from '@carcassonne/shared/core/types';
import { CreateRoomSchema, JoinRoomSchema } from '@carcassonne/shared/protocol/schemas';
import { logger } from '../utils/logger';

// ============================================
// 🌟 ХЕЛПЕРЫ
// ============================================

const MAX_NAME_LENGTH = 20;
const DEFAULT_NAME = 'Игрок';

/**
 * Валидация имени: пустое или слишком длинное → "Игрок"
 */
function validatePlayerName(name: string): string {
  const trimmed = name?.trim() || '';
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    return DEFAULT_NAME;
  }
  return trimmed;
}

/**
 * Генерация уникального ID игрока
 */
function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================
// 🌟 РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ
// ============================================

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

    // 🌟 Берём preferredColor (опциональный)
    const { playerName, settings, preferredColor } = parsed.data as {
      playerName: string;
      settings: any;
      preferredColor?: string;
    };

    // 🌟 Валидация имени
    const validatedName = validatePlayerName(playerName);

    const roomId = roomManager.generateRoomId();

    // Создаём профиль игрока-хоста (цвет будет назначен в addPlayer)
    const hostPlayer: Player = {
      id: generatePlayerId(),
      name: validatedName,
      color: '', // назначит Room.addPlayer
      meepleCount: 8,
      score: 0,
      pointsByCategory: { road: 0, city: 0, field: 0, monastery: 0 },
    };
    const hostConn = new PlayerConnection(hostPlayer, socket);
    socket.data.playerId = hostPlayer.id;
    socket.data.roomId = roomId;

    const room = new Room(roomId, settings, hostConn);

    // 🌟 Переопределяем цвет через addPlayer с preferredColor
    // (хост уже добавлен в конструкторе Room, но цвет может быть другим)
    // Если preferredColor есть и свободен — используем его
    if (preferredColor) {
      const usedColors = new Set(
        Array.from(room.players.values()).map(p => p.player.color)
      );
      if (!usedColors.has(preferredColor)) {
        hostPlayer.color = preferredColor;
        logger.info('[Lobby]', `Хосту назначен предпочтительный цвет: ${preferredColor}`);
      }
    }

    roomManager.addRoom(room);

    socket.emit('lobby:room-created', { roomId, playerId: hostPlayer.id });
    socket.emit('lobby:room-joined', {
      roomId,
      playerId: hostPlayer.id,
      players: [hostConn.toLobbyPlayer(true)],
      settings,
    });

    logger.info('[Lobby]', `${validatedName} создал комнату ${roomId} (private=${settings.isPrivate}, color=${hostPlayer.color})`);
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

    // 🌟 Берём preferredColor (опциональный)
    const { roomId, playerName, preferredColor } = parsed.data as {
      roomId: string;
      playerName: string;
      preferredColor?: string;
    };

    const room = roomManager.getRoom(roomId);

    if (!room) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Комната не найдена' });
      return;
    }
    if (room.isFull) {
      socket.emit('error', { code: 'ROOM_FULL', message: 'Комната заполнена' });
      return;
    }

    // 🌟 Валидация имени
    const validatedName = validatePlayerName(playerName);

    const newPlayer: Player = {
      id: generatePlayerId(),
      name: validatedName,
      color: '',
      meepleCount: 8,
      score: 0,
      pointsByCategory: { road: 0, city: 0, field: 0, monastery: 0 },
    };
    const newConn = new PlayerConnection(newPlayer, socket);
    socket.data.playerId = newPlayer.id;
    socket.data.roomId = roomId;

    // 🌟 Передаём preferredColor в addPlayer
    room.addPlayer(newConn, preferredColor);

    // Новому игроку — полный список + настройки
    const players = Array.from(room.players.values())
      .map(c => c.toLobbyPlayer(c.id === room.hostId));
    socket.emit('lobby:room-joined', {
      roomId,
      playerId: newPlayer.id,
      players,
      settings: room.settings,
    });

    // Остальным — что пришёл новый
    socket.to(roomId).emit('lobby:player-joined', newConn.toLobbyPlayer(false));
    logger.info('[Lobby]', `${validatedName} присоединился к ${roomId} (color=${newPlayer.color})`);
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

    // НЕ удаляем игрока — только помечаем как отключённого
    room.markPlayerDisconnected(playerId);

    // Проверяем, все ли игроки отключились
    const allDisconnected = Array.from(room.players.values())
      .every(p => p.isDisconnected);

    if (allDisconnected) {
      logger.info('[Server]', `⏱️ Все игроки отключились в комнате ${roomId} — ожидание cleanup`);
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
  // 👢 КИК ИГРОКА (только хост)
  // ============================================
  socket.on('lobby:kick-player', (data) => {
    const { playerId: kickedId } = data;
    const { roomId, playerId: kickerId } = socket.data;

    if (!roomId || !kickerId) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    if (room.hostId !== kickerId) {
      socket.emit('error', { code: 'NOT_HOST', message: 'Только хост может кикать игроков' });
      return;
    }

    if (kickedId === kickerId) {
      socket.emit('error', { code: 'INVALID_ACTION', message: 'Нельзя кикнуть себя' });
      return;
    }

    const kickedConn = room.players.get(kickedId);
    if (!kickedConn) return;

    logger.info('[Lobby]', `👢 Хост ${kickerId} кикнул игрока ${kickedId} из комнаты ${roomId}`);

    kickedConn.emit('lobby:kicked');
    room.removePlayer(kickedId);
    room.broadcast('lobby:player-kicked', { playerId: kickedId });
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

    // 🌟 НОВОЕ: рассылаем game:started каждому игроку
    // ВАЖНО: serializeForPlayer учитывает приватность drawnTile —
    // каждый игрок видит только СВОЙ тайл в руке
    for (const conn of room.players.values()) {
      if (conn.isDisconnected) continue;

      const personalGameState = room.gameState.serializeForPlayer(conn.id);
      conn.emit('game:started', {
        gameState: personalGameState,
        seed: room.gameState.seed,
        yourPlayerId: conn.id,
        gameStartTime: room.gameStartTime!,
      });
    }
  });

  // ============================================
  // 🔍 ПРОВЕРКА АКТИВНЫХ ИГР (новая кнопка "Продолжить")
  // ============================================
  socket.on('session:check-active', (data) => {
    const { playerId } = data;

    if (!playerId) {
      socket.emit('session:active-games', { game: null });
      return;
    }

    logger.info('[Session]', `🔍 Проверка активных игр для ${playerId}`);

    // Ищем последнюю активную игру для игрока
    const lastGame = roomManager.findLastActiveGameForPlayer(playerId);

    if (lastGame) {
      logger.info('[Session]', `Найдена последняя игра: комната ${lastGame.roomId}`);
    } else {
      logger.info('[Session]', 'Активных игр не найдено');
    }

    socket.emit('session:active-games', {
      game: lastGame,
    });
  });

  // ============================================
  // 🔄 ВОССТАНОВЛЕНИЕ СОЕДИНЕНИЯ (только по playerId)
  // ============================================
  socket.on('lobby:reconnect', (data) => {
    // 🌟 ИСПРАВЛЕНО: только playerId и roomId, без playerName
    const { playerId, roomId } = data;
    logger.info('[Lobby]', `🔄 Запрос reconnect: ${playerId} → комната ${roomId}`);

    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit('lobby:reconnect-failed', {
        reason: 'Комната не найдена (возможно, была удалена)'
      });
      return;
    }

    // 🌟 Передаём только playerId (имя и цвет уже есть в PlayerConnection)
    const result = room.reconnectPlayer(playerId, socket);

    if (result.success && result.data) {
      socket.emit('lobby:reconnect-success', result.data);
    } else {
      socket.emit('lobby:reconnect-failed', {
        reason: result.reason || 'Неизвестная ошибка'
      });
    }
  });
}
