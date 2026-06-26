import { create } from 'zustand';
import { createGameSlice, type GameSlice } from './slices/gameSlice';
import { createClientSlice, type ClientSlice } from './slices/clientSlice';

// 🌟 Объединённый тип = пересечение слайсов
export type GameStore = GameSlice & ClientSlice;

// 🌟 Создаём store из слайсов
export const useGameStore = create<GameStore>()((...a) => ({
  ...createGameSlice(...a),
  ...createClientSlice(...a),
}));