// packages/client/src/hooks/useLocalClock.ts
// 🕐 Шахматные часы ЛОКАЛЬНОЙ игры (на одном устройстве).
//
// Логика — та же FischerClock, что на сервере в онлайн-игре:
//   • ход начался (фаза placeTile / placeMeeple) — часы игрока идут;
//   • ход сделан (фаза endTurn) — часы стоят, к банку добавляется инкремент;
//   • банк исчерпан — игрок ПРОИГРЫВАЕТ: expireLocalTurn выводит его из партии.
//
// Почему store.subscribe, а не useEffect по фазе: если в ходе нет завершённых регионов,
// confirmMeeple синхронно проходит endTurn → startTurn. React показал бы эффекту только
// итоговую фазу, и инкремент за ход терялся. Подписка на store видит КАЖДОЕ изменение.
//
// Интерфейс получает часы через store.clockSnapshot — так же, как в онлайн-игре,
// поэтому GameHUD не различает режимы. Таймер выключен или игра сетевая — хук ничего не делает.

import { useEffect } from 'react';
import { FischerClock } from '@fiefdom/shared/core/fischerClock';
import { useGameStore } from '@/state/useGameStore';

type GameState = ReturnType<typeof useGameStore.getState>;

/** Небольшой запас, чтобы таймер сработал уже после фактического истечения банка */
const FLAG_MARGIN_MS = 30;

/** Идёт окно хода: игрок размещает тайл или выбирает мипла */
const isTurnPhase = (phase: GameState['phase']): boolean =>
  phase === 'placeTile' || phase === 'placeMeeple';

export function useLocalClock(): void {
  useEffect(() => {
    let clock: FischerClock | null = null;
    /** Какой партии принадлежат часы (gameStartTime): новая партия → новые банки */
    let gameKey: number | null = null;
    let flagTimer: number | null = null;

    const clearFlag = () => {
      if (flagTimer !== null) {
        window.clearTimeout(flagTimer);
        flagTimer = null;
      }
    };

    const publish = (state: GameState, now: number) => {
      if (!clock) return;
      state.setClockSnapshot({
        banksMs: clock.snapshot(now),
        activePlayerId: clock.activePlayerId,
        receivedAt: now,
      });
    };

    const sync = (state: GameState, prev: GameState | null) => {
      const timeControl = state.gameTimeControl;
      const isLocalTimedGame =
        state.roomId === null &&
        timeControl !== null &&
        state.gameStartTime !== null &&
        state.phase !== 'lobby';

      // Не локальная игра с таймером — часы не нужны
      if (!isLocalTimedGame) {
        if (clock !== null) {
          clock = null;
          gameKey = null;
          clearFlag();
          if (state.roomId === null) state.setClockSnapshot(null);
        }
        return;
      }

      // Новая партия (или первый запуск после загрузки сохранения) → свежие банки
      if (clock === null || gameKey !== state.gameStartTime) {
        clock = new FischerClock(state.players.map(p => p.id), timeControl);
        gameKey = state.gameStartTime;
      }

      const now = Date.now();
      const currentId = state.players[state.currentTurn]?.id;
      const inTurn = isTurnPhase(state.phase);
      const wasInTurn = prev !== null && isTurnPhase(prev.phase);

      if (inTurn) {
        // Ход нового игрока (placeTile ↔ placeMeeple одного игрока часы не трогают)
        if (currentId !== undefined && clock.activePlayerId !== currentId) {
          clock.start(currentId, now);
          clearFlag();
          flagTimer = window.setTimeout(
            () => useGameStore.getState().expireLocalTurn(),
            clock.remainingMs(currentId, now) + FLAG_MARGIN_MS
          );
          publish(state, now);
        }
      } else if (wasInTurn) {
        // Окно хода закрылось. endTurn — ход сделан (+инкремент);
        // иначе (startTurn / gameOver) — ход пропущен или игра окончена, бонуса нет.
        clearFlag();
        if (state.phase === 'endTurn') clock.commit(now);
        else clock.stop(now);
        publish(state, now);
      }
    };

    sync(useGameStore.getState(), null);
    const unsubscribe = useGameStore.subscribe((state, prev) => sync(state, prev));

    return () => {
      unsubscribe();
      clearFlag();
    };
  }, []);
}
