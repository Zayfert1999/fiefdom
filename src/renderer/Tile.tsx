// renderer/Tile.tsx
import { memo, useEffect, useRef } from 'react';
import { TileRegistry, type TileId } from '@/assets/svg/tiles/registry';
import { Meeple } from './Meeple';
import type { PlacedMeeple } from '@/core/types';

// 🌟 Структура данных для подсветки одной конкретной фичи
export interface FeatureHighlight {
  featureId: string;
  color: string;
  isContested: boolean; // true если в регионе >1 владельца
}

export const Tile = memo(({
  id,
  size = 100,
  meeple,
  featureHighlights = [] // 🌟 Массив подсветок для каждой фичи
}: {
  id: TileId;
  size?: number;
  meeple?: PlacedMeeple;
  featureHighlights?: FeatureHighlight[];
}) => {
  const Component = TileRegistry[id];
  const containerRef = useRef<SVGGElement>(null);

  if (!Component) {
    console.warn(`⚠️ [Tile] Компонент для id "${id}" не найден в реестре`);
    return null;
  }

  // 🌟 Применяем CSS-классы к подсветкам через DOM API
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Сбрасываем все существующие подсветки
    container.querySelectorAll('.highlight').forEach(el => {
      el.classList.remove('active', 'contested');
    });

    // 2. Применяем классы к каждой активной фиче
    for (const highlight of featureHighlights) {
      const targets = container.querySelectorAll(`.highlight[data-feature="${highlight.featureId}"]`);
      targets.forEach(el => {
        if (highlight.isContested) {
          el.classList.add('contested');
        } else {
          el.classList.add('active');
        }
        // 🌟 Устанавливаем CSS-переменную для цвета
        (el as SVGElement).style.setProperty('--player-color', highlight.color);
      });
    }
  }, [featureHighlights]);

  return (
    <g ref={containerRef}>
      {/* Базовая графика тайла */}
      <Component
        width={size}
        height={size}
        style={{ display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Мипл */}
      {meeple && (
        <g transform={`translate(${meeple.x}, ${meeple.y})`}>
          <g transform="translate(-15, -15)">
            <Meeple color={meeple.color} size={30} />
          </g>
        </g>
      )}
    </g>
  );
});