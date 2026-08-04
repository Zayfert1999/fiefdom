// renderer/MeepleLayer.tsx
import { useGameStore } from '@/state/useGameStore';
import { Meeple } from './Meeple';
import {TILE_SIZE} from '@carcassonne/shared/core/constants'

// 🌟 Простая функция затемнения цвета (прямо здесь, без отдельного файла)
const darken = (hex: string, amount = 0.4): string => {
  const c = hex.replace('#', '');
  const r = Math.max(0, Math.floor(parseInt(c.substring(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.floor(parseInt(c.substring(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.floor(parseInt(c.substring(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * 🌟 Отдельный слой для миплов.
 * Рендерится ПОВЕРХ подсветки регионов (RegionOverlay).
 */
export const MeepleLayer = () => {
  const board = useGameStore(s => s.board);
  const removePlacedMeeple = useGameStore(s => s.removePlacedMeeple);

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

        const strokeColor = t.meeple.isCompleting ? 'none' : darken(t.meeple.color);

        // 🌟 НОВОЕ: определяем, временный ли мипл
        const isTemporary = t.meeple.isTemporary === true;
        const meepleClassName = isTemporary 
          ? 'meeple-temporary' 
          : (t.meeple.isCompleting ? 'meeple-completing' : '');

        return (
            <g
                key={`${t.x},${t.y}`}
                transform={`translate(${t.x * TILE_SIZE}, ${t.y * TILE_SIZE}) rotate(${t.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`}
                style={{ overflow: 'visible' }}
            >
                {/* 🌟 Мипл с анимацией */}
                <g transform={`translate(${t.meeple.x}, ${t.meeple.y})`}>
                  {/* 🌟 ИСПРАВЛЕНО: объединили style в один объект */}
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

                {/* 🌟 Текст "+N" вынесен на уровень тайла — масштабируется независимо */}
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
};