// packages/client/src/sandbox/view/TileSvgView.tsx
// ============================================
// 📐 2D SVG-ВИД ТАЙЛА
// ============================================
// Рисует только то, что ему передали: геометрию после тесселяции и шума,
// порты, споты, вершины, оси и сетку. Никакой генерации внутри нет.
// ============================================
import { memo } from 'react';
import { ringToPathD } from '@/core/geometry';
import type { TileGeometryResult } from '@/core/geometry';
import type { TileAudit } from '@/core/geometry/geometryAudit';
import type { TileFeature } from '@fiefdom/shared/core/types';
import type { SandboxTile, TileLayers } from '../types';
import { CompassLabels } from './CompassLabels';
import { COLORS, getFeatureFill } from './colors';
import { getPortPoint, renderMultiPolygon } from './svgHelpers';

interface TileSvgViewProps {
  size: number;
  tile: SandboxTile;
  layers: TileLayers;
  /** Фичи в порядке отрисовки (поля снизу, города сверху) */
  orderedFeatures: readonly TileFeature[];
  /** id фич, чья геометрия сгенерирована (рисуются пунктиром) */
  generatedIds: ReadonlySet<string>;
  result: TileGeometryResult;
  audit: TileAudit;
  /** Радиус мипла: размер круга вычисленного спота */
  meepleRadius: number;
}

export const TileSvgView = memo(({
  size,
  tile,
  layers,
  orderedFeatures,
  generatedIds,
  result,
  audit,
  meepleRadius,
}: TileSvgViewProps) => {
  const { grid: showGrid, axes: showAxes, spots: showSpots, autoSpots: showAutoSpots, ports: showPorts, geometry: showGeometry, vertices: showVertices } = layers;
  const { tessellation, decorations, clipping, assignments } = result;

  return (
    <div style={{ position: 'relative', width: size, height: size, padding: 24, boxSizing: 'content-box' }}>
      <style>{`.sandbox-svg .hoverable-shape { transition: stroke 0.15s ease, stroke-width 0.15s ease, filter 0.15s ease; stroke: transparent; stroke-width: 0; pointer-events: visiblePainted; } .sandbox-svg .hoverable-shape:hover { stroke: #ffffff; stroke-width: 1.5; stroke-linejoin: round; cursor: crosshair; }`}</style>
      <CompassLabels />
      <svg
        className="sandbox-svg"
        width={size}
        height={size}
        viewBox="-65 -65 130 130"
        style={{ display: 'block', overflow: 'visible', background: '#1a1a2e', borderRadius: 8 }}
      >
        {/* Сетка */}
        {showGrid && (
          <g stroke="#ffffff" strokeWidth="0.3" opacity="0.15">
            {Array.from({ length: 11 }, (_, i) => {
              const pos = -50 + i * 10;
              return (
                <g key={i}>
                  <line x1={pos} y1={-50} x2={pos} y2={50} />
                  <line x1={-50} y1={pos} x2={50} y2={pos} />
                </g>
              );
            })}
          </g>
        )}

        {/* Граница тайла (видно, если геометрия выходит за неё) */}
        <rect
          x={-50} y={-50} width={100} height={100}
          fill="none" stroke="#ef4444" strokeWidth={0.4} strokeDasharray="2 1.5" opacity={0.7}
          pointerEvents="none"
        />

        {/* Оси */}
        {showAxes && (
          <g>
            <line x1={-50} y1={0} x2={50} y2={0} stroke="#ef4444" strokeWidth={0.5} opacity={0.55} />
            <line x1={0} y1={-50} x2={0} y2={50} stroke="#22c55e" strokeWidth={0.5} opacity={0.55} />
            <text x={52} y={2} fill="#ef4444" fontSize={5}>X</text>
            <text x={2} y={-52} fill="#22c55e" fontSize={5}>Y</text>
          </g>
        )}

        {/* Геометрия фич */}
        {showGeometry && orderedFeatures.map((feature) => {
          const generated = generatedIds.has(feature.id);
          const fill = getFeatureFill(feature);

          if (feature.type === 'field') {
            const fieldMP = assignments.fieldGeometries.get(feature.id);
            return (
              <g key={feature.id} data-feature-id={feature.id}>
                {renderMultiPolygon(fieldMP, { keyPrefix: `field-${feature.id}`, featureId: feature.id, fill, opacity: 0.8, generated, className: 'hoverable-shape' })}
              </g>
            );
          }
          if (feature.geometry?.kind === 'area') {
            const areaMP = tessellation.areas.get(feature.id);
            if (!areaMP) return null;
            return (
              <g key={feature.id} data-feature-id={feature.id}>
                {renderMultiPolygon(areaMP, { keyPrefix: `area-${feature.id}`, featureId: feature.id, fill, opacity: 0.8, generated, className: 'hoverable-shape' })}
              </g>
            );
          }
          if (feature.geometry?.kind === 'line') {
            const roadMP = clipping.clippedLines.get(feature.id);
            if (!roadMP || roadMP.length === 0) return null;
            return (
              <g key={feature.id} data-feature-id={feature.id}>
                {renderMultiPolygon(roadMP, { keyPrefix: `road-${feature.id}`, featureId: feature.id, fill, opacity: 0.8, generated, className: 'hoverable-shape' })}
              </g>
            );
          }
          return null;
        })}

        {/* Площади */}
        {showGeometry && decorations.plazas.map((plaza, index) => (
          <path key={`plaza-${index}`} d={ringToPathD(plaza)} fill={COLORS.plaza} fillOpacity={0.8} pointerEvents="none" />
        ))}

        {/* Вершины тесселяции: жёлтые — контуры, голубые — ось дороги, розовые — края дороги */}
        {showVertices && (
          <g pointerEvents="none">
            {Array.from(tessellation.areas.entries()).flatMap(([id, multi]) =>
              multi.flatMap((polygon, pi) =>
                polygon.flatMap((ring, ri) =>
                  ring.map(([x, y], i) => (
                    <circle key={`va-${id}-${pi}-${ri}-${i}`} cx={x} cy={y} r={0.55} fill="#fde047" />
                  ))
                )
              )
            )}
            {Array.from(tessellation.lines.entries()).flatMap(([id, line]) => [
              ...line.center.map(([x, y], i) => (
                <circle key={`vc-${id}-${i}`} cx={x} cy={y} r={0.6} fill="#38bdf8" />
              )),
              ...line.left.map(([x, y], i) => (
                <circle key={`vl-${id}-${i}`} cx={x} cy={y} r={0.4} fill="#f472b6" />
              )),
              ...line.right.map(([x, y], i) => (
                <circle key={`vr-${id}-${i}`} cx={x} cy={y} r={0.4} fill="#f472b6" />
              )),
            ])}
          </g>
        )}

        {/* Порты */}
        {showPorts && tile.features.map((feature) => (
          <g key={`ports-${feature.id}`}>
            {feature.ports.map((port) => {
              const [x, y] = getPortPoint(port);
              const color = getFeatureFill(feature);
              return (
                <g key={`${feature.id}-port-${port}`}>
                  <circle cx={x} cy={y} r={2} fill={color} stroke="#fff" strokeWidth={0.3} />
                  <text x={x} y={y - 3.5} textAnchor="middle" fontSize={3.5} fill="#ddd" fontFamily="monospace">{port}</text>
                </g>
              );
            })}
          </g>
        ))}

        {/* Споты */}
        {showSpots && tile.features.map((feature) => (
          <g key={`spots-${feature.id}`}>
            <circle cx={feature.meepleSpot.x} cy={feature.meepleSpot.y} r={3} fill={COLORS.meeple} stroke="#000" strokeWidth={0.5} />
            {feature.shieldSpot && (
              <rect x={feature.shieldSpot.x - 2.5} y={feature.shieldSpot.y - 2.5} width={5} height={5} fill={COLORS.shield} stroke="#fff" strokeWidth={0.5} rx={1} />
            )}
          </g>
        ))}

        {/* 📍 Вычисленные споты: круг размером с фигурку; тонкая линия тянется к прежнему ручному споту */}
        {showAutoSpots && Array.from(audit.spots.entries()).map(([featureId, spot]) => {
          const manual = tile.features.find((f) => f.id === featureId)?.meepleSpot;
          return (
            <g key={`auto-spot-${featureId}`} pointerEvents="none">
              {showSpots && manual && (
                <line
                  x1={manual.x} y1={manual.y} x2={spot.meeple[0]} y2={spot.meeple[1]}
                  stroke="#38bdf8" strokeWidth={0.3} strokeDasharray="1 1" opacity={0.7}
                />
              )}
              <circle
                cx={spot.meeple[0]} cy={spot.meeple[1]} r={meepleRadius}
                fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth={0.5} strokeDasharray="1.5 1"
              />
              <circle cx={spot.meeple[0]} cy={spot.meeple[1]} r={1.5} fill="#38bdf8" stroke="#000" strokeWidth={0.3} />
              {spot.shield && (
                <rect
                  x={spot.shield[0] - 2.5} y={spot.shield[1] - 2.5} width={5} height={5} rx={1}
                  fill="#facc15" stroke="#fff" strokeWidth={0.5}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
});
TileSvgView.displayName = 'TileSvgView';
