// packages/client/src/renderer3d/useCityWalls.ts
// ============================================
// 🏰 ХУК: СТЕНЫ ЗАВЕРШЁННЫХ ГОРОДОВ ТЕКУЩЕЙ ДОСКИ
// ============================================
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { getBoardCityWalls, type BoardCityWall } from './cityWalls';

export function useCityWalls(): readonly BoardCityWall[] {
  const board = useGameStore((s) => s.board);
  const regionManager = useGameStore((s) => s.regionManager);
  return useMemo(() => getBoardCityWalls(board, regionManager), [board, regionManager]);
}
