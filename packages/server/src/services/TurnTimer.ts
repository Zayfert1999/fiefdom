// packages/server/src/services/TurnTimer.ts
// 🌟 Таймер на ход. Работает ТОЛЬКО на сервере.
// По истечении — авто-действие (пропуск/авто-установка).

import { logger } from '../utils/logger';

export class TurnTimer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Запустить таймер.
   * @param seconds Длительность хода (0 = таймер выключен)
   * @param onTick Колбэк каждую секунду (для отправки остатка клиентам)
   * @param onExpire Колбэк по истечении (авто-действие)
   */
  start(seconds: number, onTick: (remaining: number) => void, onExpire: () => void): void {
    if (seconds <= 0) {
      logger.info('[Timer]', 'Таймер выключен (0 сек)');
      return;
    }
    this.stop(); // сбрасываем предыдущий

    let remaining = seconds;
    logger.info('[Timer]', `Таймер запущен: ${seconds} сек`);

    this.intervalId = setInterval(() => {
      remaining -= 1;
      onTick(remaining);
      if (remaining <= 0) {
        this.stop();
        logger.warn('[Timer]', '⏰ Время вышло → авто-действие');
        onExpire();
      }
    }, 1000);

    // Страховочный setTimeout на случай сбоя interval
    this.timerId = setTimeout(() => {
      this.stop();
      onExpire();
    }, seconds * 1000 + 500);
  }

  stop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
  }
}