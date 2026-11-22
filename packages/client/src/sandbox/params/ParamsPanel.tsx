// packages/client/src/sandbox/params/ParamsPanel.tsx
// ============================================
// 🎛 ЛЕВАЯ ПАНЕЛЬ ПАРАМЕТРОВ
// ============================================
// Сворачиваемые блоки (ParamGroup) в три категории: «Геометрия тайла»,
// «Шум», «3D». Панель только отображает параметры и зовёт `actions`
// из useSandboxParams; своего состояния параметров у неё нет.
// ============================================
import { useCallback, useMemo } from 'react';
import type { ShieldAnchor } from '@/core/geometry';
import type { GeometryParams } from '@/core/geometry/geometryParams';
import { GEOMETRY_PARAMS_WARNINGS } from '@/core/geometry/loadedGeometryParams';
import type { SandboxParamsActions } from '../state/useSandboxParams';
import type { SandboxTile } from '../types';
import { ParamCategory, ParamGroup, collapseAllParamGroups, paramsDiffer } from './ParamGroup';
import { SandboxParamsBar } from './SandboxParamsBar';
import {
  MeshControls,
  NoiseByTypeControls,
  NoiseControls,
  ParamCheckbox,
  PlazaControls,
  ShapeControls,
  SpotControls,
  TerrainControls,
  TessellationControls,
  TileOverrideControls,
  WallControls,
} from './controls';

interface ParamsPanelProps {
  params: GeometryParams;
  /** Что лежит в файле сейчас (для жёлтых точек «изменено») */
  savedParams: GeometryParams;
  dirty: boolean;
  actions: SandboxParamsActions;
  tiles: readonly SandboxTile[];
  selectedTile: SandboxTile | null;
  noiseEnabled: boolean;
  onNoiseEnabledChange: (value: boolean) => void;
  /** Временный seed для примерки: действует на все тайлы, пока не закреплён за тайлом */
  seedOverride: string;
  onSeedOverrideChange: (value: string) => void;
}

export const ParamsPanel = ({
  params,
  savedParams,
  dirty,
  actions,
  tiles,
  selectedTile,
  noiseEnabled,
  onNoiseEnabledChange: setNoiseEnabled,
  seedOverride,
  onSeedOverrideChange: setSeedOverride,
}: ParamsPanelProps) => {
  const {
    patchShapes, patchNoise, patchTess, patchPlaza, patchSpots, patchMesh, patchWalls, setNoiseByType,
    resetNoise, resetTess, resetPlaza, resetShapes, resetSpots, resetMesh, resetWalls,
    handleSaved, handleLoaded, handleRevert, handleResetDefaults,
  } = actions;

  // Короткие псевдонимы для панелей
  const noiseParams = params.noise;
  const tessParams = params.tessellation;
  const plazaParams = params.plaza;
  const meshParams = params.mesh;

  // Какие блоки отличаются от файла (жёлтая точка в заголовке свёрнутого блока)
  const changed = useMemo(() => {
    const meshWithoutTerrain = (m: GeometryParams['mesh']) => ({ ...m, terrain: undefined });
    return {
      shapes: paramsDiffer(params.shapes, savedParams.shapes),
      tessellation: paramsDiffer(params.tessellation, savedParams.tessellation),
      plaza: paramsDiffer(params.plaza, savedParams.plaza),
      spots: paramsDiffer(params.spots, savedParams.spots),
      noise: paramsDiffer([params.noise, params.noiseByType], [savedParams.noise, savedParams.noiseByType]),
      tiles: paramsDiffer(params.tiles, savedParams.tiles),
      mesh: paramsDiffer(meshWithoutTerrain(params.mesh), meshWithoutTerrain(savedParams.mesh)),
      terrain: paramsDiffer(params.mesh.terrain, savedParams.mesh.terrain),
      walls: paramsDiffer(params.walls, savedParams.walls),
    };
  }, [params, savedParams]);

  // ============================================
  // 📌 НАСТРОЙКИ ВЫБРАННОГО ТАЙЛА
  // ============================================
  const selectedArtId = selectedTile ? (selectedTile.artId ?? selectedTile.id) : null;

  const handleRandomSeed = useCallback(() => {
    setSeedOverride(`s${Math.random().toString(36).slice(2, 8)}`);
  }, [setSeedOverride]);

  /** Закрепляет примеряемый seed за artId выбранного тайла */
  const handlePinSeed = useCallback(() => {
    const seed = seedOverride.trim();
    if (!selectedArtId || !seed) return;
    actions.pinSeed(selectedArtId, seed);
    setSeedOverride('');
    console.log(`📌 [Sandbox] Seed "${seed}" закреплён за ${selectedArtId}`);
  }, [actions, seedOverride, selectedArtId, setSeedOverride]);

  const handleClearPin = useCallback(() => {
    if (selectedArtId) actions.clearPin(selectedArtId);
  }, [actions, selectedArtId]);

  const handleShieldAnchor = useCallback(
    (anchor: ShieldAnchor | undefined) => {
      if (selectedArtId) actions.setShieldAnchor(selectedArtId, anchor);
    },
    [actions, selectedArtId]
  );

  const selectedHasShield = selectedTile
    ? selectedTile.features.some((f) => f.type === 'city' && f.shieldSpot !== undefined)
    : false;

  // ============================================
  // 📊 СТАТИСТИКА
  // ============================================
  const geometryStats = useMemo(() => {
    // Нарисованная вручную геометрия в данных: больше не используется (см. generators/index.ts)
    let legacyManual = 0;
    let derived = 0;
    let withoutGeometry = 0;
    for (const tile of tiles) {
      for (const feat of tile.features) {
        if (feat.geometry?.kind === 'derived') derived++;
        else if (feat.geometry) legacyManual++;
        else withoutGeometry++;
      }
    }
    return { legacyManual, withoutGeometry, derived };
  }, [tiles]);

  return (
    <div style={{ width: 350, flexShrink: 0, overflowY: 'auto', paddingRight: 8, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Шапка панели */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>🎛 Параметры</span>
        <button
          type="button"
          onClick={collapseAllParamGroups}
          title="Свернуть все блоки параметров"
          style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          ⊟ Свернуть всё
        </button>
      </div>

      {/* 💾 Файл параметров */}
      <ParamGroup
        id="file"
        title="💾 Файл параметров"
        meta={dirty ? 'не сохранено' : 'сохранено'}
        changed={dirty}
      >
        <SandboxParamsBar
          params={params}
          dirty={dirty}
          fileWarnings={GEOMETRY_PARAMS_WARNINGS}
          onSaved={handleSaved}
          onLoad={handleLoaded}
          onRevert={handleRevert}
          onResetDefaults={handleResetDefaults}
        />
      </ParamGroup>

      {/* ======================================== */}
      {/* ГЕОМЕТРИЯ ТАЙЛА: до шума */}
      {/* ======================================== */}
      <ParamCategory title="Геометрия тайла">
        <ParamGroup id="shapes" title="🏗 Формы" changed={changed.shapes}>
          <ShapeControls params={params.shapes} onChange={patchShapes} onReset={resetShapes} />
        </ParamGroup>

        <ParamGroup id="tessellation" title="📐 Тесселяция" changed={changed.tessellation}>
          <TessellationControls params={tessParams} onChange={patchTess} onReset={resetTess} />
        </ParamGroup>

        <ParamGroup id="plaza" title="🏛 Площади" changed={changed.plaza}>
          <PlazaControls params={plazaParams} onChange={patchPlaza} onReset={resetPlaza} />
        </ParamGroup>

        <ParamGroup id="spots" title="📍 Споты мипла и щита" changed={changed.spots}>
          <SpotControls params={params.spots} onChange={patchSpots} onReset={resetSpots} />
        </ParamGroup>
      </ParamCategory>

      {/* ======================================== */}
      {/* ШУМ */}
      {/* ======================================== */}
      <ParamCategory title="Шум">
        <ParamGroup
          id="noise"
          title="🌊 Шум Перлина"
          meta={noiseEnabled ? 'вкл' : 'выкл'}
          changed={changed.noise}
        >
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

          <NoiseByTypeControls
            byType={params.noiseByType}
            base={params.noise}
            onChange={setNoiseByType}
            disabled={!noiseEnabled}
          />
        </ParamGroup>

        {selectedArtId && (
          <ParamGroup
            id="tile-override"
            title={`📌 Тайл ${selectedArtId}`}
            meta={params.tiles[selectedArtId]?.seed ? 'seed закреплён' : undefined}
            changed={changed.tiles}
          >
            <TileOverrideControls
              artId={selectedArtId}
              override={params.tiles[selectedArtId]}
              hasShield={selectedHasShield}
              onShieldAnchor={handleShieldAnchor}
              previewSeed={seedOverride}
              overriddenCount={Object.keys(params.tiles).length}
              onRandomize={handleRandomSeed}
              onPin={handlePinSeed}
              onClear={handleClearPin}
            />
          </ParamGroup>
        )}
      </ParamCategory>

      {/* ======================================== */}
      {/* 3D */}
      {/* ======================================== */}
      <ParamCategory title="3D">
        <ParamGroup id="mesh" title="🧱 Меш" changed={changed.mesh}>
          <MeshControls params={meshParams} onChange={patchMesh} onReset={resetMesh} />
        </ParamGroup>

        <ParamGroup
          id="terrain"
          title="⛰️ Рельеф полей"
          meta={meshParams.terrain.enabled ? 'вкл' : 'выкл'}
          changed={changed.terrain}
        >
          <TerrainControls params={meshParams.terrain} onChange={(terrain) => patchMesh({ terrain })} />
        </ParamGroup>

        <ParamGroup
          id="walls"
          title="🏰 Городские стены"
          meta={params.walls.enabled ? 'вкл' : 'выкл'}
          changed={changed.walls}
        >
          <div style={{ fontSize: 10.5, color: '#888', lineHeight: 1.3 }}>
            Смотреть: вкладка «3D доска». Кнопка «🏰 Найти доску с городом» подберёт доску с замкнутым городом.
          </div>
          <WallControls params={params.walls} onChange={patchWalls} onReset={resetWalls} />
        </ParamGroup>
      </ParamCategory>

      {/* 📊 СТАТИСТИКА */}
      <ParamCategory title="Данные">
        <ParamGroup id="stats" title="📊 Статистика">
          <div style={{ fontSize: 12, color: '#888' }}>
            <p style={{ margin: '4px 0' }} title="Не используется: геометрия строится из портов">🗄 Ручная геометрия в данных (устарела): {geometryStats.legacyManual}</p>
            <p style={{ margin: '4px 0' }}>🌾 Derived (поля): {geometryStats.derived}</p>
            <p style={{ margin: '4px 0' }}>⬜ Без геометрии: {geometryStats.withoutGeometry}</p>
          </div>
        </ParamGroup>
      </ParamCategory>
    </div>
  );
};
