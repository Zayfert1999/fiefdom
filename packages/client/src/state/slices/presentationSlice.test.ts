// packages/client/src/state/slices/presentationSlice.test.ts
// ============================================
// 🧪 ТЕСТЫ ОЧЕРЕДИ ПОКАЗА ПОДСЧЁТА: queuedRegionKeys
// ============================================
// queuedRegionKeys нужен городским стенам: регион завершён уже в состоянии, а показ идёт по
// очереди — пока регион ждёт своей очереди, его стены не растут.
// ============================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { CompletedRegion } from '@fiefdom/shared/core/scoring';
import { ANIMATION_TIMING } from '@fiefdom/shared/core/animationTiming';
import { createPresentationSlice, type PresentationSlice } from './presentationSlice';

// completionAnimations принадлежит gameSlice; слою показа достаточно, чтобы поле существовало
type TestState = PresentationSlice & { completionAnimations: { region: CompletedRegion; startTime: number }[] };

const makeStore = () =>
  createStore<TestState>()((set, get, api) => ({
    completionAnimations: [],
    ...createPresentationSlice(set as never, get as never, api as never),
  }));

const region = (rootKey: string): CompletedRegion => ({
  rootKey,
  type: 'city',
  points: 4,
  winners: [],
  allMeepleOwners: [],
  featureKeys: [rootKey],
  meeples: [],
});

describe('queuedRegionKeys', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('первый регион сразу активен, остальные ждут в очереди', () => {
    const store = makeStore();
    store.getState().enqueueScoreAnimations([region('a'), region('b'), region('c')]);

    const state = store.getState();
    expect(state.completionAnimations.map((a) => a.region.rootKey)).toEqual(['a']);
    expect(state.queuedRegionKeys).toEqual(['b', 'c']);
  });

  it('по ходу очереди ключ уходит из очереди ровно тогда, когда регион становится активным', async () => {
    const store = makeStore();
    store.getState().enqueueScoreAnimations([region('a'), region('b')]);

    await vi.advanceTimersByTimeAsync(ANIMATION_TIMING.regionMs);
    const state = store.getState();
    expect(state.completionAnimations.map((a) => a.region.rootKey)).toEqual(['b']);
    expect(state.queuedRegionKeys).toEqual([]);
  });

  it('когда очередь доиграна, список пуст и анимаций нет', async () => {
    const store = makeStore();
    store.getState().enqueueScoreAnimations([region('a'), region('b')]);

    await vi.advanceTimersByTimeAsync(ANIMATION_TIMING.regionMs * 2);
    expect(store.getState().queuedRegionKeys).toEqual([]);
    expect(store.getState().completionAnimations).toEqual([]);
  });

  it('новые регионы дописываются в хвост очереди', () => {
    const store = makeStore();
    store.getState().enqueueScoreAnimations([region('a'), region('b')]);
    store.getState().enqueueScoreAnimations([region('c')]);
    expect(store.getState().queuedRegionKeys).toEqual(['b', 'c']);
  });

  it('пропуск и сброс очищают очередь вместе с анимациями', () => {
    const store = makeStore();
    store.getState().enqueueScoreAnimations([region('a'), region('b')]);
    store.getState().skipScoreAnimations();
    expect(store.getState().queuedRegionKeys).toEqual([]);
    expect(store.getState().completionAnimations).toEqual([]);

    store.getState().enqueueScoreAnimations([region('c'), region('d')]);
    store.getState().resetScoreAnimations();
    expect(store.getState().queuedRegionKeys).toEqual([]);
  });

  it('пустой список регионов очередь не трогает', () => {
    const store = makeStore();
    store.getState().enqueueScoreAnimations([]);
    expect(store.getState().queuedRegionKeys).toEqual([]);
  });
});
