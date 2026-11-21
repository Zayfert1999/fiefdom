// packages/client/src/state/slices/presentationSlice.ts
//
// 🎬 Слой показа подсчёта очков.
//
// Принцип: игровое состояние (board, players) меняется СРАЗУ и целиком — анимация
// его не трогает. Всё, что нужно для показа, живёт здесь отдельно:
//  • ghostMeeples  — миплы завершённых регионов, которые уже сняты с доски в состоянии,
//                    но ещё рисуются (waiting — стоят на месте, active — исчезают с «+N»);
//  • pendingScore  — очки, уже начисленные в состоянии, но ещё не «показанные» в счётчике;
//  • queuedRegionKeys — регионы, чья анимация стоит в очереди и ещё не началась
//                    (городские стены такого города ещё не растут);
//  • completionAnimations (из gameSlice) — обводка активного региона, камера, рост стен.
//
// Отображаемые очки = player.score − pendingScore[player.id], поэтому не важно,
// в каком порядке придут событие и state-update: итог всегда сходится к серверному score.
//
// Регионы играются строго по очереди (и из разных событий тоже — например, обычные
// регионы и затем финальный подсчёт не накладываются друг на друга).

import type { StateCreator } from 'zustand';
import type { GameStore } from '../useGameStore';
import type { CompletedRegion, RegionMeeple } from '@fiefdom/shared/core/scoring';
import { ANIMATION_TIMING } from '@fiefdom/shared/core/animationTiming';

export interface GhostMeeple extends RegionMeeple {
  id: string;
  regionKey: string;
  /** «+N» над мипла — только у первого мипла каждого победителя */
  points?: number;
  status: 'waiting' | 'active';
}

export interface PresentationSlice {
  ghostMeeples: GhostMeeple[];
  pendingScore: Record<string, number>;
  /**
   * Корни регионов, чьи анимации поставлены в очередь, но ещё не начались.
   * Регион завершён уже в состоянии (isComplete), а показ идёт по очереди: пока ключ здесь,
   * его городские стены не показываются, а после активации растут «из земли».
   */
  queuedRegionKeys: string[];

  /** Поставить анимации регионов в очередь. Состояние (очки, миплы) к этому моменту уже применено. */
  enqueueScoreAnimations: (regions: CompletedRegion[]) => void;
  /**
   * Промис, который выполняется, когда очередь доиграна.
   * true — доиграна (или пропущена), false — сброшена (игра закрыта/покинута).
   */
  whenScoreAnimationsIdle: () => Promise<boolean>;
  /** Мгновенно показать итог без анимации (вкладка скрыта, реконнект, game:over) */
  skipScoreAnimations: () => void;
  /** Полный сброс (выход из игры). Ожидающие получают false. */
  resetScoreAnimations: () => void;
}

interface QueueItem {
  region: CompletedRegion;
  deltas: Record<string, number>;
}

export const createPresentationSlice: StateCreator<GameStore, [], [], PresentationSlice> = (set) => {
  const queue: QueueItem[] = [];
  let running = false;
  /** Меняется при каждом сбросе: старый цикл видит несовпадение и тихо выходит */
  let epoch = 0;
  let cancelSleep: (() => void) | null = null;
  let waiters: Array<(completed: boolean) => void> = [];

  const sleep = (ms: number) =>
    new Promise<void>(resolve => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        cancelSleep = null;
        resolve();
      }
      cancelSleep = done;
    });

  const settleWaiters = (completed: boolean) => {
    const current = waiters;
    waiters = [];
    current.forEach(resolve => resolve(completed));
  };

  const clearAll = (completed: boolean) => {
    epoch++;
    queue.length = 0;
    running = false;
    cancelSleep?.();
    set({ ghostMeeples: [], pendingScore: {}, queuedRegionKeys: [], completionAnimations: [] });
    settleWaiters(completed);
  };

  const revealScore = (deltas: Record<string, number>) =>
    set(state => {
      const next = { ...state.pendingScore };
      for (const [playerId, delta] of Object.entries(deltas)) {
        const left = (next[playerId] ?? 0) - delta;
        if (left > 0) next[playerId] = left;
        else delete next[playerId];
      }
      return { pendingScore: next };
    });

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    const myEpoch = epoch;

    while (myEpoch === epoch && queue.length > 0) {
      const { region, deltas } = queue.shift()!;
      const key = region.rootKey;

      // Регион становится активным: обводка + миплы начинают исчезать
      set(state => ({
        completionAnimations: [...state.completionAnimations, { region, startTime: Date.now() }],
        queuedRegionKeys: state.queuedRegionKeys.filter(k => k !== key),
        ghostMeeples: state.ghostMeeples.map(g => (g.regionKey === key ? { ...g, status: 'active' as const } : g)),
      }));

      const revealAt = Math.round(ANIMATION_TIMING.regionMs * ANIMATION_TIMING.scoreRevealFraction);
      await sleep(revealAt);
      if (myEpoch !== epoch) return;
      revealScore(deltas);

      await sleep(ANIMATION_TIMING.regionMs - revealAt);
      if (myEpoch !== epoch) return;

      set(state => ({
        completionAnimations: state.completionAnimations.filter(a => a.region.rootKey !== key),
        ghostMeeples: state.ghostMeeples.filter(g => g.regionKey !== key),
      }));
    }

    if (myEpoch === epoch) {
      running = false;
      settleWaiters(true);
    }
  }

  // Свёрнутая вкладка: таймеры троттлятся, а CSS-анимации замирают — показываем итог сразу
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearAll(true);
    });
  }

  return {
    ghostMeeples: [],
    pendingScore: {},
    queuedRegionKeys: [],

    enqueueScoreAnimations: (regions) => {
      if (regions.length === 0) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      const ghosts: GhostMeeple[] = [];
      const items: QueueItem[] = [];
      const pendingAdd: Record<string, number> = {};

      for (const region of regions) {
        const pointsShownFor = new Set<string>();
        for (const meeple of region.meeples) {
          const isWinner = region.winners.includes(meeple.playerId);
          const showPoints = isWinner && !pointsShownFor.has(meeple.playerId);
          if (showPoints) pointsShownFor.add(meeple.playerId);

          ghosts.push({
            ...meeple,
            id: `${region.rootKey}|${meeple.tileKey}`,
            regionKey: region.rootKey,
            points: showPoints ? region.points : undefined,
            status: 'waiting',
          });
        }

        const deltas: Record<string, number> = {};
        for (const winnerId of region.winners) {
          deltas[winnerId] = (deltas[winnerId] ?? 0) + region.points;
          pendingAdd[winnerId] = (pendingAdd[winnerId] ?? 0) + region.points;
        }
        items.push({ region, deltas });
      }

      set(state => {
        const pendingScore = { ...state.pendingScore };
        for (const [playerId, add] of Object.entries(pendingAdd)) {
          pendingScore[playerId] = (pendingScore[playerId] ?? 0) + add;
        }
        return {
          pendingScore,
          ghostMeeples: [...state.ghostMeeples, ...ghosts],
          queuedRegionKeys: [...state.queuedRegionKeys, ...items.map(item => item.region.rootKey)],
        };
      });

      queue.push(...items);
      void drain();
    },

    whenScoreAnimationsIdle: () =>
      !running && queue.length === 0
        ? Promise.resolve(true)
        : new Promise<boolean>(resolve => { waiters.push(resolve); }),

    skipScoreAnimations: () => clearAll(true),
    resetScoreAnimations: () => clearAll(false),
  };
};
