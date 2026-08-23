// renderer/DebugOverlay.tsx
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { TILE_SIZE } from '@carcassonne/shared/core/constants';

export const DebugOverlay = () => {
  const debugSelectedTile = useGameStore(s => s.debugSelectedTile);

  const selection = useMemo(() => {
    if (!debugSelectedTile) return null;
    return {
      x: debugSelectedTile.x * TILE_SIZE,
      y: debugSelectedTile.y * TILE_SIZE,
    };
  }, [debugSelectedTile]);

  if (!selection) return null;

  return (
    <g className="debug-overlay" pointerEvents="none">
      <rect
        className="debug-selected"
        x={selection.x}
        y={selection.y}
        width={TILE_SIZE}
        height={TILE_SIZE}
      />
    </g>
  );
};