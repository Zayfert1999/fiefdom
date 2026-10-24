// packages/client/src/state/slices/networkSlice.ts
// 🌟 Состояние сетевого подключения и комнаты.
// НЕ содержит игровую логику — только сетевой слой.

import type { StateCreator } from 'zustand';
import type {
  RoomSettings,
  LobbyPlayer,
  RoomInfo,
} from '@fiefdom/shared/protocol/events';
import { getSocket, destroySocket, type GameSocket } from '@/network/socket';
import { toast } from '@/state/useToastStore';
import type { GameStore } from '../useGameStore';
import { registerStateSync, unregisterStateSync } from '@/network/stateSync';
import {
  saveConnectionInfo,
  clearConnectionInfo,
  savePlayerName,
  loadPlayerName,
} from '@/network/persistence';



/**
 * 🌟 Проверка связи перед отправкой.
 * socket.io буферизует emit() при обрыве и доставляет позже — игрок нажал
 * «Создать комнату» без сети, а комната появилась бы через минуту после
 * реконнекта. Лучше сразу честно сказать «нет связи».
 */
function ensureConnected(socket: GameSocket): boolean {
  if (socket.connected) return true;
  toast.error('Нет подключения к серверу', { dedupeKey: 'no-connection' });
  return false;
}

export type LobbyScreen = 'modeSelect' | 'localLobby' | 'networkLobby' | 'geometrySandbox';

export interface NetworkSlice {
  // === Состояние лобби ===
  lobbyScreen: LobbyScreen;
  setLobbyScreen: (screen: LobbyScreen) => void;

  // === Состояние подключения ===
  isConnected: boolean;
  isReconnecting: boolean;
  isReconnectingToRoom: boolean;
  connectionError: string | null;

  // === Состояние комнаты ===
  roomId: string | null;
  playerId: string | null;
  roomSettings: RoomSettings | null;
  networkLobbyPlayers: LobbyPlayer[];
  isHost: boolean;

  // === Браузер комнат ===
  /** Список публичных комнат (null — ещё не загружен) */
  roomList: RoomInfo[] | null;
  /** Открыт ли браузер комнат (нужно, чтобы переподписаться после реконнекта) */
  isBrowsingRooms: boolean;

  // === Действия: подключение ===
  connectToServer: () => void;
  disconnectFromServer: () => void;

  // === Действия: лобби ===
  createRoom: (playerName: string, settings: RoomSettings, preferredColor?: string) => void;
  joinRoom: (roomId: string, playerName: string, preferredColor?: string) => void;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  kickPlayer: (playerId: string) => void;
  startNetworkGame: () => void;

  // === Действия: браузер комнат ===
  startRoomBrowsing: () => void;
  stopRoomBrowsing: () => void;
  refreshRoomList: () => void;

  // === Действия: игра (отправка намерений на сервер) ===
  sendCommitMove: (
    tile: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
    meeple: { featureId: string; x: number; y: number } | null
  ) => void;

  // === Внутренние методы (вызываются из stateSync) ===
  _setConnected: (connected: boolean) => void;
  _setReconnecting: (reconnecting: boolean) => void;
  _setConnectionError: (error: string | null) => void;
  _setRoomInfo: (roomId: string, playerId: string) => void;
  _setLobbyPlayers: (players: LobbyPlayer[]) => void;
  _setRoomSettings: (settings: RoomSettings) => void;
  _setHost: (isHost: boolean) => void;
  _setRoomList: (rooms: RoomInfo[]) => void;
  _saveConnectionInfo: (playerId: string, roomId: string) => void;
}

export const createNetworkSlice: StateCreator<GameStore, [], [], NetworkSlice> = (set) => ({
  // === Начальное состояние ===
  lobbyScreen: 'modeSelect',
  isConnected: false,
  isReconnecting: false,
  isReconnectingToRoom: false,
  connectionError: null,
  roomId: null,
  playerId: null,
  roomSettings: null,
  networkLobbyPlayers: [],
  isHost: false,
  roomList: null,
  isBrowsingRooms: false,

  setLobbyScreen: (screen) => {
    console.log(`🎮 [Network] Экран лобби: ${screen}`);
    set({ lobbyScreen: screen });
  },

  // ============================================
  // 🔌 ПОДКЛЮЧЕНИЕ
  // ============================================

  connectToServer: () => {
    console.log(`🔌 [Network] Подключение к серверу...`);
    const socket = getSocket();

    // 🌟 КЛЮЧЕВОЕ: регистрируем обработчики ПЕРЕД socket.connect()
    // Это гарантирует, что событие 'connect' будет поймано
    registerStateSync(socket);

    if (!socket.connected) {
      socket.connect();
    }
  },

  disconnectFromServer: () => {
    console.log(`🔌 [Network] Отключение от сервера`);
    destroySocket();
    unregisterStateSync();
    set({
      isConnected: false,
      isReconnecting: false,
      roomId: null,
      playerId: null,
      roomSettings: null,
      networkLobbyPlayers: [],
      isHost: false,
      roomList: null,
      isBrowsingRooms: false,
      lobbyScreen: 'modeSelect',
    });
  },

  // ============================================
  // 🏠 ЛОББИ
  // ============================================

  createRoom: (playerName, settings, preferredColor) => {
    const socket = getSocket();
    if (!ensureConnected(socket)) return;
    console.log(`🏠 [Network] Создание комнаты: ${playerName} (цвет: ${preferredColor})`, settings);
    savePlayerName(playerName);
    socket.emit('lobby:create-room', { playerName, settings, preferredColor });
  },

  joinRoom: (roomId, playerName, preferredColor) => {
    const socket = getSocket();
    if (!ensureConnected(socket)) return;
    console.log(`🚪 [Network] Присоединение к комнате ${roomId}: ${playerName} (цвет: ${preferredColor})`);
    savePlayerName(playerName);
    socket.emit('lobby:join-room', { roomId, playerName, preferredColor });
  },

  leaveRoom: () => {
    const socket = getSocket();
    console.log(`👋 [Network] Выход из комнаты`);
    // Без связи выход всё равно выполняем локально (сервер сам пометит отключение)
    if (socket.connected) socket.emit('lobby:leave-room');
    // Очищаем данные комнаты при выходе
    clearConnectionInfo();

    set({
      roomId: null,
      playerId: null,
      roomSettings: null,
      networkLobbyPlayers: [],
      isHost: false,
      isReconnectingToRoom: false,  // 🌟 Сбрасываем флаг
      lobbyScreen: 'modeSelect',
    });
  },

  setReady: (ready) => {
    const socket = getSocket();
    if (!ensureConnected(socket)) return;
    console.log(`✅ [Network] Готовность: ${ready}`);
    socket.emit('lobby:set-ready', ready);
  },

  kickPlayer: (playerId) => {
    const socket = getSocket();
    if (!ensureConnected(socket)) return;
    console.log(`👢 [Network] Кик игрока: ${playerId}`);
    socket.emit('lobby:kick-player', { playerId });
  },

  startNetworkGame: () => {
    const socket = getSocket();
    if (!ensureConnected(socket)) return;
    console.log(`🚀 [Network] Запрос старта игры`);
    socket.emit('lobby:start-game');
  },

  // ============================================
  // 🔎 БРАУЗЕР КОМНАТ
  // ============================================

  startRoomBrowsing: () => {
    set({ isBrowsingRooms: true });
    const socket = getSocket();
    // Если связи нет — подписка уйдёт из обработчика connect (см. connectionHandlers)
    if (socket.connected) socket.emit('lobby:subscribe-rooms');
  },

  stopRoomBrowsing: () => {
    // Список сбрасываем, чтобы при повторном открытии не мелькали устаревшие данные
    set({ isBrowsingRooms: false, roomList: null });
    const socket = getSocket();
    if (socket.connected) socket.emit('lobby:unsubscribe-rooms');
  },

  refreshRoomList: () => {
    const socket = getSocket();
    if (!ensureConnected(socket)) return;
    socket.emit('lobby:list-rooms');
  },

  // ============================================
  // 🎮 ИГРОВЫЕ ДЕЙСТВИЯ (отправка на сервер)
  // ============================================

  sendCommitMove: (
    tile: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
    meeple: { featureId: string; x: number; y: number } | null
  ) => {
    const socket = getSocket();
    // 🌟 Не буферизуем ход: после реконнекта сервер пришлёт снапшот,
    // и клиент вернётся в фазу размещения тайла (сервер этот ход так и не получил)
    if (!ensureConnected(socket)) return;
    console.log(`📤 [Network] commit-move → тайл (${tile.x}, ${tile.y}), мипл: ${meeple ? 'да' : 'нет'}`);
    socket.emit('game:commit-move', { tile, meeple });
  },

  // ============================================
  // 🔧 ВНУТРЕННИЕ МЕТОДЫ (для stateSync)
  // ============================================

  _setConnected: (connected) => set({ isConnected: connected }),
  _setReconnecting: (reconnecting) => set({ isReconnecting: reconnecting }),
  _setConnectionError: (error) => set({ connectionError: error }),
  _setRoomInfo: (roomId, playerId) => {
    console.log(`📥 [Network] _setRoomInfo вызван: room=${roomId}, player=${playerId}`);  // 🌟 ЛОГ
    set({ roomId, playerId });
    const playerName = loadPlayerName();
    console.log(`💾 [Network] Загруженное имя: "${playerName}"`);  // 🌟 ЛОГ
    if (playerName) {
      saveConnectionInfo(playerId, roomId, playerName);
      console.log(`💾 [Network] Данные комнаты сохранены в localStorage`);  // 🌟 ЛОГ
    } else {
      console.warn(`⚠️ [Network] Имя не найдено — данные НЕ сохранены`);  // 🌟 ЛОГ
    }
  },
  _setLobbyPlayers: (players) => set({ networkLobbyPlayers: players }),
  _setRoomSettings: (settings) => set({ roomSettings: settings }),
  _setHost: (isHost) => set({ isHost }),
  _setRoomList: (rooms) => set({ roomList: rooms }),
  _saveConnectionInfo: (playerId, roomId) => {
    const playerName = loadPlayerName();  // 🌟 Используем импортированную функцию
    if (playerName) {
      saveConnectionInfo(playerId, roomId, playerName);
    }
  },
});
