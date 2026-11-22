// packages/client/src/sandbox/view/SandboxTileView.tsx
// ============================================
// 👁️ ВЬЮ ОДНОГО ТАЙЛА В ПЕСОЧНИЦЕ
// ============================================
// Генерирует геометрию тайла по текущим параметрам (фичи → тесселяция + шум →
// аудит) и раскладывает результат по трём представлениям:
//   • TileSvgView     — 2D схема
//   • Tile3DView      — 3D меш
//   • TileDiagnostics — метрики, споты, проблемы
// ============================================
import { memo, useMemo } from 'react';
import { generateFeatureGeometries, processTileGeometry } from '@/core/geometry';
import { auditGeometry } from '@/core/geometry/geometryAudit';
import { resolveTileParams, type GeometryParams } from '@/core/geometry/geometryParams';
import type { TileFeature } from '@fiefdom/shared/core/types';
import type { SandboxTile, TileLayers } from '../types';
import { getFeatureLayer } from './colors';
import { Tile3DView } from './Tile3DView';
import { TileDiagnostics } from './TileDiagnostics';
import { TileSvgView } from './TileSvgView';

interface SandboxTileViewProps {
  tile: SandboxTile;
  size: number;
  layers: TileLayers;
  // Генеративная геометрия
  seedOverride?: string;
  noiseEnabled: boolean;
  /** Все параметры геометрии (тесселяция, шум, площади, меш, настройки тайлов) */
  params: GeometryParams;
}

export const SandboxTileView = memo(({
  tile,
  size,
  layers,
  seedOverride,
  noiseEnabled,
  params,
}: SandboxTileViewProps) => {
  // ============================================
  // 🔑 SEED (для шума, не для генераторов)
  // ============================================
  // Параметры именно этого тайла: общие + закреплённый seed + шум по artId
  const tileParams = useMemo(
    () => resolveTileParams(params, tile.artId ?? tile.id),
    [params, tile.artId, tile.id]
  );
  const seed = useMemo(
    () => seedOverride?.trim() || tileParams.seed || tile.artId || tile.id,
    [seedOverride, tileParams.seed, tile.artId, tile.id]
  );
  const { shapes } = params;

  // ============================================
  // 🧬 ГЕНЕРАЦИЯ ГЕОМЕТРИИ (БЕЗ seed и jitter)
  // ============================================
  const generation = useMemo(() => {
    console.log(`🧬 [Sandbox] Генерация: tile="${tile.id}"`);

    // Геометрия всегда генерируется из портов (нарисованная в данных — лишь запасная)
    const gen = generateFeatureGeometries(tile.features, { shapes });

    const generatedIds = new Set(gen.geometries.keys());
    const features: TileFeature[] = tile.features.map((feature) => {
      const geometry = gen.geometries.get(feature.id);
      return geometry ? { ...feature, geometry } : feature;
    });

    if (gen.warnings.length > 0) {
      console.warn(`⚠️ [Sandbox] Предупреждения для "${tile.id}":`, gen.warnings);
    }

    return { features, warnings: gen.warnings, generatedIds };
  }, [tile, shapes]);

  // ============================================
  // 🏭 ПРОЦЕССОР С ШУМОМ ПЕРЛИНА
  // ============================================
  const result = useMemo(() => {
    console.log(`🏭 [Sandbox] Процессор: "${tile.id}", noise=${noiseEnabled}`);

    // 🌟 Все параметры приходят из панелей песочницы
    return processTileGeometry(generation.features, {
      noiseSeed: noiseEnabled ? seed : undefined,
      noise: { ...tileParams.noise, byType: tileParams.noiseByType },
      tessellation: params.tessellation,
      plaza: params.plaza,
    });
  }, [generation.features, tile.id, seed, noiseEnabled, tileParams, params.tessellation, params.plaza]);

  // ============================================
  // 🧱 ПОРЯДОК ОТРИСОВКИ
  // ============================================
  const orderedFeatures = useMemo(
    () => [...generation.features].sort(
      (a, b) => getFeatureLayer(a.type) - getFeatureLayer(b.type)
    ),
    [generation.features]
  );

  // Аудит готового результата: самопересечения, торцы дорог, поля без полигонов...
  const audit = useMemo(
    () =>
      auditGeometry({
        tileId: tile.id,
        artId: tile.artId,
        seed,
        features: generation.features,
        result,
        tessellation: params.tessellation,
        spots: params.spots,
        warnings: generation.warnings,
      }),
    [tile.id, tile.artId, seed, generation.features, generation.warnings, result, params.tessellation, params.spots]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 📐 2D SVG ВИД */}
        <TileSvgView
          size={size}
          tile={tile}
          layers={layers}
          orderedFeatures={orderedFeatures}
          generatedIds={generation.generatedIds}
          result={result}
          audit={audit}
          meepleRadius={params.spots.meepleRadius}
        />

        {/* 🎮 3D ВИД */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ marginBottom: 8, color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>3D</div>
          <Tile3DView result={result} size={size} features={generation.features} meshParams={params.mesh} />
        </div>
      </div>

      <TileDiagnostics
        size={size}
        result={result}
        orderedFeatures={orderedFeatures}
        audit={audit}
        warnings={generation.warnings}
        meepleRadius={params.spots.meepleRadius}
      />
    </div>
  );
});
SandboxTileView.displayName = 'SandboxTileView';
