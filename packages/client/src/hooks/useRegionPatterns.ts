// hooks/useRegionPatterns.ts
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { rotateFeatures } from '@carcassonne/shared/core/tileUtils';
import type { RegionManager } from '@carcassonne/shared/core/regionManager';

/**
 * 🌟 Хук для вычисления уникальных цветовых комбинаций регионов
 * Используется для генерации SVG-паттернов штриховки
 * 
 * Возвращает массив строк, где каждая строка — это:
 * - "#ff0000" (один цвет)
 * - "#ff0000|#00ff00" (несколько цветов, отсортированы)
 */
export const useRegionPatterns = (): string[] => {
  const board = useGameStore(s => s.board);
  const regionManager = useGameStore(s => s.regionManager);
  const previewTile = useGameStore(s => s.previewTile);
  const previewRegionManager = useGameStore(s => s.previewRegionManager);
  const players = useGameStore(s => s.players);

  return useMemo(() => {
    const combinations = new Set<string>();

    // 🌟 Вспомогательная функция: обработка одной фичи
    const processFeature = (
      x: number,
      y: number,
      featureId: string,
      rm: RegionManager
    ) => {
      const featureKey = `${x},${y}:${featureId}`;
      const owners = rm.getFeatureOwners(featureKey);

      if (owners.length === 0) return;

      const meta = rm.getMetadata(featureKey);
      if (!meta) return;

      // Находим доминирующих владельцев (с максимальным количеством миплов)
      const maxCount = Math.max(...owners.map(id => meta.meepleCounts.get(id) || 0));
      const dominantOwners = owners.filter(
        id => (meta.meepleCounts.get(id) || 0) === maxCount
      );

      if (dominantOwners.length === 1) {
        // Один доминирующий игрок — добавляем его цвет
        const player = players.find(p => p.id === dominantOwners[0]);
        if (player) combinations.add(player.color);
      } else {
        // Несколько доминирующих — добавляем комбинацию цветов
        const colors = dominantOwners
          .map(id => players.find(p => p.id === id)?.color || '#ffffff')
          .sort()
          .join('|');
        combinations.add(colors);
      }
    };

    // 🌟 Используем previewRegionManager если есть (он содержит объединённые регионы)
    const activeRM = previewRegionManager || regionManager;

    // 🌟 ШАГ 1: Обычные тайлы из board
    for (const tile of board.values()) {
      for (const feature of tile.features) {
        processFeature(tile.x, tile.y, feature.id, activeRM);
      }
    }

    // 🌟 ШАГ 2: Preview-тайл (если есть)
    if (previewTile && previewRegionManager) {
      const rotatedFeatures = rotateFeatures(
        previewTile.tile.features,
        previewTile.rotation
      );
      for (const feature of rotatedFeatures) {
        processFeature(
          previewTile.x,
          previewTile.y,
          feature.id,
          previewRegionManager
        );
      }
    }

    console.log(`🎨 [Patterns] Вычислено ${combinations.size} уникальных комбинаций`);
    return Array.from(combinations);
  }, [board, regionManager, previewRegionManager, previewTile, players]);
};