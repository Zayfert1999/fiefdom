// packages/client/src/hooks/useLocalClock.ts
// 🕐 Шахматные часы ЛОКАЛЬНОЙ игры (на одном устройстве).
//
// Логика — та же FischerClock, что на сервере в онлайн-игре. Хук следит за фазой хода:
//   placeTile / placeMeeple — часы текущего игрока идут (окно принятия решения);
//   endTurn                 — ход сделан: часы стоят, к банку добавляется инкремент;
//   startTurn / gameOver    — часы стоят.
// Когда банк заканчивается, вызывается expireLocalTurn (тайл выбрасывается, ход переходит).
// Таймер выключен (gameTimeControl === null) или игра сетевая — хук ничего не делает.
//
// Интерфейс получает часы через store.clockSnapshot — так же, как в онлайн-игре,
// поэтому GameHUD не различает режимы.

import { useEffect, useRef } from 'react';
import { FischerClock } from '@fiefdom/shared/core/fischerClock';
import { useGameStore } from '@/state/useGameStore';

/** Небольшой запас, чтобы таймер сработал уже после фактического истечения банка */
const FLAG_MARGIN_MS = 30;

export function useLocalClock(): void {
  const roomId = useGameStore(s => s.roomId);
  const timeControl = useGameStore(s => s.gameTimeControl);
  const phase = useGameStore(s => s.phase);
  const currentTurn = useGameStore(s => s.currentTurn);
  const gameStartTime = useGameStore(s => s.gameStartTime);

  const clockRef = useRef<FischerClock | null>(null);
  /** Какой партии принадлежат часы (gameStartTime): новая партия → новые банки */
  const gameKeyRef = useRef<number | null>(null);

  useEffect(() => {
    const store = useGameStore.getState();

    // Не локальная игра с таймером — часы не нужны
    if (roomId !== null || timeControl === null || gameStartTime === null || phase === 'lobby') {
      if (clockRef.current !== null) {
        clockRef.current = null;
        gameKeyRef.current = null;
        if (roomId === null) store.setClockSnapshot(null);
      }
      return;
    }

    // Новая партия (или первый запуск после загрузки сохранения) → свежие банки
    if (clockRef.current === null || gameKeyRef.current !== gameStartTime) {
      clockRef.current = new FischerClock(store.players.map(p => p.id), timeControl);
      gameKeyRef.current = gameStartTime;
    }
    const clock = clockRef.current;
    const now = Date.now();
    const currentId = store.players[currentTurn]?.id;
    let flagTimer: number | null = null;

    switch (phase) {
      case 'placeTile':
      case 'placeMeeple': {
        if (currentId === undefined) break;
        // Возврат из placeMeeple в placeTile (откат хода) часы не сбрасывает
        if (clock.activePlayerId !== currentId) clock.start(currentId, now);

        const remaining = clock.remainingMs(currentId, now);
        flagTimer = window.setTimeout(
          () => useGameStore.getState().expireLocalTurn(),
          remaining + FLAG_MARGIN_MS
        );
        break;
      }
      case 'endTurn':
        clock.commit(now); // ход сделан: стоп + инкремент
        break;
      default:
        clock.stop(now); // startTurn / gameOver
    }

    store.setClockSnapshot({
      banksMs: clock.snapshot(now),
      activePlayerId: clock.activePlayerId,
      receivedAt: now,
    });

    return () => {
      if (flagTimer !== null) window.clearTimeout(flagTimer);
    };
  }, [roomId, timeControl, phase, currentTurn, gameStartTime]);
}
