// packages/shared/src/core/animationTiming.ts
// 🌟 Единый источник таймингов анимации подсчёта очков.
// Используется сервером (ожидание перед передачей хода), клиентом (очередь анимаций)
// и CSS (через --comp-reg-anim-completion в core/cssVariables.ts).

export const ANIMATION_TIMING = {
  /** Пауза, чтобы все успели увидеть поставленного мипла, прежде чем регионы замкнутся */
  meepleBeatMs: 1000,
  /** Длительность анимации одного завершённого региона */
  regionMs: 3000,
  /** На какой доле анимации региона очки «засчитываются» в счётчике игрока (0..1) */
  scoreRevealFraction: 0.25,
} as const;

/**
 * Сколько длится разбор хода для зрителей: пауза на мипла (если он был поставлен)
 * и последовательная анимация каждого завершённого региона.
 * Сервер ждёт ровно столько перед выдачей тайла следующему игроку — иначе часы
 * следующего игрока тикали бы, пока остальные смотрят анимацию.
 */
export function resolutionDurationMs(opts: { meeplePlaced: boolean; regionCount: number }): number {
  return (opts.meeplePlaced ? ANIMATION_TIMING.meepleBeatMs : 0) + opts.regionCount * ANIMATION_TIMING.regionMs;
}
