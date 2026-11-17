// packages/client/src/renderer3d/useRegionHighlights.ts
// ============================================
// 🎨 ХУК ПОДСВЕТКИ РЕГИОНОВ
// ============================================
// Читает нужные срезы стора и считает computeRegionHighlights.
// Слой подсветки и тайл-превью вызывают его независимо: результат мемоизирован.
// ============================================
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { computeRegionHighlights, type RegionHighlights } from './regionHighlights';
import { useFieldTerrain } from './useFieldTerrain';

/** Подсветка регионов для текущего состояния игры */
export function useRegionHighlights(): RegionHighlights {
  const board = useGameStore((s) => s.board);
  const storeRegionManager = useGameStore((s) => s.regionManager);
  const previewRegionManager = useGameStore((s) => s.previewRegionManager);
  const players = useGameStore((s) => s.players);
  const visibleFeatureTypes = useGameStore((s) => s.visibleFeatureTypes);
  const previewTile = useGameStore((s) => s.previewTile);
  // Примитив: слой перерисуется только при смене падающего тайла
  const skipTileKey = useGameStore((s) => {
    const tile = s.placementAnimation?.tile;
    return tile ? `${tile.x},${tile.y}` : null;
  });

  const regionManager = previewRegionManager ?? storeRegionManager;
  // Рельеф включён: поля подсвечиваются через общие меши регионов
  const terrain = useFieldTerrain();
  const fieldRegions = terrain.tiles ? terrain.regions : undefined;

  return useMemo(
    () => computeRegionHighlights({
        board,
        regionManager,
        players,
        visibleFeatureTypes,
        previewTile,
        skipTileKey,
        fieldRegions,
      }),
    [board, regionManager, players, visibleFeatureTypes, previewTile, skipTileKey, fieldRegions]
  );
}