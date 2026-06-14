import { Meeple } from './Meeple';
import type { TileFeature } from '@/core/types';

export const MeepleSelection = ({
  features,
  playerColor,
  onPlace
}: {
  features: TileFeature[];
  playerColor: string;
  onPlace: (featureId: string, x: number, y: number) => void;
}) => {
  // Собираем все споты. Координаты здесь БАЗОВЫЕ (0 градусов).
  const markers = features.flatMap(feat =>
    feat.spots.map((spot, idx) => ({
      featureId: feat.id,
      type: feat.type,
      x: spot.x,
      y: spot.y,
      key: `${feat.id}-spot-${idx}`,
    }))
  );

  if (markers.length === 0) {
    console.warn('⚠️ [MeepleSelection] Не найдено спотов для размещения мипла на этом тайле');
    return null;
  }

  return (
    <g>
      {markers.map((m) => (
        <g
          key={m.key}
          transform={`translate(${m.x}, ${m.y})`}
          onClick={(e) => {
            e.stopPropagation(); // Предотвращаем всплытие клика к доске
            onPlace(m.featureId, m.x, m.y);
          }}
          style={{ cursor: 'pointer' }}
        >
          {/* Визуальный маркер */}
          <circle r="16" fill="white" fillOpacity="0.4" stroke={playerColor} strokeWidth="2" />
          {/* Мипл-превью */}
          <g transform="translate(-15, -15)">
            <Meeple color={playerColor} size={30} />
          </g>
        </g>
      ))}
    </g>
  );
};