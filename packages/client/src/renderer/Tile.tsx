// renderer/Tile.tsx
import { memo } from 'react';
import { TileRegistry, type TileId } from '@/assets/svg/tiles/registry';

export const Tile = memo(({
  id,
  size = 100,
}: {
  id: TileId;
  size?: number;
}) => {
  const Component = TileRegistry[id];

  if (!Component) {
    console.warn(`⚠️ [Tile] Компонент для id "${id}" не найден в реестре`);
    return null;
  }

  return (
    <g style={{ overflow: 'visible' }}>
      <Component
        width={size}
        height={size}
        style={{ display: 'block', overflow: 'hidden' }}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
});