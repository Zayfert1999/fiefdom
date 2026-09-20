// renderer/LastPlacedTilesLayer.tsx
import { memo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';

/**
 * 🎨 Слой подсветки последних тайлов игроков.
 * Подписан на стор напрямую — не зависит от пропсов из родителя.
 */

export const LastPlacedTilesLayer = memo(() => {
    const lastPlacedTiles = useGameStore(s => s.lastPlacedTiles);
  return (
    <>
      {Array.from(lastPlacedTiles.entries()).map(([playerId, tile]) => (
        <g
          key={`last-${playerId}`}
          className="last-placed-tile"
          transform={`translate(${tile.x * TILE_SIZE}, ${tile.y * TILE_SIZE})`}
          pointerEvents="none"
        >
          <rect
            className="last-placed-tile-glow"
            x={4}
            y={4}
            width={TILE_SIZE - 8}
            height={TILE_SIZE - 8}
            style={{ stroke: tile.color }}
          />
          <rect
            className="last-placed-tile-border"
            x={1.5}
            y={1.5}
            width={TILE_SIZE - 3}
            height={TILE_SIZE - 3}
            style={{ stroke: tile.color }}
          />
        </g>
      ))}
    </>
  );
});
LastPlacedTilesLayer.displayName = 'LastPlacedTilesLayer';