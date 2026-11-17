// packages/shared/src/core/applyRegions.ts
// 🌟 Единое применение завершённых регионов к игрокам.
// Раньше то же самое отдельно реализовывали ServerGameState.applyCompletedRegions и
// gameSlice.processCompletedRegionsInStore (с разными значениями по умолчанию).

import type { Player } from './types';
import type { RegionManager } from './regionManager';
import type { CompletedRegion } from './scoring';

export interface PlayerRegionDelta {
  score: number;
  pointsByCategory: Player['pointsByCategory'];
  /** Сколько миплов игрок получает обратно */
  meeplesReturned: number;
}

/**
 * Помечает регионы завершёнными в RegionManager (МУТИРУЕТ rm) и считает,
 * сколько очков и миплов получает каждый игрок. Игроков не меняет.
 *
 * Количество возвращаемых миплов берётся из метаданных региона ДО markComplete.
 */
export function settleRegions(
  rm: RegionManager,
  regions: CompletedRegion[]
): Map<string, PlayerRegionDelta> {
  const deltas = new Map<string, PlayerRegionDelta>();
  const deltaOf = (id: string): PlayerRegionDelta => {
    let d = deltas.get(id);
    if (!d) {
      d = { score: 0, pointsByCategory: { road: 0, city: 0, field: 0, monastery: 0 }, meeplesReturned: 0 };
      deltas.set(id, d);
    }
    return d;
  };

  for (const region of regions) {
    const meepleCounts = new Map(rm.getMetadata(region.rootKey)?.meepleCounts ?? []);

    for (const winnerId of region.winners) {
      const d = deltaOf(winnerId);
      d.score += region.points;
      d.pointsByCategory[region.type] += region.points;
    }
    for (const ownerId of region.allMeepleOwners) {
      deltaOf(ownerId).meeplesReturned += meepleCounts.get(ownerId) ?? 0;
    }

    rm.markComplete(region.rootKey, region.points);
  }

  return deltas;
}

/** Иммутабельно применяет дельты к списку игроков (для клиентского стора) */
export function applyDeltasToPlayers(
  players: Player[],
  deltas: Map<string, PlayerRegionDelta>
): Player[] {
  return players.map(p => {
    const d = deltas.get(p.id);
    if (!d) return p;
    return {
      ...p,
      score: p.score + d.score,
      meepleCount: p.meepleCount + d.meeplesReturned,
      pointsByCategory: {
        road: p.pointsByCategory.road + d.pointsByCategory.road,
        city: p.pointsByCategory.city + d.pointsByCategory.city,
        field: p.pointsByCategory.field + d.pointsByCategory.field,
        monastery: p.pointsByCategory.monastery + d.pointsByCategory.monastery,
      },
    };
  });
}
