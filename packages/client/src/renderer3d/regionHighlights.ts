// packages/client/src/renderer3d/regionHighlights.ts
// ============================================
// 🎨 ЧТО ПОДСВЕЧИВАТЬ: РЕГИОНЫ С ВЛАДЕЛЬЦАМИ
// ============================================
// Логика выбора та же, что в SVG-RegionOverlay: подсвечивается фича, у
// региона которой есть владелец (мипл). Цвет штриховки — цвета игроков с
// наибольшим числом миплов в регионе (при равенстве — несколько полос).
//
// Отличие от SVG: там фичи склеивались в регион через clipPath, здесь
// подсветка рисуется отдельно на каждую фичу каждого тайла. Штриховка
// считается в мировых координатах, поэтому полосы продолжаются через
// границы тайлов, как один общий паттерн.
//
// Файл чистый (без React и стора) и тестируется в node; хук — в useRegionHighlights.ts.
// ============================================
import { rotateFeatures } from '@fiefdom/shared/core/tileUtils';
import type { RegionManager } from '@fiefdom/shared/core/regionManager';
import type { FeatureType, PlacedTile, Player, PreviewTile } from '@fiefdom/shared/core/types';

/** Цвет игрока, которого нет в списке (как в SVG-версии) */
const UNKNOWN_OWNER_COLOR = '#ffffff';

export interface FeatureHighlight {
  readonly featureId: string;
  /** Один цвет — сплошные полосы, несколько — чередование */
  readonly colors: readonly string[];
}

export interface RegionHighlights {
  /** Подсветка тайлов доски по ключу "x,y" */
  readonly byTile: ReadonlyMap<string, readonly FeatureHighlight[]>;
  /** Подсветка тайла-превью (его фичи в системе тайла без поворота) */
  readonly preview: readonly FeatureHighlight[];
}

export interface HighlightInput {
  readonly board: ReadonlyMap<string, PlacedTile>;
  readonly regionManager: Pick<RegionManager, 'getFeatureOwners' | 'getMetadata'>;
  readonly players: readonly Pick<Player, 'id' | 'color'>[];
  readonly visibleFeatureTypes: readonly FeatureType[];
  readonly previewTile: PreviewTile | null;
  /** Ключ "x,y" тайла, который сейчас падает (анимация установки): его подсветку пропускаем */
  readonly skipTileKey: string | null;
}

/** Цвета доминирующих владельцев региона; null — у региона нет владельца */
export function regionColors(
  regionManager: HighlightInput['regionManager'],
  featureKey: string,
  players: HighlightInput['players']
): string[] | null {
  const owners = regionManager.getFeatureOwners(featureKey);
  if (owners.length === 0) return null;

  const meta = regionManager.getMetadata(featureKey);
  if (!meta) return null;

  const countOf = (id: string): number => meta.meepleCounts.get(id) ?? 0;
  const maxCount = Math.max(...owners.map(countOf));
  const dominant = owners.filter((id) => countOf(id) === maxCount);
  const colors = dominant.map((id) => players.find((p) => p.id === id)?.color ?? UNKNOWN_OWNER_COLOR);

  // Порядок цветов не должен зависеть от порядка владельцев
  return dominant.length === 1 ? colors : [...colors].sort();
}

export function computeRegionHighlights(input: HighlightInput): RegionHighlights {
  const { board, regionManager, players, visibleFeatureTypes, previewTile, skipTileKey } = input;

  const byTile = new Map<string, FeatureHighlight[]>();
  for (const tile of board.values()) {
    const tileKey = `${tile.x},${tile.y}`;
    if (tileKey === skipTileKey) continue;

    const list: FeatureHighlight[] = [];
    for (const feature of tile.features) {
      if (!visibleFeatureTypes.includes(feature.type)) continue;
      const colors = regionColors(regionManager, `${tileKey}:${feature.id}`, players);
      if (colors) list.push({ featureId: feature.id, colors });
    }
    if (list.length > 0) byTile.set(tileKey, list);
  }

  const preview: FeatureHighlight[] = [];
  if (previewTile) {
    const tileKey = `${previewTile.x},${previewTile.y}`;
    for (const feature of rotateFeatures(previewTile.tile.features, previewTile.rotation)) {
      if (!visibleFeatureTypes.includes(feature.type)) continue;
      const colors = regionColors(regionManager, `${tileKey}:${feature.id}`, players);
      if (colors) preview.push({ featureId: feature.id, colors });
    }
  }

  return { byTile, preview };
}
