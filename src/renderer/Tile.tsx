// renderer/Tile.tsx
import { memo, useEffect, useRef } from 'react';
import { TileRegistry, type TileId } from '@/assets/svg/tiles/registry';
import { Meeple } from './Meeple';
import type { PlacedMeeple, FeatureType } from '@/core/types';

export interface FeatureHighlight {
  featureId: string;
  color: string;
  isContested: boolean;
}

export const Tile = memo(({
  id,
  size = 100,
  meeple,
  meepleFeatureType, // 🌟 Тип фичи, на которой стоит мипл
  rotation = 0,      // 🌟 Поворот тайла
  featureHighlights = []
}: {
  id: TileId;
  size?: number;
  meeple?: PlacedMeeple;
  meepleFeatureType?: FeatureType; // 🌟 Новый проп
  rotation?: 0 | 90 | 180 | 270;   // 🌟 Новый проп
  featureHighlights?: FeatureHighlight[];
}) => {
  const Component = TileRegistry[id];
  const containerRef = useRef<SVGGElement>(null);

  if (!Component) {
    console.warn(`⚠️ [Tile] Компонент для id "${id}" не найден в реестре`);
    return null;
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll('.highlight').forEach(el => {
      el.classList.remove('active', 'contested');
    });

    for (const highlight of featureHighlights) {
      const targets = container.querySelectorAll(`.highlight[data-feature="${highlight.featureId}"]`);
      targets.forEach(el => {
        if (highlight.isContested) {
          el.classList.add('contested');
        } else {
          el.classList.add('active');
        }
        (el as SVGElement).style.setProperty('--player-color', highlight.color);
      });
    }
  }, [featureHighlights]);

  // 🌟 Вычисляем поворот мипла
  const getMeepleRotation = (): number => {
    if (!meeple) return 0;
    
    let compensation = -rotation;
    if (meepleFeatureType === 'field') {
      compensation += 90;
    }
    return compensation;
  };

  return (
    <g ref={containerRef} style={{ overflow: 'visible' }}>
      <Component
        width={size}
        height={size}
        style={{ display: 'block', overflow: 'hidden' }}
        preserveAspectRatio="xMidYMid meet"
      />

      {meeple && (
        <g transform={`translate(${meeple.x}, ${meeple.y})`}>
          {/* 🌟 Анимация завершения применяется ТОЛЬКО к миплу */}
          <g className={meeple.isCompleting ? 'meeple-completing' : ''} style={{ overflow: 'visible' }}>
            <g transform={`rotate(${getMeepleRotation()}, 0, 0)`}>
              <g transform="translate(-15, -15)">
                <Meeple color={meeple.color} size={30} />
              </g>
            </g>
          </g>

          {/* 🌟 Текст "+N" анимируется НЕЗАВИСИМО от мипла */}
          {meeple.isCompleting && meeple.points !== undefined && (
            <g className="points-popup" transform={`rotate(${-rotation}, 0, 0)`} style={{ overflow: 'visible' }}>
              <text
                x="0"
                y="-20"
                textAnchor="middle"
                dominantBaseline="middle"
                className="points-text"
              >
                +{meeple.points}
              </text>
            </g>
          )}
        </g>
      )}
    </g>
  );
});