// packages/client/src/state/slices/networkSlice.ts
// 🌟 Состояние сетевого подключения и комнаты.
// НЕ содержит игровую логику — только сетевой слой.

import type { StateCreator } from 'zustand';
import type {
  RoomSettings,
  LobbyPlayer,
} from '@fiefdom/shared/protocol/events';
import { getSocket, destroySocket } from '@/network/socket';
import type { GameStore } from '../useGameStore';
import { registerStateSync, unregisterStateSync } from '@/network/stateSync';
import {
  saveConnectionInfo,
  clearConnectionInfo,
  savePlayerName,
  loadPlayerName,
} from '@/network/persistence';



export type LobbyScreen = 'modeSelect' | 'localLobby' | 'networkLobby';

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
      lobbyScreen: 'modeSelect',
    });
  },

  // ============================================
  // 🏠 ЛОББИ
  // ============================================

  createRoom: (playerName, settings, preferredColor) => {
    const socket = getSocket();
    console.log(`🏠 [Network] Создание комнаты: ${playerName} (цвет: ${preferredColor})`, settings);
    savePlayerName(playerName);
    socket.emit('lobby:create-room', { playerName, settings, preferredColor });
  },

  joinRoom: (roomId, playerName, preferredColor) => {
    const socket = getSocket();
    console.log(`🚪 [Network] Присоединение к комнате ${roomId}: ${playerName} (цвет: ${preferredColor})`);
    savePlayerName(playerName);
    socket.emit('lobby:join-room', { roomId, playerName, preferredColor });
  },

  leaveRoom: () => {
    const socket = getSocket();
    console.log(`👋 [Network] Выход из комнаты`);
    socket.emit('lobby:leave-room');
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
    console.log(`✅ [Network] Готовность: ${ready}`);
    socket.emit('lobby:set-ready', ready);
  },

  kickPlayer: (playerId) => {
    const socket = getSocket();
    console.log(`👢 [Network] Кик игрока: ${playerId}`);
    socket.emit('lobby:kick-player', { playerId });
  },

  startNetworkGame: () => {
    const socket = getSocket();
    console.log(`🚀 [Network] Запрос старта игры`);
    socket.emit('lobby:start-game');
  },

  // ============================================
  // 🎮 ИГРОВЫЕ ДЕЙСТВИЯ (отправка на сервер)
  // ============================================

  sendCommitMove: (
    tile: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
    meeple: { featureId: string; x: number; y: number } | null
  ) => {
    const socket = getSocket();
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
  _saveConnectionInfo: (playerId, roomId) => {
    const playerName = loadPlayerName();  // 🌟 Используем импортированную функцию
    if (playerName) {
      saveConnectionInfo(playerId, roomId, playerName);
    }
  },
});