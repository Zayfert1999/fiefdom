// renderer/CompletionOverlay.tsx
import { useRef, useMemo, useLayoutEffect } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { cloneFeatureGeometry } from '@/core/cloneFeatureGeometry';

export const CompletionOverlay = () => {
  const completionAnimations = useGameStore(s => s.completionAnimations);
  const board = useGameStore(s => s.board);
  const containerRef = useRef<SVGGElement>(null);

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

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    console.log(`🎨 [CompletionOverlay] Обновление обводки для ${regionsGeometry.length} регионов`);

    for (const { rootKey, features } of regionsGeometry) {
      const safeRootId = `completion-region-${rootKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const regionEl = containerRef.current.querySelector(`#${safeRootId}`) as SVGGElement | null;
      if (!regionEl) continue;

      regionEl.innerHTML = '';

      // 🌟 Передаём ТОЛЬКО геометрию — без стилей
      const { cloned, failed } = cloneFeatureGeometry(regionEl, features);

      console.log(`✅ [CompletionOverlay] Регион ${rootKey}: склонировано ${cloned}/${features.length} фич (failed: ${failed})`);
    }
  }, [regionsGeometry]);

  if (regionsGeometry.length === 0) return null;

  return (
    <g className="completion-overlay" pointerEvents="none" ref={containerRef}>
      {regionsGeometry.map(({ rootKey }) => {
        const safeRootId = `completion-region-${rootKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

        return (
          <g key={rootKey}>
            {/* 🌟 Стили применяются через CSS на родителе */}
            <g
              id={safeRootId}
              className="completion-highlight"
              style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            />
          </g>
        );
      })}
    </g>
  );
};