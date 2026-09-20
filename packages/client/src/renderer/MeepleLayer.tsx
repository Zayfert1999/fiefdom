// renderer/MeepleLayer.tsx
import { memo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Meeple } from './Meeple';
import { TILE_SIZE } from '@fiefdom/shared/core/constants'
import { darkenColor } from '@/utils/color';


/**
 * 🔶 Слой размещённых миплов поверх всех регионов.
 * Мемоизирован — перерендеривается при изменении board/placementAnimation.
 */

export const MeepleLayer = memo(() => {
  const board = useGameStore(s => s.board);
  const removePlacedMeeple = useGameStore(s => s.removePlacedMeeple);
  const placementAnimation = useGameStore(s => s.placementAnimation);

  return (
    <g className="meeple-layer" style={{ overflow: 'visible' }}>
      {Array.from(board.values()).map((t) => {
        if (!t.meeple) return null;

        // Определяем тип фичи для компенсации поворота
        const meepleFeature = t.features.find(f => f.id === t.meeple!.featureId);
        const meepleFeatureType = meepleFeature?.type;

        // Вычисляем компенсацию поворота
        let compensation = -t.rotation;
        if (meepleFeatureType === 'field') {
          compensation += 90;
        }

        const strokeColor = t.meeple.isCompleting ? 'none' : darkenColor(t.meeple.color, 0.4)

        // Определяем, временный ли мипл
        const isTemporary = t.meeple.isTemporary === true;

        // Проверяем, анимируется ли этот мипл (установка)
        const isAnimatingMeeple = placementAnimation?.meeple &&
          t.meeple &&
          placementAnimation.tile?.x === t.x &&
          placementAnimation.tile?.y === t.y &&
          placementAnimation.meeple.featureId === t.meeple.featureId;

        // Приоритет классов анимации
        // Временный > Завершающийся > Установка > Idle
        const meepleClassName = isTemporary
          ? 'meeple-temporary'
          : t.meeple.isCompleting
            ? 'meeple-completing'
            : isAnimatingMeeple
              ? 'meeple-placement-animation'
              : 'meeple-idle-anim';

        return (
          <g
            key={`${t.x},${t.y}`}
            transform={`translate(${t.x * TILE_SIZE}, ${t.y * TILE_SIZE}) rotate(${t.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`}
            style={{ overflow: 'visible' }}
          >
            {/* 🌟 Мипл с анимацией */}
            <g transform={`translate(${t.meeple.x}, ${t.meeple.y})`}>
              <g
                className={meepleClassName}
                onClick={isTemporary ? (e) => {
                  e.stopPropagation();
                  console.log(`🖱️ [MeepleLayer] Клик по временному миплу на (${t.x}, ${t.y})`);
                  removePlacedMeeple();
                } : undefined}
                style={{
                  overflow: 'visible',
                  cursor: isTemporary ? 'pointer' : 'default'
                } as React.CSSProperties}
              >
                <g transform={`rotate(${compensation}, 0, 0)`}>
                  <g transform="translate(-16, -16)">
                    <Meeple
                      color={t.meeple.color}
                      stroke={strokeColor}
                    />
                  </g>
                </g>
              </g>
            </g>

            {/* 🌟 Текст "+N" для анимации получения очков */}
            {t.meeple.isCompleting && t.meeple.points !== undefined && (
              <g
                className="points-popup"
                transform={`translate(${t.meeple.x}, ${t.meeple.y}) rotate(${-t.rotation}, 0, 0)`}
                style={{ '--n-color': t.meeple.color, overflow: 'visible' } as React.CSSProperties}
              >
                <text
                  x="0"
                  y="-20"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="points-text"
                >
                  +{t.meeple.points}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
});

MeepleLayer.displayName = 'MeepleLayer';