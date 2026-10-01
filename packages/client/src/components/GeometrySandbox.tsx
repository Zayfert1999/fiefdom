// packages/client/src/components/GeometrySandbox.tsx
// ============================================
// 🧪 ПЕСОЧНИЦА ГЕОМЕТРИИ ТАЙЛОВ (Dev-инструмент)
// ============================================
// Открывается через setLobbyScreen('geometrySandbox') из MainMenu.
//
// 🏭 Архитектурный принцип:
//   Песочница является ЧИСТЫМ ПОТРЕБИТЕЛЕМ данных геометрического процессора.
//   Вся тесселяция, булевы операции (обрезка) и вычисление полей 
//   происходят внутри processTileGeometry. Здесь происходит только рендеринг.
//
// Особенности рендеринга:
//   • Используется единая функция toPathD для генерации SVG path.
//   • Везде применяется fillRule="evenodd" для корректной отрисовки 
//     полигонов с дырками (например, поле вокруг монастыря).
//   • Hover-эффекты вынесены в изолированный CSS-класс.
// ============================================

import { useState, useMemo, memo, useCallback, useEffect } from 'react';
import { useLiveTiles } from '@/hooks/useLiveTiles';
import type { Tile, TileFeature } from '@fiefdom/shared/core/types';
import type { Point } from '@fiefdom/shared/core/geometry.types';
import { useGameStore } from '@/state/useGameStore';
import { processTileGeometry } from '@fiefdom/shared/core/geometryProcessor';
import { toPathD } from '@fiefdom/shared/core/geometryToSvg';
import styles from '@/components/styles/modal.module.css';

// ============================================
// 📐 КОНСТАНТЫ И НАСТРОЙКИ
// ============================================

/** Отступ портов за пределы тайла для лучшей видимости */
const PORT_OFFSET = 10;
const PORT_SPREAD = 33;

/** Координаты 12 портов по часовой стрелке, начиная с NW-угла */
const PORT_COORDS: ReadonlyArray<readonly [number, number]> = [
    [-PORT_SPREAD, -50 - PORT_OFFSET], // 0: N левый
    [0, -50 - PORT_OFFSET],            // 1: N центр
    [PORT_SPREAD, -50 - PORT_OFFSET],  // 2: N правый
    [50 + PORT_OFFSET, -PORT_SPREAD],  // 3: E верхний
    [50 + PORT_OFFSET, 0],             // 4: E центр
    [50 + PORT_OFFSET, PORT_SPREAD],   // 5: E нижний
    [PORT_SPREAD, 50 + PORT_OFFSET],   // 6: S правый
    [0, 50 + PORT_OFFSET],             // 7: S центр
    [-PORT_SPREAD, 50 + PORT_OFFSET],  // 8: S левый
    [-50 - PORT_OFFSET, PORT_SPREAD],  // 9: W нижний
    [-50 - PORT_OFFSET, 0],            // 10: W центр
    [-50 - PORT_OFFSET, -PORT_SPREAD], // 11: W верхный
];

/** Цвета фич для визуальной дифференциации */
const FEATURE_COLORS: Record<string, string> = {
    city: '#a67c52',       // Коричневый (стены городов)
    road: '#c9b38c',       // Бежевый (дороги)
    field: '#6a994e',      // Зелёный (поля)
    monastery: '#d47843',  // Красновато-охра (монастыри)
};

const PLAZA_COLOR = '#b8a88a'; // Серо-бежевый для площадей

// ============================================
// 🖼️ КОМПОНЕНТЫ РЕНДЕРИНГА
// ============================================

/**
 * Рендерит одну фичу (город, монастырь или дорогу) из готовых данных.
 * 🌟 Ключевое: использует <path> с fillRule="evenodd" вместо <polygon>,
 * что гарантирует корректную отрисовку даже если в будущем появятся сложные контуры.
 */
interface FeatureShapeProps {
    feature: TileFeature;
    areaPolygon?: Point[];
    clippedPolygons?: readonly Point[][][];
}

const FeatureShape = memo(({ feature, areaPolygon, clippedPolygons }: FeatureShapeProps) => {
    const geo = feature.geometry;
    if (!geo || geo.kind === 'derived') return null;

    const fillColor = FEATURE_COLORS[feature.type] ?? '#888';

    // ── AREA: замкнутая область (город, монастырь) ──
    if (geo.kind === 'area') {
        if (!areaPolygon) {
            console.warn(`⚠️ [Sandbox] Нет тесселированного полигона для area "${feature.id}"`);
            return null;
        }
        return (
            <path
                d={toPathD(areaPolygon)}
                fill={fillColor}
                fillOpacity={0.9}
                fillRule="evenodd"
                className="hoverable-shape"
                data-feature-id={feature.id}
            />
        );
    }

    // ── LINE: дорога (обрезанная процессором) ──
    if (geo.kind === 'line') {
        if (!clippedPolygons || clippedPolygons.length === 0) {
            console.warn(`⚠️ [Sandbox] Нет обрезанных полигонов для дороги "${feature.id}"`);
            return null;
        }
        return (
            <g data-feature-id={feature.id}>
                {clippedPolygons.map((polygon, i) => (
                    <path
                        key={i}
                        d={toPathD(polygon)}
                        fill={fillColor}
                        fillOpacity={0.85}
                        fillRule="evenodd"
                        className="hoverable-shape"
                    />
                ))}
            </g>
        );
    }

    return null;
});
FeatureShape.displayName = 'FeatureShape';

/** Рендерит порты фичи за пределами границ тайла */
const FeaturePorts = memo(({ feature }: { feature: TileFeature }) => {
    const color = FEATURE_COLORS[feature.type] ?? '#888';

    return (
        <g data-feature-id={feature.id}>
            {feature.ports.map((port) => {
                const [px, py] = PORT_COORDS[port];
                return (
                    <g key={port}>
                        <circle cx={px} cy={py} r={3.5} fill={color} stroke="#fff" strokeWidth={1} />
                        <text
                            x={px}
                            y={py + 1.2}
                            textAnchor="middle"
                            fontSize="4"
                            fill="#fff"
                            fontWeight="bold"
                            pointerEvents="none"
                        >
                            {port}
                        </text>
                    </g>
                );
            })}
        </g>
    );
});
FeaturePorts.displayName = 'FeaturePorts';

/** Статичная разметка сторон света (N/E/S/W) вокруг SVG */
const CompassLabels = memo(() => (
    <>
        <div style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>N</div>
        <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>S</div>
        <div style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>E</div>
        <div style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>W</div>
    </>
));
CompassLabels.displayName = 'CompassLabels';

/** Информационная легенда с расшифровкой цветов и элементов */
const Legend = memo(() => (
    <div style={{ marginTop: 12, padding: 12, background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: 12, color: '#bbb' }}>
        <h4 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: 13 }}>📖 Легенда</h4>
        <p style={{ margin: '4px 0', color: '#888', fontStyle: 'italic' }}>
            Система координат: <code style={{ color: '#4a90e2' }}>[-50, 50]</code>
        </p>
        <p style={{ margin: '2px 0', fontSize: 11 }}>
            Центр тайла = <code style={{ color: '#ff5252' }}>(0, 0)</code>
        </p>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(FEATURE_COLORS).map(([type, color]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span>
                        {type === 'city' ? 'Город' : type === 'road' ? 'Дорога' : type === 'field' ? 'Поле (вычисл.)' : type === 'monastery' ? 'Монастырь' : type}
                    </span>
                </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: PLAZA_COLOR, border: '1px solid #fff', flexShrink: 0 }} />
                <span>Площадь (перекрёсток)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff4081', border: '1px solid #fff', flexShrink: 0 }} />
                <span>Спот мипла</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: '#ffd700', border: '1px solid #fff', flexShrink: 0 }} />
                <span>Щит</span>
            </div>
        </div>
    </div>
));
Legend.displayName = 'Legend';

// ============================================
// 🎨 ОСНОВНОЙ VIEW ТАЙЛА
// ============================================
interface SandboxTileViewProps {
    tile: Tile;
    size: number;
    showGrid: boolean;
    showAxes: boolean;
    showSpots: boolean;
    showPorts: boolean;
    showGeometry: boolean;
}

const SandboxTileView = memo(({
    tile, size, showGrid, showAxes, showSpots, showPorts, showGeometry
}: SandboxTileViewProps) => {
    
    // 🏭 ЕДИНСТВЕННЫЙ ВЫЗОВ ПРОЦЕССОРА
    // Все тяжёлые вычисления инкапсулированы здесь.
    const result = useMemo(() => {
        console.log(`🧪 [Sandbox] Запуск процессора для "${tile.id}"`);
        const r = processTileGeometry(tile.features);
        console.log(
            `✅ [Sandbox] Готово: ` +
            `${r.tessellation.areas.size} областей, ` +
            `${r.clipping.clippedLines.size} дорог, ` +
            `${r.decorations.plazas.length} площадей, ` +
            `${r.assignments.fieldGeometries.size} полей`
        );
        return r;
    }, [tile]);

    const { tessellation, decorations, clipping, assignments } = result;

    return (
        <div style={{ position: 'relative', width: size, height: size, padding: 24, boxSizing: 'content-box' }}>
            {/* 🌟 Изолированные стили для hover-эффектов. 
                Используем класс .hoverable-shape, чтобы не задеть сетку или оси. */}
            <style>{`
                .sandbox-svg .hoverable-shape {
                    transition: stroke 0.15s ease, stroke-width 0.15s ease, filter 0.15s ease;
                    stroke: transparent;
                    stroke-width: 0;
                    pointer-events: visiblePainted; 
                }
                .sandbox-svg .hoverable-shape:hover {
                    stroke: #ffffff;
                    stroke-width: 1.5;
                    stroke-linejoin: round;
                    cursor: crosshair;
                }
            `}</style>

            <CompassLabels />

            <svg
                className="sandbox-svg"
                width={size}
                height={size}
                viewBox="-65 -65 130 130"
                style={{ display: 'block', overflow: 'visible', background: '#1a1a2e', borderRadius: 8 }}
            >
                {/* Слой 0: Сетка 10×10 */}
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

                {/* Слой 0.5: Оси координат */}
                {showAxes && (
                    <g>
                        <line x1={0} y1={-50} x2={0} y2={50} stroke="#ff5252" strokeWidth="0.6" opacity="0.5" />
                        <line x1={-50} y1={0} x2={50} y2={0} stroke="#4caf50" strokeWidth="0.6" opacity="0.5" />
                        <circle cx={0} cy={0} r={1.5} fill="#ff5252" />
                    </g>
                )}

                {/* Слой 0.8: Граница тайла */}
                <rect x={-50} y={-50} width={100} height={100} fill="#6a994e" fillOpacity={0.15} stroke="#444" strokeWidth={1} />

                {/* 🌟 Слой 1: Вычисленные поля (ВНИЗУ) 
                    fillRule="evenodd" критически важен для отображения дырок (например, вокруг монастыря) */}
                {showGeometry && Array.from(assignments.fieldGeometries.entries()).map(([featureId, polygons]) => (
                    <g key={`field-${featureId}`} data-feature-id={featureId}>
                        {polygons.map((polygon, i) => (
                            <path
                                key={i}
                                d={toPathD(polygon)}
                                fill={FEATURE_COLORS.field}
                                fillOpacity={0.6}
                                fillRule="evenodd"
                                className="hoverable-shape"
                            />
                        ))}
                    </g>
                ))}

                {/* 🌟 Слой 2: Фичи (города, монастыри, обрезанные дороги) */}
                {showGeometry && tile.features
                    .filter(f => f.geometry && f.geometry.kind !== 'derived')
                    .map(feat => (
                        <FeatureShape
                            key={feat.id}
                            feature={feat}
                            areaPolygon={tessellation.areas.get(feat.id)}
                            clippedPolygons={clipping.clippedLines.get(feat.id)}
                        />
                    ))
                }

                {/* 🌟 Слой 3: Процедурные площади (поверх дорог) */}
                {showGeometry && decorations.plazas.map((plaza, i) => (
                    <path
                        key={`plaza-${i}`}
                        d={toPathD(plaza)}
                        fill={PLAZA_COLOR}
                        fillOpacity={0.9}
                        fillRule="evenodd"
                        data-decoration="plaza"
                        className="hoverable-shape"
                    />
                ))}

                {/* 🌟 Слой 4: Порты фич */}
                {showPorts && tile.features.map(feat => (
                    <FeaturePorts key={`ports-${feat.id}`} feature={feat} />
                ))}

                {/* 🌟 Слой 5: Споты миплов и щиты */}
                {showSpots && tile.features.map(feat => (
                    <g key={`spots-${feat.id}`}>
                        <circle cx={feat.meepleSpot.x} cy={feat.meepleSpot.y} r={3} fill="#ff4081" stroke="#fff" strokeWidth={0.8} />
                        <text x={feat.meepleSpot.x} y={feat.meepleSpot.y - 5} textAnchor="middle" fontSize="3.5" fill="#fff" fontWeight="bold">
                            {feat.id}
                        </text>

                        {feat.shieldSpot && (
                            <rect
                                x={feat.shieldSpot.x - 2.5}
                                y={feat.shieldSpot.y - 2.5}
                                width={5}
                                height={5}
                                fill="#ffd700"
                                stroke="#fff"
                                strokeWidth={0.5}
                                rx={1}
                            />
        )}
                    </g>
                ))}
            </svg>
        </div>
    );
});
SandboxTileView.displayName = 'SandboxTileView';

// ============================================
// 🧪 ГЛАВНЫЙ КОНТЕЙНЕР ПЕСОЧНИЦЫ
// ============================================
export const GeometrySandbox = () => {
    const setLobbyScreen = useGameStore(s => s.setLobbyScreen);
    const tiles = useLiveTiles();

    const [selectedTileId, setSelectedTileId] = useState<string>(tiles[0]?.id ?? '');
    const [showGrid, setShowGrid] = useState(true);
    const [showAxes, setShowAxes] = useState(true);
    const [showSpots, setShowSpots] = useState(true);
    const [showPorts, setShowPorts] = useState(true);
    const [showGeometry, setShowGeometry] = useState(true);

    const selectedTile = useMemo(() => tiles.find(t => t.id === selectedTileId) ?? null, [selectedTileId, tiles]);

    // Глобальная статистика по всем тайлам в наборе
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

    // Счётчик версий для принудительного перемонтирования при HMR
    const [version, setVersion] = useState(0);
    useEffect(() => {
        console.log(`🔄 [Sandbox] Данные тайлов обновлены, версия: ${version + 1}`);
        setVersion(v => v + 1);
    }, [tiles]);

    const handleTileClick = useCallback((id: string) => {
        setSelectedTileId(id);
        console.log(`🧪 [Sandbox] Выбран тайл: ${id}`);
    }, []);

    const handleClose = useCallback(() => {
        console.log('🔙 [Sandbox] Закрытие песочницы');
        setLobbyScreen('modeSelect');
    }, [setLobbyScreen]);

    return (
        <div className={styles.modalOverlay} onClick={handleClose}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '90vh' }}>
                <div className={styles.modalHeader}>
                    <div style={{ width: 36 }} />
                    <h2 className={styles.modalTitle}>
                        🧪 Песочница геометрии
                        {version > 1 && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: '#4ade80', fontWeight: 400 }}>
                                ⟳v{version}
                            </span>
                        )}
                    </h2>
                    <button className={styles.modalCloseBtn} onClick={handleClose} aria-label="Закрыть">✕</button>
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', overflow: 'auto' }}>
                    {/* Левая панель: управление и статистика */}
                    <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <h3 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: 14 }}>Тайлы ({tiles.length})</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                            {tiles.map(tile => (
                                <button
                                    key={tile.id}
                                    onClick={() => handleTileClick(tile.id)}
                                    style={{
                                        padding: '4px 8px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
                                        background: tile.id === selectedTileId ? '#4a90e2' : 'rgba(255,255,255,0.1)',
                                        color: '#fff', transition: 'background 0.2s',
                                    }}
                                >
                                    {tile.id.replace('tile_', '')}
                                </button>
                            ))}
                        </div>

                        <h3 style={{ color: '#fff', margin: '12px 0 8px 0', fontSize: 14 }}>Слои</h3>
                        {[
                            { label: '📐 Сетка', value: showGrid, set: setShowGrid },
                            { label: '➕ Оси', value: showAxes, set: setShowAxes },
                            { label: '🔶 Споты', value: showSpots, set: setShowSpots },
                            { label: '📍 Порты', value: showPorts, set: setShowPorts },
                            { label: '🎨 Геометрия', value: showGeometry, set: setShowGeometry },
                        ].map(({ label, value, set }) => (
                            <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ccc', fontSize: 13 }}>
                                <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
                                {label}
                            </label>
                        ))}

                        <Legend />

                        <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
                            <p style={{ margin: '4px 0' }}>✅ С геометрией: {geometryStats.withGeometry}</p>
                            <p style={{ margin: '4px 0' }}>🌾 Derived (поля): {geometryStats.derived}</p>
                            <p style={{ margin: '4px 0' }}>⬜ Без геометрии: {geometryStats.withoutGeometry}</p>
                        </div>
                    </div>

                    {/* Правая панель: превью тайла */}
                    <div style={{ flex: 1, minWidth: 320 }}>
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
                                    />
                                </div>
                                <div style={{ marginTop: 12, fontSize: 12, color: '#aaa' }}>
                                    <p style={{ margin: '4px 0', color: '#fff', fontWeight: 600 }}>
                                        {selectedTile.id} (×{selectedTile.quantity})
                                    </p>
                                    {selectedTile.features.map(feat => {
                                        const kind = feat.geometry?.kind ?? 'none';
                                        const statusIcon = kind === 'derived' ? '🌾' : kind === 'none' ? '⬜' : '✅';
                                        return (
                                            <p key={feat.id} style={{ margin: '2px 0' }}>
                                                <span style={{ color: FEATURE_COLORS[feat.type] ?? '#888' }}>●</span>{' '}
                                                {feat.id} ({feat.type}) — порты: [{feat.ports.join(', ')}] {statusIcon}
                                            </p>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <div style={{ color: '#888', display: 'flex', alignItems: 'center', height: 360 }}>
                                Тайл не найден
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};