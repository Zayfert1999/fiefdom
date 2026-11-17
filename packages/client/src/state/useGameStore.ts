import { create } from 'zustand';
import { createGameSlice, type GameSlice } from './slices/gameSlice';
import { createClientSlice, type ClientSlice } from './slices/clientSlice';
import { createNetworkSlice, type NetworkSlice } from './slices/networkSlice'; 
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createLobbySlice, type LobbySlice } from './slices/lobbySlice';
import { createPresentationSlice, type PresentationSlice } from './slices/presentationSlice';

// 🌟 Объединённый тип = пересечение слайсов
export type GameStore = GameSlice & ClientSlice & NetworkSlice & UISlice & LobbySlice & PresentationSlice;

// 🌟 Создаём store из слайсов
export const useGameStore = create<GameStore>()((...a) => ({
  ...createGameSlice(...a),
  ...createClientSlice(...a),
  ...createNetworkSlice(...a),
  ...createUISlice(...a),
  ...createLobbySlice(...a),
  ...createPresentationSlice(...a),
}));