// packages/server/src/handlers/lobbyHandlers.ts
// 🌟 Обработчики событий лобби (create/join/leave/ready/kick/start/reconnect/session-check)

import type { GameServer, GameSocket } from '../types';
import type { RoomManager } from '../rooms/RoomManager';
import { Room } from '../rooms/Room';
import { PlayerConnection } from '../state/PlayerConnection';
import type { Player } from '@fiefdom/shared/core/types';
import {
  CreateRoomSchema,
  JoinRoomSchema,
  ReconnectSchema,
  KickPlayerSchema,
  SetReadySchema,
  CheckActiveSchema,
} from '@fiefdom/shared/protocol/schemas';
import { logger } from '../utils/logger';
import { emitError, onSafe } from '../utils/socketUtils';

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

/** Профиль нового игрока с начальными значениями */
function createPlayerProfile(name: string): Player {
  return {
    id: generatePlayerId(),
    name,
    color: '', // назначит Room.addPlayer
    meepleCount: 8,
    score: 0,
    pointsByCategory: { road: 0, city: 0, field: 0, monastery: 0 },
  };
}

// ============================================
// 🌟 РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ
// ============================================

export function registerLobbyHandlers(io: GameServer, socket: GameSocket, roomManager: RoomManager): void {

  // ============================================
  // 🚪 ВЫХОД ИЗ ТЕКУЩЕЙ КОМНАТЫ (общая логика)
  // Используется: кнопка «Выйти», создание/вход в другую комнату.
  // ============================================
  const leaveCurrentRoom = (): void => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;

    // Сразу очищаем данные сокета — дальше он «нигде не состоит»
    delete socket.data.roomId;
    delete socket.data.playerId;

    const room = roomManager.getRoom(roomId);
    const conn = room?.players.get(playerId);
    if (!room || !conn) return;

    logger.info('[Lobby]', `👋 Игрок ${playerId} вышел из ${roomId}`);

    // 🌟 В идущей игре игрок остаётся в gameState (очередь ходов, очки, миплы),
    // поэтому удалять его из room.players нельзя — иначе состояние игры и комнаты
    // разойдутся. Игрок помечается отключённым И выбывшим: в очереди ходов его
    // больше не ждут (если сейчас его ход — он пропускается сразу, без таймера).
    if (room.isGameStarted) {
      room.handlePlayerLeftGame(playerId);
      socket.leave(roomId);
      roomManager.notifyRoomsChanged();
      return;
    }

    // Лобби: полное удаление игрока
    room.removePlayer(playerId);

    // Уведомляем остальных (игрок уже удалён из room.players → сам не получит)
    room.broadcast('lobby:player-left', {
      playerId,
      newHostId: room.hostId,
    });

    // Удаляем пустую комнату
    if (room.players.size === 0) {
      room.dispose();
      roomManager.removeRoom(roomId);
      logger.info('[Lobby]', `🗑️ Комната ${roomId} удалена (пуста)`);
      return;
    }

    roomManager.notifyRoomsChanged();
  };

  // ============================================
  // 🏠 СОЗДАНИЕ КОМНАТЫ
  // ============================================
  onSafe(socket, 'lobby:create-room', (data) => {
    const parsed = CreateRoomSchema.safeParse(data);
    if (!parsed.success) {
      emitError(socket, 'INVALID_DATA');
      logger.warn('[Lobby]', 'Невалидные данные create-room', parsed.error.format());
      return;
    }

    const { playerName, settings, preferredColor } = parsed.data;
    const validatedName = validatePlayerName(playerName);

    // 🌟 Один сокет — одна комната: выходим из прежней, чтобы не плодить
    // «призрачные» комнаты и не терять привязку сокета
    leaveCurrentRoom();

    const roomId = roomManager.generateRoomId();

    const hostPlayer = createPlayerProfile(validatedName);
    const hostConn = new PlayerConnection(hostPlayer, socket);
    socket.data.playerId = hostPlayer.id;
    socket.data.roomId = roomId;

    // Цвет (с учётом предпочтения) назначается внутри конструктора Room
    const room = new Room(roomId, settings, hostConn, preferredColor);
    roomManager.addRoom(room); // → уведомит подписчиков браузера комнат

    // 🌟 Хосту — уведомление о создании
    socket.emit('lobby:room-created', { roomId, playerId: hostPlayer.id });

    // 🌟 Хосту — снапшот через room-joined (единый формат)
    socket.emit('lobby:room-joined', {
      snapshot: room.getSnapshot(hostPlayer.id),
    });

    logger.info('[Lobby]', `${validatedName} создал комнату ${roomId} (private=${settings.isPrivate}, color=${hostPlayer.color})`);
  });

  // ============================================
  // 🚪 ПРИСОЕДИНЕНИЕ К КОМНАТЕ
  // ============================================
  onSafe(socket, 'lobby:join-room', (data) => {
    const parsed = JoinRoomSchema.safeParse(data);
    if (!parsed.success) {
      emitError(socket, 'INVALID_DATA');
      return;
    }

    const { roomId: rawRoomId, playerName, preferredColor } = parsed.data;
    const roomId = rawRoomId.toUpperCase();

    const room = roomManager.getRoom(roomId);

    if (!room) {
      emitError(socket, 'ROOM_NOT_FOUND');
      return;
    }

    // 🌟 Повторный join в ту же комнату — просто отдаём актуальный снапшот
    if (socket.data.roomId === roomId && socket.data.playerId && room.players.has(socket.data.playerId)) {
      socket.emit('lobby:room-joined', { snapshot: room.getSnapshot(socket.data.playerId) });
      return;
    }

    // 🌟 В идущую игру присоединиться нельзя: игрок попал бы в room.players,
    // но не в gameState → рассинхрон (вернуться в игру можно только через reconnect)
    if (room.isGameStarted) {
      emitError(socket, 'GAME_ALREADY_STARTED');
      return;
    }
    if (room.isFull) {
      emitError(socket, 'ROOM_FULL');
      return;
    }

    // Все проверки пройдены — выходим из прежней комнаты (если были в ней)
    leaveCurrentRoom();

    const validatedName = validatePlayerName(playerName);
    const newPlayer = createPlayerProfile(validatedName);
    const newConn = new PlayerConnection(newPlayer, socket);
    socket.data.playerId = newPlayer.id;
    socket.data.roomId = roomId;

    room.addPlayer(newConn, preferredColor);

    // Новому игроку — снапшот
    socket.emit('lobby:room-joined', {
      snapshot: room.getSnapshot(newPlayer.id),
    });

    // Остальным — что пришёл новый
    socket.to(roomId).emit('lobby:player-joined', newConn.toLobbyPlayer(false));

    roomManager.notifyRoomsChanged();
    logger.info('[Lobby]', `${validatedName} присоединился к ${roomId} (color=${newPlayer.color})`);
  });

  // ============================================
  // 👋 ЯВНЫЙ ВЫХОД ИЗ КОМНАТЫ (кнопка "Выйти")
  // ============================================
  onSafe(socket, 'lobby:leave-room', () => {
    leaveCurrentRoom();
  });

  // ============================================
  // 🔌 DISCONNECT (перезагрузка страницы, потеря связи)
  // ============================================
  socket.on('disconnect', (reason: string) => {
    const { roomId, playerId } = socket.data;
    logger.info('[Server]', `❌ Клиент отключился: ${socket.id} (причина: ${reason})`);

    if (!roomId || !playerId) return;

    const room = roomManager.getRoom(roomId);
    const conn = room?.players.get(playerId);
    if (!room || !conn) return;

    // 🌟 Игрок мог уже переподключиться с НОВОГО сокета (reload, авто-reconnect).
    // Запоздалый disconnect старого сокета не должен помечать его отключённым —
    // иначе живой игрок перестанет получать события.
    if (conn.socket !== socket) {
      logger.info('[Server]', `↪️ Disconnect устаревшего сокета ${socket.id} игнорируется (игрок ${playerId} уже на новом)`);
      return;
    }

    // НЕ удаляем игрока — только помечаем как отключённого
    room.markPlayerDisconnected(playerId);
    roomManager.notifyRoomsChanged();

    // Проверяем, все ли игроки отключились
    const allDisconnected = Array.from(room.players.values())
      .every(p => p.isDisconnected);

    if (allDisconnected) {
      logger.info('[Server]', `⏱️ Все игроки отключились в комнате ${roomId} — ожидание cleanup`);
    }
  });

  // ============================================
  // ✅ ГОТОВНОСТЬ
  // ============================================
  onSafe(socket, 'lobby:set-ready', (ready) => {
    const parsed = SetReadySchema.safeParse(ready);
    if (!parsed.success) {
      logger.warn('[Lobby]', 'Невалидные данные set-ready', parsed.error.format());
      emitError(socket, 'INVALID_DATA');
      return;
    }

    const { roomId, playerId } = socket.data;
    const room = roomId ? roomManager.getRoom(roomId) : undefined;
    const conn = playerId ? room?.players.get(playerId) : undefined;
    if (!room || !conn) {
      emitError(socket, 'NOT_IN_ROOM');
      return;
    }
    if (room.isGameStarted) {
      emitError(socket, 'GAME_ALREADY_STARTED');
      return;
    }

    conn.isReady = parsed.data;
    room.broadcast('lobby:player-ready', { playerId: conn.id, isReady: parsed.data });
    logger.info('[Lobby]', `${conn.name} ready=${parsed.data}`);
  });

  // ============================================
  // 👢 КИК ИГРОКА (только хост, только в лобби)
  // ============================================
  onSafe(socket, 'lobby:kick-player', (data) => {
    const parsed = KickPlayerSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn('[Lobby]', 'Невалидные данные kick-player', parsed.error.format());
      emitError(socket, 'INVALID_DATA');
      return;
    }

    const { playerId: kickedId } = parsed.data;
    const { roomId, playerId: kickerId } = socket.data;

    const room = roomId ? roomManager.getRoom(roomId) : undefined;
    if (!room || !kickerId) {
      emitError(socket, 'NOT_IN_ROOM');
      return;
    }

    if (room.hostId !== kickerId) {
      emitError(socket, 'NOT_HOST', 'Только хост может исключать игроков');
      return;
    }

    // 🌟 В идущей игре исключать нельзя: игрок остался бы в очереди ходов
    if (room.isGameStarted) {
      emitError(socket, 'GAME_ALREADY_STARTED');
      return;
    }

    if (kickedId === kickerId) {
      emitError(socket, 'INVALID_ACTION', 'Нельзя исключить самого себя');
      return;
    }

    const kickedConn = room.players.get(kickedId);
    if (!kickedConn) return;

    logger.info('[Lobby]', `👢 Хост ${kickerId} кикнул игрока ${kickedId} из комнаты ${roomId}`);

    kickedConn.emit('lobby:kicked');

    // 🌟 Отвязываем сокет кикнутого от комнаты, чтобы он не мог слать события «из неё»
    if (kickedConn.socket) {
      delete kickedConn.socket.data.roomId;
      delete kickedConn.socket.data.playerId;
    }

    room.removePlayer(kickedId);
    room.broadcast('lobby:player-kicked', { playerId: kickedId });
    roomManager.notifyRoomsChanged();
  });

  // ============================================
  // 🚀 СТАРТ ИГРЫ (только хост)
  // ============================================
  onSafe(socket, 'lobby:start-game', () => {
    const { roomId, playerId } = socket.data;
    const room = roomId ? roomManager.getRoom(roomId) : undefined;
    if (!room) {
      emitError(socket, 'NOT_IN_ROOM');
      return;
    }
    if (room.hostId !== playerId) {
      emitError(socket, 'NOT_HOST', 'Только хост может начать игру');
      return;
    }

    // 🌟 Раньше проверок не было: можно было стартовать в одиночку,
    // с неготовыми игроками и даже перезапустить уже идущую игру
    const blocker = room.getStartBlocker();
    if (blocker) {
      emitError(socket, blocker);
      return;
    }

    // 🌟 ШАГ 1: Инициализируем игру (БЕЗ beginTurn)
    room.initializeGame();

    // 🌟 ШАГ 2: Рассылаем снапшот каждому игроку
    // ВАЖНО: это ДО beginTurn(), чтобы снапшот пришёл ПЕРЕД game:your-turn
    for (const conn of room.players.values()) {
      if (conn.isDisconnected) continue;
      conn.emit('game:started', { snapshot: room.getSnapshot(conn.id) });
    }

    logger.info('[Lobby]', `🎮 Игра началась в комнате ${roomId} (gameStartTime=${room.gameState.gameStartTime})`);

    // Комната перешла в состояние «идёт игра» — обновляем браузер комнат
    roomManager.notifyRoomsChanged();

    // 🌟 ШАГ 3: Начинаем первый ход (broadcastState + game:your-turn)
    room.startFirstTurn();
  });

  // ============================================
  // 🔍 ПРОВЕРКА АКТИВНЫХ ИГР (кнопка "Продолжить")
  // ============================================
  onSafe(socket, 'session:check-active', (data) => {
    const parsed = CheckActiveSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn('[Session]', 'Невалидные данные check-active', parsed.error.format());
      socket.emit('session:active-games', { game: null });
      return;
    }
    const { playerId, sessionToken } = parsed.data;

    logger.info('[Session]', `🔍 Проверка активных игр для ${playerId}`);

    // Ищем последнюю активную игру для игрока (только при верном токене сессии)
    const lastGame = roomManager.findLastActiveGameForPlayer(playerId, sessionToken);

    if (lastGame) {
      logger.info('[Session]', `Найдена последняя игра: комната ${lastGame.roomId}`);
    } else {
      logger.info('[Session]', 'Активных игр не найдено');
    }

    socket.emit('session:active-games', { game: lastGame });
  });

  // ============================================
  // 🔄 ВОССТАНОВЛЕНИЕ СОЕДИНЕНИЯ (playerId + секретный sessionToken)
  // ============================================
  onSafe(socket, 'lobby:reconnect', (data) => {
    const parsed = ReconnectSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn('[Lobby]', 'Невалидные данные reconnect', parsed.error.format());
      socket.emit('lobby:reconnect-failed', { reason: 'Неверные данные' });
      return;
    }

    const { playerId, roomId, sessionToken } = parsed.data;
    logger.info('[Lobby]', `🔄 Запрос reconnect: ${playerId} → комната ${roomId}`);

    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit('lobby:reconnect-failed', {
        reason: 'Комната не найдена (возможно, была удалена)',
      });
      return;
    }

    // Этот сокет мог состоять в другой комнате — выходим из неё
    if (socket.data.roomId && socket.data.roomId !== roomId) {
      leaveCurrentRoom();
    }

    const result = room.reconnectPlayer(playerId, socket, sessionToken);

    if (result.success && result.snapshot) {
      socket.emit('lobby:reconnect-success', { snapshot: result.snapshot });
      roomManager.notifyRoomsChanged();
    } else {
      socket.emit('lobby:reconnect-failed', {
        reason: result.reason || 'Неизвестная ошибка',
      });
    }
  });
}
