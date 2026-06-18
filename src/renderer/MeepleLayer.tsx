// renderer/MeepleLayer.tsx
import { useGameStore } from '@/state/useGameStore';
import { Meeple } from './Meeple';

const TILE_SIZE = 100;

/**
 * 🌟 Отдельный слой для миплов.
 * Рендерится ПОВЕРХ подсветки регионов (RegionOverlay).
 */
export const MeepleLayer = () => {
  const board = useGameStore(s => s.board);

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

        return (
            <g
                key={`${t.x},${t.y}`}
                transform={`translate(${t.x * TILE_SIZE}, ${t.y * TILE_SIZE}) rotate(${t.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`}
                style={{ overflow: 'visible' }}
            >
                {/* 🌟 Мипл с анимацией */}
                <g transform={`translate(${t.meeple.x}, ${t.meeple.y})`}>
                <g className={t.meeple.isCompleting ? 'meeple-completing' : ''} style={{ overflow: 'visible' }}>
                    <g transform={`rotate(${compensation}, 0, 0)`}>
                    <g transform="translate(-15, -15)">
                        <Meeple color={t.meeple.color} size={30} />
                    </g>
                    </g>
                </g>
                </g>

                {/* 🌟 Текст "+N" вынесен на уровень тайла — масштабируется независимо */}
                {t.meeple.isCompleting && t.meeple.points !== undefined && (
                <g 
                    className="points-popup" 
                    transform={`translate(${t.meeple.x}, ${t.meeple.y}) rotate(${-t.rotation}, 0, 0)`}
                    style={{ overflow: 'visible' }}
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
};