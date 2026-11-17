// renderer/MeepleLayer.tsx
import { memo, useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Meeple } from './Meeple';
import { TILE_SIZE } from '@fiefdom/shared/core/constants'
import { darkenColor } from '@/utils/color';

/**
 * 🔶 Слой размещённых миплов поверх всех регионов.
 * Мемоизирован — перерендеривается при изменении board/placementAnimation/ghostMeeples.
 *
 * Рисует два источника:
 *  • миплы с доски (board) — живые;
 *  • «призрачные» миплы (ghostMeeples) — уже снятые с доски в состоянии, но ещё
 *    показываемые анимацией завершения региона. Ждущие стоят на месте, активные
 *    исчезают с «+N». Анимация целиком живёт здесь и не зависит от того, что
 *    сейчас лежит на доске.
 */

interface MeepleItem {
  key: string;
  tileX: number;
  tileY: number;
  rotation: number;
  featureType: string | undefined;
  x: number;
  y: number;
  color: string;
  isTemporary: boolean;
  isCompleting: boolean;
  isPlacementAnimating: boolean;
  points?: number;
  /** Мипл с доски можно кликнуть (временный) */
  clickable: boolean;
}

export const MeepleLayer = memo(() => {
  const board = useGameStore(s => s.board);
  const ghostMeeples = useGameStore(s => s.ghostMeeples);
  const removePlacedMeeple = useGameStore(s => s.removePlacedMeeple);
  const placementAnimation = useGameStore(s => s.placementAnimation);

  const items = useMemo<MeepleItem[]>(() => {
    const result: MeepleItem[] = [];

    // Мипл с доски не рисуем, если тот же мипл уже показывает призрак
    // (между событием и state-update он мог ещё лежать на доске)
    const ghostKeys = new Set(ghostMeeples.map(g => `${g.tileKey}:${g.featureId}`));

    for (const t of board.values()) {
      if (!t.meeple) continue;
      if (ghostKeys.has(`${t.x},${t.y}:${t.meeple.featureId}`)) continue;

      const meepleFeature = t.features.find(f => f.id === t.meeple!.featureId);

      result.push({
        key: `${t.x},${t.y}`,
        tileX: t.x,
        tileY: t.y,
        rotation: t.rotation,
        featureType: meepleFeature?.type,
        x: t.meeple.x,
        y: t.meeple.y,
        color: t.meeple.color,
        isTemporary: t.meeple.isTemporary === true,
        isCompleting: false,
        isPlacementAnimating: !!(
          placementAnimation?.meeple &&
          placementAnimation.tile?.x === t.x &&
          placementAnimation.tile?.y === t.y &&
          placementAnimation.meeple.featureId === t.meeple.featureId
        ),
        clickable: t.meeple.isTemporary === true,
      });
    }

    for (const g of ghostMeeples) {
      const [tx, ty] = g.tileKey.split(',').map(Number);
      result.push({
        key: `ghost|${g.id}`,
        tileX: tx,
        tileY: ty,
        rotation: g.rotation,
        featureType: g.featureType,
        x: g.x,
        y: g.y,
        color: g.color,
        isTemporary: false,
        isCompleting: g.status === 'active',
        isPlacementAnimating: false,
        points: g.status === 'active' ? g.points : undefined,
        clickable: false,
      });
    }

    return result;
  }, [board, ghostMeeples, placementAnimation]);

  return (
    <g className="meeple-layer" style={{ overflow: 'visible' }}>
      {items.map((m) => {
        // Компенсация поворота тайла (поля повёрнуты ещё на 90°)
        let compensation = -m.rotation;
        if (m.featureType === 'field') {
          compensation += 90;
        }

        const strokeColor = m.isCompleting ? 'none' : darkenColor(m.color, 0.4);

        // Приоритет классов анимации
        // Временный > Завершающийся > Установка > Idle
        const meepleClassName = m.isTemporary
          ? 'meeple-temporary'
          : m.isCompleting
            ? 'meeple-completing'
            : m.isPlacementAnimating
              ? 'meeple-placement-animation'
              : 'meeple-idle-anim';

        return (
          <g
            key={m.key}
            transform={`translate(${m.tileX * TILE_SIZE}, ${m.tileY * TILE_SIZE}) rotate(${m.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`}
            style={{ overflow: 'visible' }}
          >
            {/* 🌟 Мипл с анимацией */}
            <g transform={`translate(${m.x}, ${m.y})`}>
              <g
                className={meepleClassName}
                onClick={m.clickable ? (e) => {
                  e.stopPropagation();
                  console.log(`🖱️ [MeepleLayer] Клик по временному миплу на (${m.tileX}, ${m.tileY})`);
                  removePlacedMeeple();
                } : undefined}
                style={{
                  overflow: 'visible',
                  cursor: m.clickable ? 'pointer' : 'default'
                } as React.CSSProperties}
              >
                <g transform={`rotate(${compensation}, 0, 0)`}>
                  <g transform="translate(-16, -16)">
                    <Meeple
                      color={m.color}
                      stroke={strokeColor}
                    />
                  </g>
                </g>
              </g>
            </g>

            {/* 🌟 Текст "+N" для анимации получения очков */}
            {m.isCompleting && m.points !== undefined && (
              <g
                className="points-popup"
                transform={`translate(${m.x}, ${m.y}) rotate(${-m.rotation}, 0, 0)`}
                style={{ '--n-color': m.color, overflow: 'visible' } as React.CSSProperties}
              >
                <text
                  x="0"
                  y="-20"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="points-text"
                >
                  +{m.points}
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
