// packages/shared/src/protocol/events.ts
// 🌟 Определения всех сетевых событий Client ↔ Server
// Единый источник истины для обоих сторон

import type { Player, Tile } from '../core/types';
import type { SerializedGameState } from '../core/serialization';
import type { CompletedRegion } from '../core/scoring'

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
  isDisconnected?: boolean;
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
    preferredColor?: string;
  }) => void;

  'lobby:join-room': (data: {
    roomId: string;
    playerName: string;
    preferredColor?: string;
  }) => void;

  'lobby:reconnect': (data: {
    playerId: string;
    roomId: string;
  }) => void;

  'lobby:leave-room': () => void;
  'lobby:set-ready': (ready: boolean) => void;
  'lobby:start-game': () => void;  // Только хост

  // --- Игра ---
  'game:commit-move': (data: {
    tile: {
      x: number;
      y: number;
      rotation: 0 | 90 | 180 | 270;
    };
    meeple: {
      featureId: string;
      x: number;
      y: number;
    } | null;  // null = пропуск мипла
  }) => void;

  // --- Reconnection ---
  'reconnect': (data: {
    roomId: string;
    playerId: string;
  }) => void;

  // --- Чат (последняя очередь) ---
  'chat:message': (text: string) => void;

  'session:check-active': (data: {
    playerId: string;
}) => void;

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

  'lobby:reconnect-success': (data: {
    roomId: string;
    playerId: string;
    players: LobbyPlayer[];
    settings: RoomSettings;
    isHost: boolean;
    gameState?: SerializedGameState;  // Если игра уже началась
  }) => void;

  'lobby:reconnect-failed': (data: {
    reason: string;
  }) => void;

  'lobby:player-joined': (player: LobbyPlayer) => void;
  'lobby:player-left': (data: { playerId: string; newHostId?: string }) => void;
  'lobby:player-ready': (data: { playerId: string; isReady: boolean }) => void;
  'lobby:settings-changed': (settings: RoomSettings) => void;
  'lobby:room-list': (rooms: RoomInfo[]) => void;

  'lobby:player-disconnected': (data: { playerId: string }) => void;
  'lobby:player-reconnected': (data: { playerId: string }) => void;

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

  'game:move-committed': (data: {
    playerId: string;
    tile: { x: number; y: number; rotation: number; tileId: string };
    meeple: { featureId: string; x: number; y: number } | null;
  }) => void;

  'game:regions-completed': (data: {
    regions: Array<{
      rootKey: string;
      type: string;
      points: number;
      winners: string[];
      allMeepleOwners: string[];
      featureKeys: string[];
    }>;
  }) => void;

  'game:next-turn': (data: {
    nextPlayerId: string;
    turnIndex: number;
  }) => void;

  'game:final-scoring': (data: {
    regions: CompletedRegion[];
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

  'session:active-games': (data: {
    game: {
      roomId: string;
      playerName: string;
      playerColor: string;
      isHost: boolean;
      gameStarted: boolean;
      playerCount: number;
    } | null;
  }) => void;
}