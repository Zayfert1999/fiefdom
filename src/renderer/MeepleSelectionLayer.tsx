// renderer/MeepleSelectionLayer.tsx
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Meeple } from './Meeple';
import { TILE_DEFINITIONS } from '@/core/tileData';
import type { TileFeature } from '@/core/types';

const TILE_SIZE = 100;

/**
 * 🌟 Глобальный слой для спотов размещения миплов.
 * Рендерится ПОВЕРХ подсветки регионов (RegionOverlay).
 * 
 * Объединяет логику:
 *   - Находит последний тайл
 *   - Вычисляет доступные фичи
 *   - Рендерит споты для миплов
 */
export const MeepleSelectionLayer = () => {
  const board = useGameStore(s => s.board);
  const phase = useGameStore(s => s.phase);
  const currentPlayer = useGameStore(s => s.players[s.currentTurn]);
  const regionManager = useGameStore(s => s.regionManager);

  // 🌟 Находим последний тайл и вычисляем доступные фичи
  const lastTileData = useMemo(() => {
    if (phase !== 'placeMeeple' || !currentPlayer) return null;

    const tiles = Array.from(board.values());
    const lastTile = tiles[tiles.length - 1];
    if (!lastTile || lastTile.meeple) return null;

    const baseTileDef = TILE_DEFINITIONS.find(def => def.id === lastTile.templateId);
    const featuresForRendering = baseTileDef ? baseTileDef.features : lastTile.features;

    const availableFeatures = featuresForRendering.filter(feature => {
      const featureKey = `${lastTile.x},${lastTile.y}:${feature.id}`;
      const owners = regionManager.getFeatureOwners(featureKey);
      return owners.length === 0;
    });

    if (availableFeatures.length === 0) return null;

    return {
      tileX: lastTile.x,
      tileY: lastTile.y,
      rotation: lastTile.rotation,
      features: availableFeatures
    };
  }, [board, phase, currentPlayer, regionManager]);

  // 🌟 Если нет данных для отображения — ничего не рендерим
  if (!lastTileData) return null;

  const { tileX, tileY, rotation, features } = lastTileData;

  // 🌟 Собираем все споты для размещения миплов
  const markers = features.flatMap((feat: TileFeature) =>
    feat.spots.map((spot, idx) => ({
      featureId: feat.id,
      type: feat.type,
      x: spot.x,
      y: spot.y,
      key: `${feat.id}-spot-${idx}`,
    }))
  );

  if (markers.length === 0) {
    console.warn('⚠️ [MeepleSelectionLayer] Не найдено спотов для размещения мипла');
    return null;
  }

  // 🌟 Вычисляем поворот мипла-превью
  const getMeepleRotation = (featureType: string): number => {
    let compensation = -rotation;
    if (featureType === 'field') {
      compensation += 90;
    }
    return compensation;
  };

  return (
    <g
      className="meeple-selection-layer"
      transform={`translate(${tileX * TILE_SIZE}, ${tileY * TILE_SIZE}) rotate(${rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`}
      style={{ '--player-color': currentPlayer?.color, overflow: 'visible' } as React.CSSProperties}
      pointerEvents="none" // 🌟 Контейнер не перехватывает клики
    >
      {markers.map((m) => {
        const meepleRotation = getMeepleRotation(m.type);

        return (
          <g
            key={m.key}
            transform={`translate(${m.x}, ${m.y})`}
            onClick={(e) => {
              e.stopPropagation();
              console.log(`🖱️ [MeepleSelectionLayer] Выбор спота: фича ${m.featureId}, координаты (${m.x}, ${m.y})`);
              useGameStore.getState().placeMeeple(m.featureId, m.x, m.y);
            }}
            style={{ cursor: 'pointer', pointerEvents: 'auto' }} // 🌟 Споты кликабельны
          >
            {/* 🌟 Внешний контейнер для центрирования */}
            <g transform="translate(-16, -16)">
              {/* 🌟 Поворот относительно центра мипла (16, 16) */}
              <g transform={`rotate(${meepleRotation}, 16, 16)`}>
                <g className="meeple-spot">
                  <Meeple color="white" size={32} />
                </g>
              </g>
            </g>
          </g>
        );
      })}
    </g>
  );
};