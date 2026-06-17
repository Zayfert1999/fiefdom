// renderer/MeepleSelection.tsx
import { Meeple } from './Meeple';
import type { TileFeature } from '@/core/types';

export const MeepleSelection = ({
  features,
  onPlace
}: {
  features: TileFeature[];
  onPlace: (featureId: string, x: number, y: number) => void;
}) => {
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
            e.stopPropagation();
            onPlace(m.featureId, m.x, m.y);
          }}
          style={{ cursor: 'pointer' }}
        >
          {/* 🌟 Внешний контейнер для центрирования */}
          <g transform="translate(-16, -16)">
            {/* 🌟 Внутренний контейнер для масштабирования и стилей */}
            <g className="meeple-spot">
              {/* 🌟 Передаём белый цвет — CSS переопределит его в полупрозрачный */}
              <Meeple color="white" size={32} />
            </g>
          </g>
        </g>
      ))}
    </g>
  );
};