// renderer/TileItem.tsx
import { memo } from 'react';
import type { PlacedTile } from '@fiefdom/shared/core/types';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { Tile } from './Tile';

interface TileItemProps {
  placedTile: PlacedTile;
  isAnimating: boolean;
  onDebugClick: (x: number, y: number) => void;
}

/**
 * 🌟 Обёртка одного тайла на доске.
 * Пересоздаётся ТОЛЬКО если изменился сам тайл или флаг анимации.
 * Ссылка на onDebugClick стабильна (передаётся через useCallback).
 */
export const TileItem = memo(({ placedTile, isAnimating, onDebugClick }: TileItemProps) => {
  const t = placedTile;

  return (
    <g
      transform={`translate(${t.x * TILE_SIZE}, ${t.y * TILE_SIZE})`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) onDebugClick(t.x, t.y);
      }}
      style={{ cursor: 'pointer', overflow: 'visible' }}
    >
      <g className={isAnimating ? 'tile-placement-animation' : ''}>
        <g transform={`rotate(${t.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`} style={{ overflow: 'visible' }}>
          <Tile
            id={t.templateId as any}
            size={TILE_SIZE}
            features={t.features}
            rotation={t.rotation}
          />
        </g>
      </g>
    </g>
  );
});
TileItem.displayName = 'TileItem';