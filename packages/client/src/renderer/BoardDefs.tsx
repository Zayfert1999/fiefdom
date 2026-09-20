// renderer/BoardDefs.tsx
import { memo } from 'react';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { useRegionPatterns } from '@/hooks/useRegionPatterns';

/**
 * 🎨 SVG-определения: сетка + глобальные паттерны штриховки регионов.
 * Мемоизирован — перерендеривается только при изменении цветовых комбинаций.
 */
export const BoardDefs = memo(() => {
  // 🌟 Сам читает комбинации из store через хук
  const uniqueColorCombinations = useRegionPatterns();

  return (
    <defs>
      {/* Паттерн сетки */}
      <pattern id="grid" width={TILE_SIZE} height={TILE_SIZE} patternUnits="userSpaceOnUse">
        <path
          d={`M ${TILE_SIZE} 0 L 0 0 0 ${TILE_SIZE}`}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth="1"
        />
      </pattern>

      {/* 🌟 Глобальные паттерны штриховки регионов */}
      {uniqueColorCombinations.map((combo) => {
        const colors = combo.includes('|') ? combo.split('|') : [combo];
        const segmentWidth = 5;
        const patternWidth = segmentWidth * 2 * colors.length;
        const patternId = `hatch-${combo.replace(/#/g, '').replace(/\|/g, '-')}`;
        const SPEED_PX_PER_SEC = 1;
        const duration = patternWidth / SPEED_PX_PER_SEC;

        return (
          <pattern
            key={patternId}
            id={patternId}
            patternUnits="userSpaceOnUse"
            width={patternWidth}
            height="10"
            patternTransform="rotate(45)"
          >
            {colors.map((color, idx) => (
              <rect
                key={idx}
                x={idx * segmentWidth * 2}
                y="0"
                width={segmentWidth}
                height="10"
                fill={color}
              />
            ))}
            <animate
              attributeName="x"
              from="0"
              to={patternWidth}
              dur={`${duration}s`}
              repeatCount="indefinite"
            />
          </pattern>
        );
      })}
    </defs>
  );
});

BoardDefs.displayName = 'BoardDefs';