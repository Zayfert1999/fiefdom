// renderer/CompletionOverlay.tsx
import { useRef, useMemo, useLayoutEffect } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { cloneFeatureGeometry, calculateBoundingBox } from '@/core/cloneFeatureGeometry';

export const CompletionOverlay = () => {
  const completionAnimations = useGameStore(s => s.completionAnimations);
  const board = useGameStore(s => s.board);
  const containerRef = useRef<SVGGElement>(null);

  // 🌟 Группируем фичи региона по тайлам
  const regionsGeometry = useMemo(() => {
    return completionAnimations.map(({ region, startTime }) => {
      const featuresByTile: Array<{
        tileX: number;
        tileY: number;
        rotation: number;
        featureId: string;
      }> = [];

      for (const featureKey of region.featureKeys) {
        const [tileCoord, featureId] = featureKey.split(':');
        const [xStr, yStr] = tileCoord.split(',');
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);

        const tile = board.get(`${x},${y}`);
        if (!tile) continue;

        featuresByTile.push({
          tileX: x,
          tileY: y,
          rotation: tile.rotation,
          featureId,
        });
      }

      return {
        rootKey: region.rootKey,
        type: region.type,
        startTime,
        features: featuresByTile,
      };
    });
  }, [completionAnimations, board]);

  // 🌟 Используем общую утилиту для клонирования
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    console.log(`🎨 [CompletionOverlay] Обновление обводки для ${regionsGeometry.length} регионов`);

    for (const { rootKey, features } of regionsGeometry) {
      const safeRootId = `completion-clip-${rootKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const clipPathEl = containerRef.current.querySelector(`#${safeRootId}`) as SVGClipPathElement | null;
      if (!clipPathEl) continue;

      // 🌟 Используем утилиту с настройками для обводки
      const { cloned, failed } = cloneFeatureGeometry(clipPathEl, features, {
        fill: 'none',
        stroke: '#FFD700',
        strokeWidth: 3,
      });

      console.log(`✅ [CompletionOverlay] Регион ${rootKey}: склонировано ${cloned}/${features.length} фич (failed: ${failed})`);
    }
  }, [regionsGeometry]);

  if (regionsGeometry.length === 0) return null;

    return (
    <g className="completion-overlay" pointerEvents="none" ref={containerRef}>
        {regionsGeometry.map(({ rootKey, features }) => {
        const safeRootId = `completion-clip-${rootKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const bbox = calculateBoundingBox(features);

        return (
            <g key={rootKey}>
            <clipPath id={safeRootId} clipPathUnits="userSpaceOnUse" />

            {/* 🌟 Используем CSS-классы вместо inline-стилей */}
            <g className="completion-highlight">
                <rect
                className="completion-rect"
                x={bbox.minX - 5}
                y={bbox.minY - 5}
                width={bbox.width + 10}
                height={bbox.height + 10}
                clipPath={`url(#${safeRootId})`}
                />
            </g>
            </g>
        );
        })}
    </g>
    );

};