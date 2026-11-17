// packages/client/src/renderer3d/layers/RegionOverlayLayer3D.tsx
// ============================================
// 🎨 ПОДСВЕТКА РЕГИОНОВ (аналог SVG RegionOverlay + CompletionOverlay)
// ============================================
// • RegionOverlayLayer3D — штриховка в цветах владельцев на фичах поставленных
//   тайлов (тайл-превью подсвечивает PreviewTileLayer3D, потому что вращается
//   вместе с ним). Поля с рельефом — это общие меши регионов (fieldTerrain.ts):
//   подсвечивается регион целиком. Включается/выключается флагом showRegions плавно.
// • CompletionOverlay3D — золотая пульсация только что завершённых регионов
//   (в том числе полей).
// ============================================
import { memo, useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { FeatureOverlay } from '../FeatureOverlay';
import { parseFeatureKey } from '../boardMath';
import { useRegionHighlights } from '../useRegionHighlights';
import { getBundle } from '../tileBundles';
import { TileTransform } from '../TileTransform';
import { useFieldTerrain } from '../useFieldTerrain';

/** Непрозрачность штриховки (как .region-overlay.active .region-fill) */
const REGION_OPACITY = 0.7;
const COMPLETION_COLORS = ['#FFD700'] as const;

export const RegionOverlayLayer3D = memo(() => {
  const board = useGameStore((s) => s.board);
  const showRegions = useGameStore((s) => s.showRegions);
  const { byTile, fieldRegions } = useRegionHighlights();
  const terrain = useFieldTerrain();

  return (
    <>
      {/* Поля с рельефом: меш региона уже в мировых координатах */}
      {terrain.regions.map((region) => {
        const colors = fieldRegions.get(region.id);
        if (!colors) return null;
        return (
          <FeatureOverlay
            key={region.signature}
            mesh={region.mesh}
            featureId={region.id}
            colors={colors}
            opacity={showRegions ? REGION_OPACITY : 0}
          />
        );
      })}

      {[...byTile.entries()].map(([tileKey, highlights]) => {
        const tile = board.get(tileKey);
        const bundle = tile ? getBundle(tile.templateId) : null;
        if (!tile || !bundle) return null;

        return (
          <TileTransform key={tileKey} x={tile.x} y={tile.y} rotation={tile.rotation}>
            {highlights.map((highlight) => (
              <FeatureOverlay
                key={highlight.featureId}
                mesh={bundle.mesh}
                featureId={highlight.featureId}
                colors={highlight.colors}
                opacity={showRegions ? REGION_OPACITY : 0}
              />
            ))}
          </TileTransform>
        );
      })}
    </>
  );
});
RegionOverlayLayer3D.displayName = 'RegionOverlayLayer3D';

export const CompletionOverlay3D = memo(() => {
  const completionAnimations = useGameStore((s) => s.completionAnimations);
  const board = useGameStore((s) => s.board);
  const terrain = useFieldTerrain();

  // Регионы полей (общие меши), которые затронуты завершением: пульсирует регион целиком
  const fieldItems = useMemo(() => {
    if (terrain.regions.length === 0) return [];
    const completed = new Set(completionAnimations.flatMap(({ region }) => region.featureKeys));
    return terrain.regions.filter((region) => region.featureKeys.some((key) => completed.has(key)));
  }, [completionAnimations, terrain]);

  const items = useMemo(
    () =>
      completionAnimations.flatMap(({ region }) =>
        Array.from(region.featureKeys).flatMap((featureKey) => {
          const parts = parseFeatureKey(featureKey);
          const tile = parts ? board.get(`${parts.x},${parts.y}`) : undefined;
          return parts && tile ? [{ id: `${region.rootKey}|${featureKey}`, tile, featureId: parts.featureId }] : [];
        })
      ),
    [completionAnimations, board]
  );

  return (
    <>
      {fieldItems.map((region) => (
        <FeatureOverlay
          key={`field|${region.signature}`}
          mesh={region.mesh}
          featureId={region.id}
          colors={COMPLETION_COLORS}
          opacity={0.85}
          mode="pulse"
          lift={0.9}
        />
      ))}

      {items.map(({ id, tile, featureId }) => {
        const bundle = getBundle(tile.templateId);
        if (!bundle) return null;
        return (
          <TileTransform key={id} x={tile.x} y={tile.y} rotation={tile.rotation}>
            <FeatureOverlay
              mesh={bundle.mesh}
              featureId={featureId}
              colors={COMPLETION_COLORS}
              opacity={0.85}
              mode="pulse"
              lift={0.9}
            />
          </TileTransform>
        );
      })}
    </>
  );
});
CompletionOverlay3D.displayName = 'CompletionOverlay3D';