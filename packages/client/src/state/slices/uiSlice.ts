// packages/client/src/state/slices/uiSlice.ts
// 🌟 Состояние UI: имя, цвет, активная игра, навигация.

import type { StateCreator } from 'zustand';
import type { GameStore } from '../useGameStore';
import { loadPlayerName, loadPlayerColor, savePlayerName, savePlayerColor } from '@/network/persistence';

const MAX_NAME_LENGTH = 20;
const DEFAULT_NAME = 'Игрок';

/**
 * Валидация имени: пустое или слишком длинное → "Игрок"
 */
function validatePlayerName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    return DEFAULT_NAME;
  }
  return trimmed;
}

export interface ActiveGame {
  roomId: string;
  playerName: string;
  playerColor: string;
  isHost: boolean;
  gameStarted: boolean;
  playerCount: number;
}

export interface UISlice {
  // === Имя и цвет игрока ===
  playerName: string;
  playerColor: string;
  setPlayerName: (name: string) => void;
  setPlayerColor: (color: string) => void;

  // === Активная игра (для кнопки "Продолжить") ===
  activeGame: ActiveGame | null;
  setActiveGame: (game: ActiveGame | null) => void;

  // === Ошибки reconnect ===
  reconnectError: string | null;
  setReconnectError: (error: string | null) => void;

  // === Ping ===
  serverPing: number | null;
  setServerPing: (ping: number | null) => void;

  // === Остаток таймера хода (для кольцевого индикатора) ===
  turnTimerRemaining: number | null;
  setTurnTimerRemaining: (remaining: number | null) => void;

  // === timestamp окончания хода ===
  turnDeadline: number | null;
  setTurnDeadline: (deadline: number | null) => void;

  // === timestamp начала игры ===
  gameStartTime: number | null;
  setGameStartTime: (time: number | null) => void;

  // === timestamp окончания игры ===
  gameEndTime: number | null;
  setGameEndTime: (time: number | null) => void;

  // === Настройки сессии  ===
  showRegions: boolean;
  showDeadCells: boolean;
  enabledDeckView: boolean;
  toggleRegions: () => void;
  toggleDeadCells: () => void;
  toggleDeckView: () => void;

}

export const createUISlice: StateCreator<GameStore, [], [], UISlice> = (set, get) => ({
  // Начальное состояние
  playerName: loadPlayerName() || DEFAULT_NAME,
  playerColor: loadPlayerColor(),
  activeGame: null,
  reconnectError: null,
  serverPing: null,
  turnTimerRemaining: null,
  turnDeadline: null,
  gameStartTime: null,
  gameEndTime: null,

  // 🌟 НОВОЕ: Настройки сессии
  showRegions: true,
  showDeadCells: true,
  enabledDeckView: true,

  setPlayerName: (name) => {
    const validated = validatePlayerName(name);
    savePlayerName(validated);
    set({ playerName: validated });
  },

  setPlayerColor: (color) => {
    savePlayerColor(color);
    set({ playerColor: color });
  },

  setActiveGame: (game) => {
    set({ activeGame: game });
  },

  setReconnectError: (error) => {
    set({ reconnectError: error });
  },

  setServerPing: (ping) => {
    set({ serverPing: ping });
  },

  setTurnTimerRemaining: (remaining) => {
    set({ turnTimerRemaining: remaining });
  },

  setTurnDeadline: (deadline) => {
    set({ turnDeadline: deadline });
  },

  setGameStartTime: (time) => {
    set({ gameStartTime: time });
  },

  setGameEndTime: (time) => {
    set({ gameEndTime: time });
  },

  toggleRegions: () => {
    set((state) => ({ showRegions: !state.showRegions }));
    console.log(`📦 [UISlice] Показ регионов: ${!get().showRegions ? 'ВКЛ' : 'ВЫКЛ'}`);
  },
  toggleDeadCells: () => {
    set((state) => ({ showDeadCells: !state.showDeadCells }));
    console.log(`💀 [UISlice] Показ мёртвых клеток: ${!get().showDeadCells ? 'ВКЛ' : 'ВЫКЛ'}`);
  },
  toggleDeckView: () => {
    set((state) => ({ enabledDeckView: !state.enabledDeckView }));
    console.log(`📦 [UISlice] Показ колоды: ${!get().enabledDeckView ? 'ВКЛ' : 'ВЫКЛ'}`);
  },
});