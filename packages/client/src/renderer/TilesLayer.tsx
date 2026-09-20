// renderer/TilesLayer.tsx
import { memo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { TileItem } from './TileItem';

interface TilesLayerProps {
  onDebugClick: (x: number, y: number) => void;
}

/**
 * 🎨 Слой размещённых тайлов.
 * Подписан на стор напрямую — не зависит от пропсов из родителя.
 * Мемоизирован — перерендеривается только при изменении board или анимации.
 */

export const TilesLayer = memo(({ onDebugClick }: TilesLayerProps) => {
  const board = useGameStore(s => s.board);
  const placementAnimation = useGameStore(s => s.placementAnimation);

  return (
    <>
      {Array.from(board.values()).map((t) => {
        const isAnimatingTile = placementAnimation?.tile &&
          placementAnimation.tile.x === t.x &&
          placementAnimation.tile.y === t.y;

        return (
          <TileItem
            key={`${t.x},${t.y}`}
            placedTile={t}
            isAnimating={!!isAnimatingTile}
            onDebugClick={onDebugClick}
          />
        );
      })}
    </>
  );
});
TilesLayer.displayName = 'TilesLayer';