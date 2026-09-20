// renderer/TileItem.tsx
import { memo } from 'react';
import type { PlacedTile } from '@fiefdom/shared/core/types';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { Tile } from './Tile';
import { useGameStore } from '@/state/useGameStore';

interface TileItemProps {
  placedTile: PlacedTile;
  onDebugClick: (x: number, y: number) => void;
}

/**
 * 🌟 Обёртка одного тайла на доске.
 * Сам определяет, анимируется ли он, через примитивный селектор.
 *
 * КЛЮЧЕВОЙ МОМЕНТ ОПТИМИЗАЦИИ:
 * Селектор возвращает `boolean` (примитив), а не объект.
 * При изменении `placementAnimation` селектор пересчитается
 * для всех тайлов, но ПЕРЕРЕНДЕР произойдёт только у того,
 * чьё значение изменилось (с `false` на `true` или наоборот).
 */
export const TileItem = memo(({ placedTile, onDebugClick }: TileItemProps) => {
  const t = placedTile;

  // 🌟 Селектор возвращает примитив — перерендер только при изменении результата
  const isAnimating = useGameStore(s => {
    const anim = s.placementAnimation;
    // Сравниваем координаты — возвращаем boolean, не объект
    return anim?.tile?.x === t.x && anim?.tile?.y === t.y;
  });

  return (
    <g
      transform={`translate(${t.x * TILE_SIZE}, ${t.y * TILE_SIZE})`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) onDebugClick(t.x, t.y);
      }}
      style={{ cursor: 'pointer', overflow: 'visible' }}
    >
      {/* 🌟 Класс анимации применяется только к анимируемому тайлу */}
      <g className={isAnimating ? 'tile-placement-animation' : ''}>
        <g
          transform={`rotate(${t.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`}
          style={{ overflow: 'visible' }}
        >
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