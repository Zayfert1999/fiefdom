// renderer/BoardBackground.tsx
import { memo } from 'react';
import { TILE_SIZE, WORLD_BOUNDS } from '@fiefdom/shared/core/constants';

/**
 * 🌍 Статический фон доски: сетка + осевые линии + граница мира.
 * Полностью статический — не зависит от store, рендерится один раз.
 */
export const BoardBackground = memo(() => {
  const worldX = WORLD_BOUNDS.minX * TILE_SIZE;
  const worldY = WORLD_BOUNDS.minY * TILE_SIZE;
  const worldWidth = (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 1) * TILE_SIZE;
  const worldHeight = (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY + 1) * TILE_SIZE;

  return (
    <g pointerEvents="none">
      {/* Фон с сеткой */}
      <rect
        x={worldX}
        y={worldY}
        width={worldWidth}
        height={worldHeight}
        fill="url(#grid)"
        stroke="#ff0000"
        strokeWidth="4"
        strokeDasharray="20 10"
        strokeOpacity="0.3"
      />

      {/* Осевые линии */}
      <line
        x1={worldX}
        y1="0"
        x2={worldX + worldWidth}
        y2="0"
        className="axis-line"
      />
      <line
        x1="0"
        y1={worldY}
        x2="0"
        y2={worldY + worldHeight}
        className="axis-line"
      />
    </g>
  );
});

BoardBackground.displayName = 'BoardBackground';