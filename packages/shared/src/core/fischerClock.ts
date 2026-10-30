// packages/shared/src/core/fischerClock.ts
// 🌟 Шахматные часы с инкрементом (система Фишера) — единая логика для
// сервера (онлайн-игра) и клиента (локальная игра).
//
// У каждого игрока — «банк» времени на всю партию. Банк тикает только пока игрок
// принимает решение (его ход); после хода к банку добавляется инкремент.
// Если банк закончился — игрок «упал по времени» (isFlagged): играть дальше он не может
// и становится зрителем (его очки и миплы на доске остаются, в итогах — обычное место).
//
// Класс чистый: время всегда передаётся параметром now (мс), поэтому логика
// детерминирована и тестируется без таймеров и без привязки к Date.

export interface TimeControl {
  /** Основное время на всю партию, секунд */
  baseSeconds: number;
  /** Добавка к банку после каждого хода, секунд */
  incrementSeconds: number;
}

/** Допустимые значения (используются слайдерами и серверной валидацией) */
export const TIME_CONTROL_LIMITS = {
  baseSeconds: { min: 60, max: 1800, step: 60 },
  incrementSeconds: { min: 0, max: 30, step: 1 },
} as const;

/** Значение по умолчанию: 10 минут + 5 секунд за ход */
export const DEFAULT_TIME_CONTROL: TimeControl = {
  baseSeconds: 600,
  incrementSeconds: 5,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Приводит произвольный ввод к допустимому TimeControl (округление + ограничение диапазона) */
export function normalizeTimeControl(input?: Partial<TimeControl> | null): TimeControl {
  const { baseSeconds: base, incrementSeconds: inc } = TIME_CONTROL_LIMITS;
  const rawBase = Number(input?.baseSeconds);
  const rawInc = Number(input?.incrementSeconds);
  return {
    baseSeconds: Number.isFinite(rawBase)
      ? clamp(Math.round(rawBase), base.min, base.max)
      : DEFAULT_TIME_CONTROL.baseSeconds,
    incrementSeconds: Number.isFinite(rawInc)
      ? clamp(Math.round(rawInc), inc.min, inc.max)
      : DEFAULT_TIME_CONTROL.incrementSeconds,
  };
}

/** «10 мин + 5 с», «5 мин», «1 мин 30 с + 3 с» */
export function formatTimeControl(tc: TimeControl): string {
  const minutes = Math.floor(tc.baseSeconds / 60);
  const seconds = tc.baseSeconds % 60;
  const base = [minutes > 0 ? `${minutes} мин` : '', seconds > 0 ? `${seconds} с` : '']
    .filter(Boolean)
    .join(' ');
  return tc.incrementSeconds > 0 ? `${base} + ${tc.incrementSeconds} с` : base;
}

/** Часы для отображения: «9:58», «0:07», «1:05:00» */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export class FischerClock {
  private readonly banksMs = new Map<string, number>();
  private activeId: string | null = null;
  /** Момент (мс), с которого тикает банк активного игрока */
  private startedAt = 0;

  /**
   * @param initialBanksMs — банки игроков, если партия продолжается (загрузка сохранения);
   *   для игрока без записи (или с некорректным значением) выдаётся полный банк.
   */
  constructor(
    playerIds: readonly string[],
    private readonly control: TimeControl,
    initialBanksMs?: Readonly<Record<string, number>> | null
  ) {
    for (const id of playerIds) {
      const saved = initialBanksMs?.[id];
      this.banksMs.set(
        id,
        typeof saved === 'number' && Number.isFinite(saved) ? Math.max(0, Math.round(saved)) : control.baseSeconds * 1000
      );
    }
  }

  get timeControl(): TimeControl {
    return this.control;
  }

  get activePlayerId(): string | null {
    return this.activeId;
  }

  /** Запустить часы игрока (ход начался). Прежний активный игрок останавливается без бонуса. */
  start(playerId: string, now: number): void {
    if (!this.banksMs.has(playerId)) return;
    this.stop(now);

    this.activeId = playerId;
    this.startedAt = now;
  }

  /** Остановить часы без начисления инкремента (пропуск хода, пауза). Списывает прошедшее. */
  stop(now: number): void {
    if (this.activeId === null) return;
    const left = this.remainingMs(this.activeId, now);
    this.banksMs.set(this.activeId, left);
    this.activeId = null;
  }

  /** Ход сделан: остановить часы и добавить инкремент. @returns id игрока, чей ход завершён */
  commit(now: number): string | null {
    const id = this.activeId;
    if (id === null) return null;
    this.stop(now);
    this.banksMs.set(id, (this.banksMs.get(id) ?? 0) + this.control.incrementSeconds * 1000);
    return id;
  }

  /** Сколько миллисекунд осталось у игрока на момент now (для активного — с учётом тикающего времени) */
  remainingMs(playerId: string, now: number): number {
    const bank = this.banksMs.get(playerId) ?? 0;
    if (playerId !== this.activeId) return Math.max(0, bank);
    return Math.max(0, bank - Math.max(0, now - this.startedAt));
  }

  /** Время вышло? (игрок больше не может ходить) */
  isFlagged(playerId: string, now: number): boolean {
    return this.remainingMs(playerId, now) <= 0;
  }

  /** Банки всех игроков на момент now (мс, целые) */
  snapshot(now: number): Record<string, number> {
    const result: Record<string, number> = {};
    for (const id of this.banksMs.keys()) {
      result[id] = Math.round(this.remainingMs(id, now));
    }
    return result;
  }
}
