// renderer/TilesLayer.tsx
import { memo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { TileItem } from './TileItem';

interface TilesLayerProps {
  onDebugClick: (x: number, y: number) => void;
}

/**
 * 🎨 Слой размещённых тайлов.
 * Подписан ТОЛЬКО на board — анимация обрабатывается внутри каждого TileItem.
 * Это значит, что при анимации одного тайла перерендеривается
 * только один TileItem, а не весь слой.
 */
export const TilesLayer = memo(({ onDebugClick }: TilesLayerProps) => {
  const board = useGameStore(s => s.board);

  console.log(`🗺️ [TilesLayer] Рендер слоя: ${board.size} тайлов`);

  return (
    <>
      {Array.from(board.values()).map((t) => (
        <TileItem
          key={`${t.x},${t.y}`}
          placedTile={t}
          onDebugClick={onDebugClick}
        />
      ))}
    </>
  );
});

TilesLayer.displayName = 'TilesLayer';