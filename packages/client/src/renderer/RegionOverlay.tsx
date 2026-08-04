// renderer/RegionOverlay.tsx
import { useMemo, useEffect, useRef } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { cloneFeatureGeometry, calculateBoundingBox} from '@/core/cloneFeatureGeometry';
import { rotateFeatures } from '@/core/tileUtils';
import type { RegionManager } from '@/core/regionManager';

interface RegionOverlayProps {
  // 🌟 НОВОЕ: опциональный override для RegionManager (используется при примерке)
  regionManagerOverride?: RegionManager;
}

export const RegionOverlay = ({ regionManagerOverride }: RegionOverlayProps) => {
  const board = useGameStore(s => s.board);
  const storeRegionManager = useGameStore(s => s.regionManager);
  const players = useGameStore(s => s.players);
  const showRegions = useGameStore(s => s.showRegions);
  const visibleFeatureTypes = useGameStore(s => s.visibleFeatureTypes);
  const containerRef = useRef<SVGGElement>(null);
  const previewTile = useGameStore(s => s.previewTile);
  const regionManager = regionManagerOverride || storeRegionManager;

  const regions = useMemo(() => {
    const regionMap = new Map<string, {
      featureKey: string;
      tileX: number;
      tileY: number;
      rotation: number;
      featureId: string;
    }[]>();

    // 🌟 ШАГ 1: Обычные тайлы из board
    for (const tile of board.values()) {
      for (const feature of tile.features) {
        if (!visibleFeatureTypes.includes(feature.type)) continue;

        const featureKey = `${tile.x},${tile.y}:${feature.id}`;
        const owners = regionManager.getFeatureOwners(featureKey);

        if (owners.length > 0) {
          const root = regionManager.find(featureKey);
          if (root) {
            if (!regionMap.has(root)) regionMap.set(root, []);
            regionMap.get(root)!.push({
              featureKey,
              tileX: tile.x,
              tileY: tile.y,
              rotation: tile.rotation,
              featureId: feature.id
            });
          }
        }
      }
    }

    // 🌟 ШАГ 2: Preview-тайл (если есть)
    if (previewTile) {
      // 🌟 Поворачиваем фичи preview-тайла
      const rotatedFeatures = rotateFeatures(previewTile.tile.features, previewTile.rotation);
      
      for (const feature of rotatedFeatures) {
        if (!visibleFeatureTypes.includes(feature.type)) continue;
        
        const featureKey = `${previewTile.x},${previewTile.y}:${feature.id}`;
        const owners = regionManager.getFeatureOwners(featureKey);
        
        // 🌟 Если у фичи есть владельцы (через union с существующим регионом) — добавляем
        if (owners.length > 0) {
          const root = regionManager.find(featureKey);
          if (root) {
            if (!regionMap.has(root)) regionMap.set(root, []);
            regionMap.get(root)!.push({
              featureKey,
              tileX: previewTile.x,
              tileY: previewTile.y,
              rotation: previewTile.rotation,
              featureId: feature.id
            });
          }
        }
      }
    }

    return Array.from(regionMap.entries());
  }, [board, regionManager, players, visibleFeatureTypes, previewTile]);

  const getPatternId = (featureKey: string): string => {
    const owners = regionManager.getFeatureOwners(featureKey);
    if (owners.length === 0) return '';

    const meta = regionManager.getMetadata(featureKey);
    if (!meta) return '';

    const maxCount = Math.max(...owners.map(id => meta.meepleCounts.get(id) || 0));
    const dominantOwners = owners.filter(id => (meta.meepleCounts.get(id) || 0) === maxCount);

    let combo = '';
    if (dominantOwners.length === 1) {
      const player = players.find(p => p.id === dominantOwners[0]);
      combo = player?.color || '#ffffff';
    } else {
      combo = dominantOwners
        .map(id => players.find(p => p.id === id)?.color || '#ffffff')
        .sort()
        .join('|');
    }

    return `hatch-${combo.replace(/#/g, '').replace(/\|/g, '-')}`;
  };

  // 🌟 Используем общую утилиту для клонирования
  useEffect(() => {
    if (!containerRef.current || regions.length === 0) return;

    console.log(`🗺️ [RegionOverlay] Клонирование геометрии для ${regions.length} регионов`);

    for (const [rootKey, features] of regions) {
      const safeRootId = `clip-${rootKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const clipPathEl = containerRef.current.querySelector(`#${safeRootId}`) as SVGClipPathElement | null;
      if (!clipPathEl) continue;

      cloneFeatureGeometry(clipPathEl, features);
    }

    console.log(`✅ [RegionOverlay] Клонирование завершено`);
  }, [regions]);

  return (
    <g
      className={`region-overlay ${showRegions && regions.length > 0 ? 'active' : ''}`}
      pointerEvents="none"
      ref={containerRef}
    >
      {regions.map(([rootKey, features]) => {
        const patternId = getPatternId(features[0].featureKey);
        const safeRootId = `clip-${rootKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const bbox = calculateBoundingBox(features);

        return (
          <g key={rootKey}>
            <clipPath id={safeRootId} clipPathUnits="userSpaceOnUse" />
            <rect
              className="region-fill"
              x={bbox.minX - 10}
              y={bbox.minY - 10}
              width={bbox.width + 20}
              height={bbox.height + 20}
              fill={`url(#${patternId})`}
              clipPath={`url(#${safeRootId})`}
            />
          </g>
        );
      })}
    </g>
  );
};