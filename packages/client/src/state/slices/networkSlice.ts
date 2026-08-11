// packages/client/src/state/slices/networkSlice.ts
// 🌟 Состояние сетевого подключения и комнаты.
// НЕ содержит игровую логику — только сетевой слой.

import type { StateCreator } from 'zustand';
import type {
  RoomSettings,
  LobbyPlayer,
} from '@carcassonne/shared/protocol/events';
import { getSocket, destroySocket } from '@/network/socket';
import type { GameStore } from '../useGameStore';
import { registerStateSync, unregisterStateSync } from '@/network/stateSync';

export type LobbyScreen = 'modeSelect' | 'localLobby' | 'networkLobby';

export interface NetworkSlice {
  // === Состояние лобби ===
  lobbyScreen: LobbyScreen;
  setLobbyScreen: (screen: LobbyScreen) => void;

  // === Состояние подключения ===
  isConnected: boolean;
  isReconnecting: boolean;
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
  createRoom: (playerName: string, settings: RoomSettings) => void;
  joinRoom: (roomId: string, playerName: string) => void;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
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
}

export const createNetworkSlice: StateCreator<GameStore, [], [], NetworkSlice> = (set) => ({
  // === Начальное состояние ===
  lobbyScreen: 'modeSelect',
  isConnected: false,
  isReconnecting: false,
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

  createRoom: (playerName, settings) => {
    const socket = getSocket();
    console.log(`🏠 [Network] Создание комнаты: ${playerName}`, settings);
    socket.emit('lobby:create-room', { playerName, settings });
  },

  joinRoom: (roomId, playerName) => {
    const socket = getSocket();
    console.log(`🚪 [Network] Присоединение к комнате ${roomId}: ${playerName}`);
    socket.emit('lobby:join-room', { roomId, playerName });
  },

  leaveRoom: () => {
    const socket = getSocket();
    console.log(`👋 [Network] Выход из комнаты`);
    socket.emit('lobby:leave-room');
    set({
      roomId: null,
      playerId: null,
      roomSettings: null,
      networkLobbyPlayers: [],
      isHost: false,
    });
  },

  setReady: (ready) => {
    const socket = getSocket();
    console.log(`✅ [Network] Готовность: ${ready}`);
    socket.emit('lobby:set-ready', ready);
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
  _setRoomInfo: (roomId, playerId) => set({ roomId, playerId }),
  _setLobbyPlayers: (players) => set({ networkLobbyPlayers: players }),
  _setRoomSettings: (settings) => set({ roomSettings: settings }),
  _setHost: (isHost) => set({ isHost }),
});