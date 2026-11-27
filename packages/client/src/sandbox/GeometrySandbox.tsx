// packages/client/src/sandbox/GeometrySandbox.tsx
// ============================================
// 🧪 ПЕСОЧНИЦА ГЕОМЕТРИИ ТАЙЛОВ (только dev)
// ============================================
// Оболочка: модальное окно, вкладки правой части и склейка панелей.
// Логика живёт рядом:
//   • state/useSandboxParams.ts — параметры (geometryParams.json), операции над ними
//   • params/ParamsPanel.tsx    — левая панель: сворачиваемые блоки параметров
//   • view/                     — вкладка «Тайл»: 2D схема, 3D, диагностика, слои
//   • board/                    — вкладки «Галерея», «2D доска», «3D доска»
//
// Правая часть, четыре режима:
//   • «Тайл»     — один тайл (2D + 3D), выбор тайла, слои и легенда, список проблем
//   • «Галерея»  — все тайлы сеткой с метриками
//   • «2D доска» — случайная доска, подсветка несовпадений на стыках
//   • «3D доска» — та же доска в 3D (инстансинг, тени, пикинг клеток)
//
// 💾 Параметры сохраняются в geometryParams.json через dev-сервер Vite
//    (см. vite.config.ts). В прод-сборку песочница не попадает: App.tsx
//    подключает её только при import.meta.env.DEV.
// ============================================
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { useLiveTiles } from '@/hooks/useLiveTiles';
import type { AuditPipelineOptions } from '@/core/geometry/geometryAudit';
import styles from '@/components/styles/modal.module.css';
import { GeometryGallery } from './board/GeometryGallery';
import { ParamsPanel } from './params/ParamsPanel';
import { useSandboxParams } from './state/useSandboxParams';
import { DEFAULT_TILE_LAYERS, type SandboxTile, type SandboxViewMode, type TileLayers } from './types';
import { SandboxTileView } from './view/SandboxTileView';
import { TileToolbar } from './view/TileToolbar';
import { getFeatureFill } from './view/colors';

const VIEW_TABS: ReadonlyArray<readonly [SandboxViewMode, string]> = [
  ['tile', '🔍 Тайл'],
  ['gallery', '🖼 Галерея'],
  ['seams', '🗺 2D доска'],
  ['board3d', '🧱 3D доска'],
];

export const GeometrySandbox = () => {
  const setLobbyScreen = useGameStore((s) => s.setLobbyScreen);
  const tiles: readonly SandboxTile[] = useLiveTiles();

  // ============================================
  // 🎯 ВЫБОР ТАЙЛА И ВКЛАДКА
  // ============================================
  const [selectedTileId, setSelectedTileId] = useState<string>(tiles[0]?.id ?? '');
  const [viewMode, setViewMode] = useState<SandboxViewMode>('tile');
  const [layers, setLayers] = useState<TileLayers>(DEFAULT_TILE_LAYERS);

  // ============================================
  // 🧬 ГЕНЕРАТИВНАЯ ГЕОМЕТРИЯ
  // ============================================
  /** Временный seed для примерки: действует на все тайлы, пока не закреплён за тайлом */
  const [seedOverride, setSeedOverride] = useState('');
  const [noiseEnabled, setNoiseEnabled] = useState(true);

  // ============================================
  // 🎛 ПАРАМЕТРЫ ГЕОМЕТРИИ (geometryParams.json)
  // ============================================
  const { params, savedParams, deferredParams, tileParams, isPending, dirty, actions } = useSandboxParams();

  // Галерея и 2D доска считаются теми же настройками, что и одиночный тайл
  const pipeline = useMemo<AuditPipelineOptions>(
    () => ({ geometryParams: tileParams, noiseEnabled, seedOverride }),
    [tileParams, noiseEnabled, seedOverride]
  );

  // ============================================
  // 🔄 ВЕРСИЯ ДЛЯ HOT-RELOAD
  // ============================================
  const [version, setVersion] = useState(0);

  const selectedTile = useMemo(
    () => tiles.find((t) => t.id === selectedTileId) ?? null,
    [selectedTileId, tiles]
  );

  // ============================================
  // 🧪 ЛОГИ И СИНХРОНИЗАЦИЯ
  // ============================================
  useEffect(() => {
    console.log('🧪 [Sandbox] Компонент смонтирован');
    return () => { console.log('🧪 [Sandbox] Компонент размонтирован'); };
  }, []);

  useEffect(() => {
    console.log(
      `⚙️ [Sandbox] Параметры: ` +
      `noise=${noiseEnabled}, seedOverride="${seedOverride}"`
    );
  }, [noiseEnabled, seedOverride]);

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

  const handleOpenFromGallery = useCallback((id: string) => {
    setSelectedTileId(id);
    setViewMode('tile');
    console.log(`🧪 [Sandbox] Открыт из галереи: ${id}`);
  }, []);

  const handleToggleLayer = useCallback((key: keyof TileLayers, value: boolean) => {
    setLayers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleClose = useCallback(() => {
    console.log('🔙 [Sandbox] Закрытие песочницы');
    setLobbyScreen('modeSelect');
  }, [setLobbyScreen]);

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
          <ParamsPanel
            params={params}
            savedParams={savedParams}
            dirty={dirty}
            actions={actions}
            tiles={tiles}
            selectedTile={selectedTile}
            noiseEnabled={noiseEnabled}
            onNoiseEnabledChange={setNoiseEnabled}
            seedOverride={seedOverride}
            onSeedOverrideChange={setSeedOverride}
          />

          {/* 🖼 ПРАВАЯ ЧАСТЬ */}
          <div style={{ flex: 1, minWidth: 320, overflow: 'auto', paddingLeft: 8 }}>
            {/* Режим просмотра */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {VIEW_TABS.map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  style={{
                    background: viewMode === mode ? '#2563eb' : '#111827',
                    color: '#e5e7eb',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 🔍 Инструменты вкладки «Тайл»: выбор тайла, слои, легенда */}
            {viewMode === 'tile' && (
              <TileToolbar
                tiles={tiles}
                selectedTileId={selectedTileId}
                onSelectTile={handleTileClick}
                layers={layers}
                onToggleLayer={handleToggleLayer}
              />
            )}

            {viewMode !== 'tile' ? (
              <GeometryGallery
                mode={viewMode}
                tiles={tiles}
                pipeline={pipeline}
                isPending={isPending}
                meshParams={tileParams.mesh}
                wallParams={deferredParams.walls}
                townParams={deferredParams.town}
                onOpenTile={handleOpenFromGallery}
              />
            ) : selectedTile ? (
              <>
                <div key={version} style={{ display: 'flex', justifyContent: 'center' }}>
                  <SandboxTileView
                    tile={selectedTile}
                    size={360}
                    layers={layers}
                    seedOverride={seedOverride}
                    noiseEnabled={noiseEnabled}
                    params={tileParams}
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
