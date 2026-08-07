// packages/shared/src/protocol/events.ts
// 🌟 Определения всех сетевых событий Client ↔ Server
// Единый источник истины для обоих сторон

import type { Player, Tile, PlacedTile } from '../core/types';
import type { SerializedGameState } from '../core/serialization';

// ============================================
// 📦 ТИПЫ ДАННЫХ
// ============================================

/** Настройки комнаты (задаются при создании) */
export interface RoomSettings {
  isPrivate: boolean;       // Приватная (по коду) или публичная
  turnTimerSeconds: number; // Таймер на ход (0 = без таймера)
  maxPlayers: number;       // Максимум игроков (2-5)
}

/** Информация об игроке в лобби */
export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
}

/** Информация о комнате для списка лобби */
export interface RoomInfo {
  id: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  isPlaying: boolean;
}

// ============================================
// 📤 CLIENT → SERVER (исходящие события)
// ============================================

export interface ClientToServerEvents {
  // --- Лобби ---
  'lobby:create-room': (data: {
    playerName: string;
    settings: RoomSettings;
  }) => void;
  
  'lobby:join-room': (data: {
    roomId: string;
    playerName: string;
  }) => void;
  
  'lobby:leave-room': () => void;
  'lobby:set-ready': (ready: boolean) => void;
  'lobby:start-game': () => void;  // Только хост
  
  // --- Игра ---
  'game:place-tile': (data: {
    x: number;
    y: number;
    rotation: 0 | 90 | 180 | 270;
  }) => void;
  
  'game:place-meeple': (data: {
    featureId: string;
    x: number;
    y: number;
  }) => void;
  
  'game:skip-meeple': () => void;
  
  // --- Reconnection ---
  'reconnect': (data: {
    roomId: string;
    playerId: string;
  }) => void;
  
  // --- Чат (последняя очередь) ---
  'chat:message': (text: string) => void;
}

// ============================================
// 📥 SERVER → CLIENT (входящие события)
// ============================================

export interface ServerToClientEvents {
  // --- Лобби ---
  'lobby:room-created': (data: {
    roomId: string;
    playerId: string;
  }) => void;
  
  'lobby:room-joined': (data: {
    roomId: string;
    playerId: string;
    players: LobbyPlayer[];
    settings: RoomSettings;
  }) => void;
  
  'lobby:player-joined': (player: LobbyPlayer) => void;
  'lobby:player-left': (data: { playerId: string; newHostId?: string }) => void;
  'lobby:player-ready': (data: { playerId: string; isReady: boolean }) => void;
  'lobby:settings-changed': (settings: RoomSettings) => void;
  'lobby:room-list': (rooms: RoomInfo[]) => void;
  
  // --- Игра ---
  'game:started': (data: {
    gameState: SerializedGameState;
    seed: string;
    yourPlayerId: string;
  }) => void;
  
  'game:state-update': (data: {
    gameState: SerializedGameState;
  }) => void;
  
  'game:your-turn': (data: {
    drawnTile: Tile;
  }) => void;
  
  'game:tile-placed': (data: {
    playerId: string;
    x: number;
    y: number;
    rotation: number;
    tileId: string;
  }) => void;
  
  'game:meeple-placed': (data: {
    playerId: string;
    featureId: string;
    x: number;
    y: number;
  }) => void;
  
  'game:meeple-skipped': (data: {
    playerId: string;
  }) => void;
  
  'game:region-completed': (data: {
    rootKey: string;
    type: string;
    points: number;
    winners: string[];
  }) => void;
  
  'game:turn-changed': (data: {
    nextPlayerId: string;
    turnIndex: number;
  }) => void;
  
  'game:over': (data: {
    finalScores: Player[];
  }) => void;
  
  'game:timer-update': (data: {
    remainingSeconds: number;
  }) => void;
  
  // --- Ошибки ---
  'error': (data: {
    code: string;
    message: string;
  }) => void;
  
  // --- Reconnection ---
  'reconnect:success': (data: {
    gameState: SerializedGameState;
    yourPlayerId: string;
    currentPhase: string;
  }) => void;
  
  // --- Чат (последняя очередь) ---
  'chat:message': (data: {
    playerId: string;
    playerName: string;
    text: string;
    timestamp: number;
  }) => void;
}