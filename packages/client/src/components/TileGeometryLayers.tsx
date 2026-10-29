// packages/client/src/components/TileGeometryLayers.tsx
// ============================================
// 🎨 SVG-СЛОИ ГЕОМЕТРИИ ТАЙЛА
// ============================================
// Рисует результат процессора в локальных координатах тайла
// (центр в 0,0; сторона 100). Используется галереей и доской швов.
// Порядок слоёв: поля → дороги → города/монастыри → площади.
// ============================================
import { memo } from 'react';
import { toPathD, ringToPathD } from '@/core/geometry';
import type { TileAudit } from '@/core/geometry/geometryAudit';

export const GEOMETRY_COLORS = {
  field: '#6a994e',
  road: '#c9b38c',
  city: '#a67c52',
  monastery: '#d47843',
  plaza: '#ac9978',
} as const;

interface TileGeometryLayersProps {
  audit: Pick<TileAudit, 'features' | 'geometry'> & Partial<Pick<TileAudit, 'spots'>>;
  /** Рисовать вершины тесселяции */
  showVertices?: boolean;
  /** Рисовать вычисленные споты мипла и щита (нужны audit.spots) */
  showSpots?: boolean;
  /** Радиус фигурки мипла для кружка спота */
  spotRadius?: number;
}

const STROKE = 'rgba(255,255,255,0.22)';

export const TileGeometryLayers = memo(({
  audit,
  showVertices = false,
  showSpots = false,
  spotRadius = 8,
}: TileGeometryLayersProps) => {
  const { features, geometry } = audit;
  const { tessellation, clipping, fields, decorations } = geometry;

  return (
    <g pointerEvents="none">
      {/* Поля: рисуем ВСЕ вычисленные полигоны, даже если фича их не получила */}
      {fields.fieldPolygons.map((polygon, i) => (
        <path
          key={`field-${i}`}
          d={toPathD(polygon)}
          fill={GEOMETRY_COLORS.field}
          fillRule="evenodd"
          stroke={STROKE}
          strokeWidth={0.35}
        />
      ))}

      {/* Дороги (после обрезки городами и площадями) */}
      {features.map((feature) => {
        if (feature.type !== 'road') return null;
        const multi = clipping.clippedLines.get(feature.id);
        if (!multi) return null;
        return multi.map((polygon, i) => (
          <path
            key={`road-${feature.id}-${i}`}
            d={toPathD(polygon)}
            fill={GEOMETRY_COLORS.road}
            fillRule="evenodd"
            stroke={STROKE}
            strokeWidth={0.35}
          />
        ));
      })}

      {/* Города и монастыри */}
      {features.map((feature) => {
        if (feature.type !== 'city' && feature.type !== 'monastery') return null;
        const multi = tessellation.areas.get(feature.id);
        if (!multi) return null;
        const fill = feature.type === 'city' ? GEOMETRY_COLORS.city : GEOMETRY_COLORS.monastery;
        return multi.map((polygon, i) => (
          <path
            key={`area-${feature.id}-${i}`}
            d={toPathD(polygon)}
            fill={fill}
            fillRule="evenodd"
            stroke={STROKE}
            strokeWidth={0.35}
          />
        ));
      })}

      {/* Площади на перекрёстках */}
      {decorations.plazas.map((plaza, i) => (
        <path key={`plaza-${i}`} d={ringToPathD(plaza)} fill={GEOMETRY_COLORS.plaza} />
      ))}

      {/* Споты мипла (голубой круг размером с фигурку) и щита (жёлтый квадрат) */}
      {showSpots && audit.spots && (
        <g>
          {Array.from(audit.spots.entries()).map(([featureId, spot]) => (
            <g key={`spot-${featureId}`}>
              <circle
                cx={spot.meeple[0]} cy={spot.meeple[1]} r={spotRadius}
                fill="rgba(56,189,248,0.18)" stroke="#38bdf8" strokeWidth={0.5} strokeDasharray="1.5 1"
              />
              <circle cx={spot.meeple[0]} cy={spot.meeple[1]} r={1.4} fill="#38bdf8" stroke="#000" strokeWidth={0.3} />
              {spot.shield && (
                <rect
                  x={spot.shield[0] - 2.5} y={spot.shield[1] - 2.5} width={5} height={5} rx={1}
                  fill="#facc15" stroke="#fff" strokeWidth={0.4}
                />
              )}
            </g>
          ))}
        </g>
      )}

      {/* Вершины: жёлтые — контуры, голубые — ось дороги, розовые — края дороги */}
      {showVertices && (
        <g>
          {Array.from(tessellation.areas.entries()).flatMap(([id, multi]) =>
            multi.flatMap((polygon, pi) =>
              polygon.flatMap((ring, ri) =>
                ring.map(([x, y], i) => (
                  <circle key={`va-${id}-${pi}-${ri}-${i}`} cx={x} cy={y} r={0.5} fill="#fde047" />
                ))
              )
            )
          )}
          {Array.from(tessellation.lines.entries()).flatMap(([id, line]) => [
            ...line.center.map(([x, y], i) => (
              <circle key={`vc-${id}-${i}`} cx={x} cy={y} r={0.55} fill="#38bdf8" />
            )),
            ...line.left.map(([x, y], i) => (
              <circle key={`vl-${id}-${i}`} cx={x} cy={y} r={0.35} fill="#f472b6" />
            )),
            ...line.right.map(([x, y], i) => (
              <circle key={`vr-${id}-${i}`} cx={x} cy={y} r={0.35} fill="#f472b6" />
            )),
          ])}
        </g>
      )}
    </g>
  );
});
TileGeometryLayers.displayName = 'TileGeometryLayers';
