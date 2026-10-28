// packages/client/src/hooks/useActivityReporter.ts
// 👋 «Я на месте» для онлайн-игры.
//
// Банк времени по Фишеру — это время на всю партию, и ждать, пока AFK-игрок сожжёт его
// целиком, остальные не должны. Поэтому пока ходит текущий игрок, клиент сообщает серверу
// о любых его действиях (мышь, клавиши, касания, колесо). Нет активности — сервер
// предупреждает и пропускает ход задолго до конца банка.
//
// Сигнал отправляется не чаще раза в REPORT_INTERVAL_MS и только в свой ход.

import { useEffect } from 'react';
import { useGameStore } from '@/state/useGameStore';

const REPORT_INTERVAL_MS = 2000;

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function useActivityReporter(): void {
  const inRoom = useGameStore(s => s.roomId !== null);
  const isMyTurn = useGameStore(s => s.playerId !== null && s.players[s.currentTurn]?.id === s.playerId);
  const isGameOver = useGameStore(s => s.phase === 'gameOver' || s.phase === 'lobby');
  const sendActivity = useGameStore(s => s.sendActivity);

  useEffect(() => {
    if (!inRoom || !isMyTurn || isGameOver) return;

    let lastSentAt = 0;
    const report = () => {
      const now = Date.now();
      if (now - lastSentAt < REPORT_INTERVAL_MS) return;
      lastSentAt = now;
      sendActivity();
    };

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, report, { passive: true });
    }
    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, report);
      }
    };
  }, [inRoom, isMyTurn, isGameOver, sendActivity]);
}
