// renderer/RegionOverlay.tsx
import { useMemo, useEffect, useRef } from 'react';
import { useGameStore } from '@/state/useGameStore';

const TILE_SIZE = 100;

export const RegionOverlay = () => {
  const board = useGameStore(s => s.board);
  const regionManager = useGameStore(s => s.regionManager);
  const players = useGameStore(s => s.players);
  const showRegions = useGameStore(s => s.showRegions);
  const containerRef = useRef<SVGGElement>(null);

  // 🌟 ИСПРАВЛЕНО: ВСЕГДА вычисляем регионы, даже если showRegions = false
  // Это нужно, чтобы rect'ы оставались в DOM для CSS-transition
  const regions = useMemo(() => {
    const regionMap = new Map<string, {
      featureKey: string;
      tileX: number;
      tileY: number;
      rotation: number;
      featureId: string;
    }[]>();

    for (const tile of board.values()) {
      for (const feature of tile.features) {
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

    return Array.from(regionMap.entries());
  }, [board, regionManager, players]); // ❌ УБРАН showRegions из зависимостей

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

  // 🌟 ИСПРАВЛЕНО: ВСЕГДА клонируем геометрию, даже если showRegions = false
  useEffect(() => {
    if (!containerRef.current || regions.length === 0) return;

    console.log(`🗺️ [RegionOverlay] Клонирование геометрии для ${regions.length} регионов`);

    for (const [rootKey, features] of regions) {
      const safeRootId = `clip-${rootKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const clipPathEl = containerRef.current.querySelector(`#${safeRootId}`);
      if (!clipPathEl) continue;

      clipPathEl.innerHTML = '';

      for (const { tileX, tileY, rotation, featureId } of features) {
        const tileSelector = `g[transform*="translate(${tileX * TILE_SIZE}, ${tileY * TILE_SIZE})"]`;
        const tileEl = document.querySelector(tileSelector);
        if (!tileEl) {
          console.warn(`⚠️ [RegionOverlay] Тайл не найден: (${tileX}, ${tileY})`);
          continue;
        }

        const featureEl = tileEl.querySelector(`[data-name="${featureId}"]`);
        if (!featureEl) {
          console.warn(`⚠️ [RegionOverlay] Элемент с data-name="${featureId}" не найден в тайле (${tileX}, ${tileY})`);
          continue;
        }

        const clone = featureEl.cloneNode(true) as SVGElement;

        const allowedAttrs = new Set([
          'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points',
          'x1', 'y1', 'x2', 'y2',
          'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'
        ]);

        const attrsToRemove: string[] = [];
        for (const attr of Array.from(clone.attributes)) {
          if (!allowedAttrs.has(attr.name)) {
            attrsToRemove.push(attr.name);
          }
        }
        for (const attr of attrsToRemove) {
          clone.removeAttribute(attr);
        }

        clone.setAttribute('fill', 'white');
        clone.removeAttribute('class');
        clone.removeAttribute('data-name');
        clone.removeAttribute('opacity');

        clone.setAttribute(
          'transform',
          `translate(${tileX * TILE_SIZE}, ${tileY * TILE_SIZE}) rotate(${rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`
        );

        clipPathEl.appendChild(clone);
      }
    }

    console.log(`✅ [RegionOverlay] Клонирование завершено`);
  }, [regions]); // ❌ УБРАН showRegions из зависимостей

  // 🌟 ИСПРАВЛЕНО: контейнер ВСЕГДА в DOM, даже если регионов нет
  // Видимость управляется ТОЛЬКО через CSS-класс active
  return (
    <g
      className={`region-overlay ${showRegions && regions.length > 0 ? 'active' : ''}`}
      pointerEvents="none"
      ref={containerRef}
    >
      {regions.map(([rootKey, features]) => {
        const patternId = getPatternId(features[0].featureKey);
        const safeRootId = `clip-${rootKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const { tileX, tileY } of features) {
          const x = tileX * TILE_SIZE;
          const y = tileY * TILE_SIZE;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x + TILE_SIZE > maxX) maxX = x + TILE_SIZE;
          if (y + TILE_SIZE > maxY) maxY = y + TILE_SIZE;
        }

        return (
          <g key={rootKey}>
            <clipPath id={safeRootId} clipPathUnits="userSpaceOnUse">
              {/* Геометрия добавляется через useEffect */}
            </clipPath>

            {/* 🌟 ИСПРАВЛЕНО: убран opacity="0.7" — теперь управляется через CSS */}
            <rect
              className="region-fill"
              x={minX - 10}
              y={minY - 10}
              width={maxX - minX + 20}
              height={maxY - minY + 20}
              fill={`url(#${patternId})`}
              clipPath={`url(#${safeRootId})`}
            />
          </g>
        );
      })}
    </g>
  );
};