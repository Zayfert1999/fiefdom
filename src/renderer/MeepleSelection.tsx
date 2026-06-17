// renderer/MeepleSelection.tsx
import { Meeple } from './Meeple';
import type { TileFeature } from '@/core/types';

export const MeepleSelection = ({
  features,
  rotation = 0, // 🌟 Поворот тайла
  onPlace
}: {
  features: TileFeature[];
  rotation?: 0 | 90 | 180 | 270; // 🌟 Новый проп
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

  // 🌟 Вычисляем поворот мипла-превью
  const getMeepleRotation = (featureType: string): number => {
    let compensation = -rotation;
    if (featureType === 'field') {
      compensation += 90;
    }
    return compensation;
  };

  return (
    <g>
      {markers.map((m) => {
        const meepleRotation = getMeepleRotation(m.type);

        return (
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