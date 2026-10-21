// packages/client/src/components/GeometrySandbox.tsx
// ============================================
// 🧪 ПЕСОЧНИЦА ГЕОМЕТРИИ ТАЙЛОВ
// ============================================
// Показывает:
// • сетку / оси / споты / порты;
// • генеративную геометрию городов и дорог из ports;
// • результат geometryProcessor:
//   - области городов/монастырей;
//   - обрезанные дороги;
//   - поля как остаток тайла;
//   - площади на перекрёстках дорог.
//
// Пайплайн:
// tile.features
//   → generateFeatureGeometries()
//   → processTileGeometry({ tessellation, noise })
//   → SVG / 3D visualization
//
// 🌟 Все параметры тесселяции и шума настраиваются в левой панели
//    (см. SandboxParamControls.tsx). Показывается число вершин
//    и максимальный выход геометрии за границу тайла.
// ============================================

import { useState, useMemo, memo, useCallback, useEffect, useDeferredValue } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { useLiveTiles } from '@/hooks/useLiveTiles';
import { Tile3DView } from './Tile3DView';
import {
  NoiseControls,
  TessellationControls,
  ParamCheckbox,
} from './SandboxParamControls';
import {
  processTileGeometry,
  toPathD,
  ringToPathD,
  generateFeatureGeometries,
  measureOutOfTile,
  ROAD_PARAMS,
  NOISE_PARAMS,
  DEFAULT_TESSELLATION_PARAMS,
} from '@/core/geometry';
import type { NoiseSettings, TessellationParams } from '@/core/geometry';
import type { TileFeature, Port } from '@fiefdom/shared/core/types';
import type { MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import styles from '@/components/styles/modal.module.css';

// ============================================
// 🎨 ЦВЕТОВАЯ СХЕМА
// ============================================

const COLORS = {
  field: '#6a994e',
  road: '#c9b38c',
  city: '#a67c52',
  monastery: '#d47843',
  plaza: '#ac9978',
  shield: '#ffd700',
  meeple: '#ffffff',
} as const;

/**
 * Экспортируется, потому что Tile3DView использует этот цвет для площадей.
 */
export const PLAZA_COLOR = COLORS.plaza;

// ============================================
// 📦 ЛОКАЛЬНЫЙ ТИП ТАЙЛА ДЛЯ ПЕСОЧНИЦЫ
// ============================================
// Используем минимальную структурную типизацию, чтобы не зависеть
// от конкретного экспорта Tile в разных версиях проекта.
interface SandboxTile {
  id: string;
  artId?: string;
  quantity: number;
  features: readonly TileFeature[];
}

// ============================================
// 🧭 ПОРЯДОК СЛОЁВ ОТРИСОВКИ
// ============================================
// 0 — поля, рисуем нижним слоем;
// 1 — дороги;
// 2 — города и монастыри;
// 9 — неизвестное.
const getFeatureLayer = (type: TileFeature['type']): number => {
  switch (type) {
    case 'field':
      return 0;
    case 'road':
      return 1;
    case 'city':
    case 'monastery':
      return 2;
    default:
      return 9;
  }
};

const getFeatureFill = (feature: Pick<TileFeature, 'type'>): string => {
  switch (feature.type) {
    case 'city':
      return COLORS.city;
    case 'road':
      return COLORS.road;
    case 'field':
      return COLORS.field;
    case 'monastery':
      return COLORS.monastery;
    default:
      return '#71717a';
  }
};


// ============================================
// 📍 ГЕОМЕТРИЯ ПОРТОВ ДЛЯ ОТЛАДКИ
// ============================================
// Тайл имеет координаты [-50, 50] × [-50, 50].
// Порты 0..11 распределены по сторонам:
// 0-2  → N
// 3-5  → E
// 6-8  → S
// 9-11 → W
//
// На каждой стороне 3 порта: левый/центральный/правый относительно обхода по часовой.
const getPortPoint = (port: Port): [number, number] => {
  const side = Math.floor(port / 3);
  const index = port % 3;

  // Три позиции на стороне: -25, 0, +25
  const offset = (index - 1) * 25;

  switch (side) {
    case 0:
      // Север: port 0,1,2
      return [offset, -50];
    case 1:
      // Восток: port 3,4,5
      return [50, offset];
    case 2:
      // Юг: port 6,7,8 — обход справа налево
      return [-offset, 50];
    case 3:
      // Запад: port 9,10,11 — обход снизу вверх
      return [-50, -offset];
    default:
      return [0, 0];
  }
};

// ============================================
// 🛠️ РЕНДЕР MULTI_POLYGON В SVG
// ============================================

interface RenderMultiPolygonOptions {
  keyPrefix: string;
  featureId?: string;
  fill: string;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  generated?: boolean;
  className?: string;
}

function renderMultiPolygon(
  multi: MultiPolygon | undefined,
  options: RenderMultiPolygonOptions
) {
  if (!multi || multi.length === 0) return null;

  // Сгенерированные фигуры помечаем пунктирной белой обводкой,
  // чтобы визуально отличать procedural geometry от ручной.
  const stroke = options.generated
    ? 'rgba(255,255,255,0.9)'
    : options.stroke ?? 'rgba(255,255,255,0.18)';

  const strokeWidth = options.generated ? 0.7 : options.strokeWidth ?? 0.35;
  const strokeDasharray = options.generated ? '3 2' : undefined;

  return multi.map((polygon, index) => (
    <path
      key={`${options.keyPrefix}-${index}`}
      d={toPathD(polygon)}
      fill={options.fill}
      fillOpacity={options.opacity ?? 0.85}
      fillRule="evenodd"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      className={options.className}
      data-feature-id={options.featureId}
    />
  ));
}

// ============================================
// 🧭 ПОДПИСИ СТОРОН СВЕТa
// ============================================

const CompassLabels = memo(() => (
  <>
    <span
      style={{
        position: 'absolute',
        top: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      N
    </span>
    <span
      style={{
        position: 'absolute',
        right: 6,
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      E
    </span>
    <span
      style={{
        position: 'absolute',
        bottom: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      S
    </span>
    <span
      style={{
        position: 'absolute',
        left: 6,
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      W
    </span>
  </>
));
CompassLabels.displayName = 'CompassLabels';

// ============================================
// 📚 ЛЕГЕНДА
// ============================================

const Legend = memo(() => (
  <div
    style={{
      marginTop: 12,
      paddingTop: 12,
      borderTop: '1px solid rgba(255,255,255,0.12)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      fontSize: 12,
      color: '#ccc',
    }}
  >
    <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
      📚 Легенда
    </div>

    {[
      { label: 'Поле', color: COLORS.field },
      { label: 'Дорога', color: COLORS.road },
      { label: 'Город', color: COLORS.city },
      { label: 'Монастырь', color: COLORS.monastery },
      { label: 'Площадь', color: COLORS.plaza },
      { label: 'Щит', color: COLORS.shield },
      { label: 'Мипл', color: COLORS.meeple },
    ].map((item) => (
      <div
        key={item.label}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            background: item.color,
            border: '1px solid #fff',
            flexShrink: 0,
          }}
        />
        <span>{item.label}</span>
      </div>
    ))}
  </div>
));
Legend.displayName = 'Legend';

// ============================================
// 👁️ ВЬЮ ОДНОГО ТАЙЛА В ПЕСОЧНИЦЕ
// ============================================

interface SandboxTileViewProps {
  tile: SandboxTile;
  size: number;
  showGrid: boolean;
  showAxes: boolean;
  showSpots: boolean;
  showPorts: boolean;
  showGeometry: boolean;
  // Генеративная геометрия
  enableGenerative: boolean;
  overwrite: boolean;
  roadWidth: number;
  seedOverride?: string;
  // 🌊 Шум Перлина и 📐 тесселяция
  noiseEnabled: boolean;
  noise: NoiseSettings;
  tessParams: TessellationParams;
  showVertices: boolean;
}

const SandboxTileView = memo(({
  tile,
  size,
  showGrid,
  showAxes,
  showSpots,
  showPorts,
  showGeometry,
  enableGenerative,
  overwrite,
  roadWidth,
  seedOverride,
  noiseEnabled,
  noise,
  tessParams,
  showVertices,
}: SandboxTileViewProps) => {
  // ============================================
  // 🔑 SEED (для шума, не для генераторов)
  // ============================================
  const seed = useMemo(
    () => seedOverride?.trim() || tile.artId || tile.id,
    [seedOverride, tile.artId, tile.id]
  );

  // ============================================
  // 🧬 ГЕНЕРАЦИЯ ГЕОМЕТРИИ (БЕЗ seed и jitter)
  // ============================================
  const generation = useMemo(() => {
    if (!enableGenerative) {
      return {
        features: tile.features as readonly TileFeature[],
        warnings: [] as readonly string[],
        generatedIds: new Set<string>(),
      };
    }

    console.log(
      `🧬 [Sandbox] Генерация: tile="${tile.id}", ` +
      `overwrite=${overwrite}, roadWidth=${roadWidth}`
    );

    // 🌟 БЕЗ seed и jitter — генераторы чистые
    const gen = generateFeatureGeometries(tile.features, {
      overwrite,
      roadWidth,
    });

    const generatedIds = new Set(gen.geometries.keys());
    const features: TileFeature[] = tile.features.map((feature) => {
      const geometry = gen.geometries.get(feature.id);
      return geometry ? { ...feature, geometry } : feature;
    });

    if (gen.warnings.length > 0) {
      console.warn(`⚠️ [Sandbox] Предупреждения для "${tile.id}":`, gen.warnings);
    }

    return { features, warnings: gen.warnings, generatedIds };
  }, [enableGenerative, tile, overwrite, roadWidth]);

  // ============================================
  // 🏭 ПРОЦЕССОР С ШУМОМ ПЕРЛИНА
  // ============================================
  const result = useMemo(() => {
    console.log(`🏭 [Sandbox] Процессор: "${tile.id}", noise=${noiseEnabled}`);

    // 🌟 Все параметры приходят из панелей песочницы
    return processTileGeometry(generation.features, {
      noiseSeed: noiseEnabled ? seed : undefined,
      noise,
      tessellation: tessParams,
    });
  }, [generation.features, tile.id, seed, noiseEnabled, noise, tessParams]);

  // ============================================
  // 🧱 ПОРЯДОК ОТРИСОВКИ
  // ============================================
  const orderedFeatures = useMemo(
    () => [...generation.features].sort(
      (a, b) => getFeatureLayer(a.type) - getFeatureLayer(b.type)
    ),
    [generation.features]
  );

  const { tessellation, decorations, clipping, assignments } = result;

  // Максимальный выход геометрии за квадрат тайла (0 = всё внутри)
  const overshoot = useMemo(() => measureOutOfTile(tessellation), [tessellation]);

  // Число вершин после тесселяции и шума
  const vertexStats = useMemo(() => {
    const rows: { id: string; points: number }[] = [];
    for (const [id, multi] of tessellation.areas) {
      const points = multi.reduce(
        (sum, polygon) => sum + polygon.reduce((acc, ring) => acc + ring.length, 0),
        0
      );
      rows.push({ id, points });
    }
    for (const [id, line] of tessellation.lines) {
      rows.push({ id, points: line.center.length });
    }
    return rows;
  }, [tessellation]);

  // ============================================
  // 🩺 ДИАГНОСТИКА
  // ============================================
  const missingGeometry = useMemo(() => {
    const missing: string[] = [];
    for (const feature of orderedFeatures) {
      if (feature.type === 'field') {
        if (!assignments.fieldGeometries.has(feature.id)) {
          missing.push(`field:${feature.id}`);
        }
      } else if (feature.geometry?.kind === 'area') {
        if (!tessellation.areas.has(feature.id)) {
          missing.push(`area:${feature.id}`);
        }
      } else if (feature.geometry?.kind === 'line') {
        if (!clipping.clippedLines.has(feature.id)) {
          missing.push(`line:${feature.id}`);
        }
      }
    }
    if (missing.length > 0) {
      console.warn(`⚠️ [Sandbox] Нет полигонов: ${missing.join(', ')}`);
    }
    return missing;
  }, [orderedFeatures, assignments, tessellation, clipping]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 📐 2D SVG ВИД */}
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
              const generated = generation.generatedIds.has(feature.id);
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
              <path key={`plaza-${index}`} d={ringToPathD(plaza)} fill={PLAZA_COLOR} fillOpacity={0.8} pointerEvents="none" />
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
          </svg>
        </div>

        {/* 🎮 3D ВИД */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ marginBottom: 8, color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>3D</div>
          <Tile3DView result={result} size={size} />
        </div>
      </div>

      {/* 🩺 ДИАГНОСТИКА ТЕССЕЛЯЦИИ И ШУМА */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#aaa' }}>
        <span style={{ color: overshoot > 0 ? '#fca5a5' : '#86efac', fontWeight: 600 }}>
          {overshoot > 0
            ? `⚠️ Выход за тайл: ${overshoot.toFixed(2)} ед.`
            : '✅ Вся геометрия внутри тайла'}
        </span>
        {vertexStats.map((row) => (
          <span key={row.id} style={{ fontFamily: 'monospace' }}>
            {row.id}: {row.points} т.
          </span>
        ))}
      </div>

      {/* ⚠️ ПРЕДУПРЕЖДЕНИЯ */}
      {(generation.warnings.length > 0 || missingGeometry.length > 0) && (
        <div style={{ maxWidth: size * 2 + 32, padding: 8, borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fecaca', fontSize: 12, lineHeight: 1.4 }}>
          {generation.warnings.length > 0 && (
            <>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Предупреждения генератора</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {generation.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </>
          )}
          {missingGeometry.length > 0 && (
            <>
              <div style={{ fontWeight: 700, marginTop: generation.warnings.length > 0 ? 8 : 0, marginBottom: 4 }}>🚫 Нет полигонов</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{missingGeometry.join(', ')}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
SandboxTileView.displayName = 'SandboxTileView';

// ============================================
// 🧪 ГЛАВНЫЙ КОНТЕЙНЕР ПЕСОЧНИЦЫ
// ============================================
export const GeometrySandbox = () => {
  const setLobbyScreen = useGameStore((s) => s.setLobbyScreen);
  const tiles: readonly SandboxTile[] = useLiveTiles();

  // ============================================
  // 🎯 ВЫБОР ТАЙЛА
  // ============================================
  const [selectedTileId, setSelectedTileId] = useState<string>(tiles[0]?.id ?? '');

  // ============================================
  // 👁️ СЛОИ ВИЗУАЛИЗАЦИИ
  // ============================================
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showSpots, setShowSpots] = useState(true);
  const [showPorts, setShowPorts] = useState(true);
  const [showGeometry, setShowGeometry] = useState(true);
  const [showVertices, setShowVertices] = useState(false);

  // ============================================
  // 🧬 ГЕНЕРАТИВНАЯ ГЕОМЕТРИЯ
  // ============================================
  const [enableGenerative, setEnableGenerative] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [roadWidth, setRoadWidth] = useState<number>(ROAD_PARAMS.width);
  const [seedOverride, setSeedOverride] = useState('');

  // ============================================
  // 🌊 ПАРАМЕТРЫ ШУМА ПЕРЛИНА И 📐 ТЕССЕЛЯЦИИ
  // ============================================
  const [noiseEnabled, setNoiseEnabled] = useState(true);
  const [noiseParams, setNoiseParams] = useState<NoiseSettings>({ ...NOISE_PARAMS });
  const [tessParams, setTessParams] = useState<TessellationParams>({ ...DEFAULT_TESSELLATION_PARAMS });

  // Пока ползунок тянут, тяжёлый пайплайн (булевы операции + 3D) догоняет с задержкой
  const deferredNoise = useDeferredValue(noiseParams);
  const deferredTess = useDeferredValue(tessParams);

  const patchNoise = useCallback(
    (patch: Partial<NoiseSettings>) => setNoiseParams((prev) => ({ ...prev, ...patch })),
    []
  );
  const patchTess = useCallback(
    (patch: Partial<TessellationParams>) => setTessParams((prev) => ({ ...prev, ...patch })),
    []
  );
  const resetNoise = useCallback(() => setNoiseParams({ ...NOISE_PARAMS }), []);
  const resetTess = useCallback(() => setTessParams({ ...DEFAULT_TESSELLATION_PARAMS }), []);

  /** Копирует текущие параметры в буфер — чтобы перенести удачные значения в код */
  const handleCopyParams = useCallback(() => {
    const json = JSON.stringify({ tessellation: tessParams, noise: noiseParams }, null, 2);
    console.log('📋 [Sandbox] Параметры:\n' + json);
    void navigator.clipboard?.writeText(json);
  }, [tessParams, noiseParams]);

  // ============================================
  // 🔄 ВЕРСИЯ ДЛЯ HOT-RELOAD
  // ============================================
  const [version, setVersion] = useState(0);

  const selectedTile = useMemo(
    () => tiles.find((t) => t.id === selectedTileId) ?? null,
    [selectedTileId, tiles]
  );

  // ============================================
  // 📊 СТАТИСТИКА
  // ============================================
  const geometryStats = useMemo(() => {
    let withGeometry = 0;
    let withoutGeometry = 0;
    let derived = 0;
    for (const tile of tiles) {
      for (const feat of tile.features) {
        if (feat.geometry?.kind === 'derived') derived++;
        else if (feat.geometry) withGeometry++;
        else withoutGeometry++;
      }
    }
    return { withGeometry, withoutGeometry, derived };
  }, [tiles]);

  // ============================================
  // 🧪 ЛОГИ
  // ============================================
  useEffect(() => {
    console.log('🧪 [Sandbox] Компонент смонтирован');
    return () => { console.log('🧪 [Sandbox] Компонент размонтирован'); };
  }, []);

  useEffect(() => {
    console.log(
      `⚙️ [Sandbox] Параметры: ` +
      `enable=${enableGenerative}, ` +
      `noise=${noiseEnabled}, ` +
      `overwrite=${overwrite}, roadWidth=${roadWidth}, ` +
      `seedOverride="${seedOverride}"`
    );
  }, [enableGenerative, noiseEnabled, overwrite, roadWidth, seedOverride]);

  useEffect(() => {
    setVersion((v) => v + 1);
  }, [tiles]);

  useEffect(() => {
    if (tiles.length === 0) return;
    if (!selectedTileId || !tiles.some((t) => t.id === selectedTileId)) {
      setSelectedTileId(tiles[0].id);
    }
  }, [tiles, selectedTileId]);

  // ============================================
  // 🖱️ ХЕНДЛЕРЫ
  // ============================================
  const handleTileClick = useCallback((id: string) => {
    setSelectedTileId(id);
    console.log(`🧪 [Sandbox] Выбран тайл: ${id}`);
  }, []);

  const handleClose = useCallback(() => {
    console.log('🔙 [Sandbox] Закрытие песочницы');
    setLobbyScreen('modeSelect');
  }, [setLobbyScreen]);

  const layerToggles = [
    { label: '🔲 Сетка', value: showGrid, set: setShowGrid },
    { label: '➕ Оси', value: showAxes, set: setShowAxes },
    { label: '🔶 Споты', value: showSpots, set: setShowSpots },
    { label: '📍 Порты', value: showPorts, set: setShowPorts },
    { label: '🎨 Геометрия', value: showGeometry, set: setShowGeometry },
    { label: '🔹 Вершины тесселяции', value: showVertices, set: setShowVertices },
  ];

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '95vw', height: '95vh', maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Заголовок */}
        <div className={styles.modalHeader}>
          <div style={{ width: 36 }} />
          <h2 className={styles.modalTitle}>
            🧪 Песочница геометрии
            {version > 1 && (
              <span style={{ marginLeft: 8, fontSize: 11, color: '#4ade80', fontWeight: 400 }}>⟳v{version}</span>
            )}
          </h2>
          <button className={styles.modalCloseBtn} onClick={handleClose} aria-label="Закрыть">×</button>
        </div>

        {/* Тело */}
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
          {/* 🎛 ЛЕВАЯ ПАНЕЛЬ */}
          <div style={{ width: 330, flexShrink: 0, overflowY: 'auto', paddingRight: 8, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 10, letterSpacing: 0.5 }}>
              🎛 Управление
            </div>

            {/* Выбор тайла */}
            <label style={{ display: 'block', color: '#ccc', fontSize: 13, marginBottom: 6 }}>Тайл</label>
            <select
              value={selectedTileId}
              onChange={(e) => handleTileClick(e.target.value)}
              style={{ width: '100%', background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '8px 10px', fontSize: 13, marginBottom: 12 }}
            >
              {tiles.map((tile) => (
                <option key={tile.id} value={tile.id}>{tile.id} (×{tile.quantity})</option>
              ))}
            </select>

            {/* Слои */}
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>👁 Слои</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {layerToggles.map(({ label, value, set }) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            <Legend />

            {/* ======================================== */}
            {/* 🧬 ГЕНЕРАТИВНАЯ ГЕОМЕТРИЯ */}
            {/* ======================================== */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
                🧬 Генеративная геометрия
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={enableGenerative} onChange={(e) => setEnableGenerative(e.target.checked)} />
                Включить генерацию из портов
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={overwrite} disabled={!enableGenerative} onChange={(e) => setOverwrite(e.target.checked)} />
                Перегенерировать поверх ручной геометрии
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ccc', fontSize: 13 }}>
                <span style={{ minWidth: 110 }}>🛣️ Ширина дорог: {roadWidth}</span>
                <input
                  type="number" min={4} max={40} step={1} value={roadWidth} disabled={!enableGenerative}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next)) setRoadWidth(Math.max(4, Math.min(40, next)));
                  }}
                  style={{ width: 70, background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, padding: '4px 6px' }}
                />
              </label>
            </div>

            {/* ======================================== */}
            {/* 📐 ТЕССЕЛЯЦИЯ */}
            {/* ======================================== */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
                📐 Тесселяция
              </div>
              <TessellationControls params={tessParams} onChange={patchTess} onReset={resetTess} />
            </div>

            {/* ======================================== */}
            {/* 🌊 ШУМ ПЕРЛИНА */}
            {/* ======================================== */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
                🌊 Шум Перлина
              </div>

              <ParamCheckbox
                label="Включить шум (органическая неровность)"
                checked={noiseEnabled}
                onChange={setNoiseEnabled}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ccc', fontSize: 13, opacity: noiseEnabled ? 1 : 0.4 }}>
                <span style={{ minWidth: 90 }}>🔑 Seed шума</span>
                <input
                  type="text" value={seedOverride} onChange={(e) => setSeedOverride(e.target.value)}
                  placeholder="по умолчанию artId" disabled={!noiseEnabled}
                  style={{ flex: 1, minWidth: 0, background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, padding: '4px 6px' }}
                />
              </label>

              <NoiseControls
                params={noiseParams}
                onChange={patchNoise}
                onReset={resetNoise}
                disabled={!noiseEnabled}
              />

              <div>
                <button
                  type="button"
                  onClick={handleCopyParams}
                  style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
                >
                  📋 Копировать все параметры (JSON)
                </button>
              </div>
            </div>

            {/* 📊 СТАТИСТИКА */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 12, color: '#888' }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📊 Статистика</div>
              <p style={{ margin: '4px 0' }}>✅ С геометрией: {geometryStats.withGeometry}</p>
              <p style={{ margin: '4px 0' }}>🌾 Derived (поля): {geometryStats.derived}</p>
              <p style={{ margin: '4px 0' }}>⬜ Без геометрии: {geometryStats.withoutGeometry}</p>
            </div>
          </div>

          {/* 🖼 ПРАВАЯ ЧАСТЬ */}
          <div style={{ flex: 1, minWidth: 320, overflow: 'auto', paddingLeft: 8 }}>
            {selectedTile ? (
              <>
                <div key={version} style={{ display: 'flex', justifyContent: 'center' }}>
                  <SandboxTileView
                    tile={selectedTile}
                    size={360}
                    showGrid={showGrid}
                    showAxes={showAxes}
                    showSpots={showSpots}
                    showPorts={showPorts}
                    showGeometry={showGeometry}
                    enableGenerative={enableGenerative}
                    overwrite={overwrite}
                    roadWidth={roadWidth}
                    seedOverride={seedOverride}
                    noiseEnabled={noiseEnabled}
                    noise={deferredNoise}
                    tessParams={deferredTess}
                    showVertices={showVertices}
                  />
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: '#aaa' }}>
                  <p style={{ margin: '4px 0', color: '#fff', fontWeight: 600 }}>
                    {selectedTile.id}
                    {selectedTile.artId && selectedTile.artId !== selectedTile.id
                      ? ` (art: ${selectedTile.artId})`
                      : ''}{' '}
                    (×{selectedTile.quantity})
                  </p>
                  {selectedTile.features.map((feat) => {
                    const kind = feat.geometry?.kind ?? 'none';
                    const statusIcon = kind === 'derived' ? '🌾' : kind === 'none' ? '⬜' : '✅';
                    return (
                      <p key={feat.id} style={{ margin: '2px 0' }}>
                        <span style={{ color: getFeatureFill(feat) }}>{statusIcon} {feat.id}</span>
                        {' · '}{feat.type}{' · '}{kind}
                        {feat.ports.length > 0 && (
                          <>{' · ports: ['}{feat.ports.join(', ')}{']'}</>
                        )}
                      </p>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ color: '#888', fontSize: 14, padding: 24, textAlign: 'center' }}>
                Нет выбранных тайлов
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeometrySandbox;