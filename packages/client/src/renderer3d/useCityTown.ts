// packages/client/src/renderer3d/useCityTown.ts
// ============================================
// 🏘 ХУК: ЗАСТРОЙКА ЗАВЕРШЁННЫХ ГОРОДОВ ТЕКУЩЕЙ ДОСКИ
// ============================================
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { getBoardCityTowns, type BoardCityTown } from './cityTown';

export function useCityTown(): readonly BoardCityTown[] {
  const board = useGameStore((s) => s.board);
  const regionManager = useGameStore((s) => s.regionManager);
  return useMemo(() => getBoardCityTowns(board, regionManager), [board, regionManager]);
}
