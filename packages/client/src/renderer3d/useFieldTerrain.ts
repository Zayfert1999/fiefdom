// packages/client/src/renderer3d/useFieldTerrain.ts
// ============================================
// ⛰️ ХУК: РЕГИОНЫ ПОЛЕЙ ТЕКУЩЕЙ ДОСКИ
// ============================================
// Слой полей, подсветка регионов и миплы читают один и тот же результат:
// getBoardFieldTerrain кэширует его по identity доски.
// ============================================
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { getBoardFieldTerrain, type BoardFieldTerrain } from './fieldTerrain';

export function useFieldTerrain(): BoardFieldTerrain {
  const board = useGameStore((s) => s.board);
  // Падающий тайл в регионы не входит (рисуется отдельно), см. PlacedTileAnimation3D
  const skipTileKey = useGameStore((s) => {
    const tile = s.placementAnimation?.tile;
    return tile ? `${tile.x},${tile.y}` : null;
  });

  return useMemo(() => getBoardFieldTerrain(board, skipTileKey), [board, skipTileKey]);
}
