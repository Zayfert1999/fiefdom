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
  audit: Pick<TileAudit, 'features' | 'geometry'>;
  /** Рисовать вершины тесселяции */
  showVertices?: boolean;
}

const STROKE = 'rgba(255,255,255,0.22)';

export const TileGeometryLayers = memo(({ audit, showVertices = false }: TileGeometryLayersProps) => {
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
