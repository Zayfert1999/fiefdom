// renderer/DebugOverlay.tsx
import { memo, useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';

/**
 * 🐛 Дебаг-выделение выбранного тайла (Ctrl+клик).
 * Мемоизирован — перерендеривается только при изменении debugSelectedTile.
 */

export const DebugOverlay = memo(() => {
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
});

DebugOverlay.displayName = 'DebugOverlay';