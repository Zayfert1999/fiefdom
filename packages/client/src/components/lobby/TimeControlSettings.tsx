// packages/client/src/components/lobby/TimeControlSettings.tsx
// 🕐 Переиспользуемая настройка времени на партию (шахматные часы с инкрементом).
// Используется и в LocalLobby, и в NetworkLobby — как и SessionSettings.
// Controlled-компонент: значение и колбэк приходят через пропсы.
//
// Онлайн-игра: таймер обязателен (`allowDisable` не передаётся — переключателя нет).
// Локальная игра: `allowDisable` показывает переключатель «Таймер», выключенный
// таймер = value === null.

import {
  TIME_CONTROL_LIMITS,
  DEFAULT_TIME_CONTROL,
  normalizeTimeControl,
  formatTimeControl,
  type TimeControl,
} from '@fiefdom/shared/core/fischerClock';
import styles from '@/components/styles/timeControl.module.css';
import lobbyStyles from '@/components/styles/lobby.module.css';

interface TimeControlSettingsProps {
  /** Текущее значение; null — таймер выключен (допустимо только при allowDisable) */
  value: TimeControl | null;
  onChange: (value: TimeControl | null) => void;
  /** Показать переключатель «Таймер вкл/выкл» (локальная игра) */
  allowDisable?: boolean;
  /** Заблокировать (например, для не-хостов в сетевом лобби) */
  disabled?: boolean;
}

/** Готовые пресеты: быстрый выбор вместо двух слайдеров */
const PRESETS: ReadonlyArray<{ label: string; value: TimeControl }> = [
  { label: '⚡ 5 + 3', value: { baseSeconds: 300, incrementSeconds: 3 } },
  { label: '⏱️ 10 + 5', value: DEFAULT_TIME_CONTROL },
  { label: '🐢 20 + 10', value: { baseSeconds: 1200, incrementSeconds: 10 } },
];

const isSame = (a: TimeControl, b: TimeControl): boolean =>
  a.baseSeconds === b.baseSeconds && a.incrementSeconds === b.incrementSeconds;

export const TimeControlSettings = ({
  value,
  onChange,
  allowDisable = false,
  disabled = false,
}: TimeControlSettingsProps) => {
  const enabled = value !== null;
  const current = value ?? DEFAULT_TIME_CONTROL;
  const { baseSeconds: base, incrementSeconds: inc } = TIME_CONTROL_LIMITS;

  const update = (patch: Partial<TimeControl>) =>
    onChange(normalizeTimeControl({ ...current, ...patch }));

  return (
    <div className={lobbyStyles.settingsPanel}>
      <h3 className={lobbyStyles.sectionTitle}>🕐 Время на партию</h3>

      {/* Переключатель — только там, где таймер можно отключить */}
      {allowDisable && (
        <label className={lobbyStyles.settingRow}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange(e.target.checked ? current : null)}
            disabled={disabled}
            className={lobbyStyles.settingCheckbox}
          />
          <span className={lobbyStyles.settingLabel}>⏱️ Таймер (шахматные часы)</span>
        </label>
      )}

      {enabled && (
        <>
          <div className={styles.summary} aria-live="polite">
            {formatTimeControl(current)}
          </div>

          {/* Основное время */}
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>
              Основное время: <b>{Math.round(current.baseSeconds / 60)} мин</b>
            </span>
            <input
              type="range"
              className={styles.slider}
              min={base.min}
              max={base.max}
              step={base.step}
              value={current.baseSeconds}
              disabled={disabled}
              onChange={(e) => update({ baseSeconds: Number(e.target.value) })}
            />
          </label>

          {/* Инкремент */}
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>
              Добавка за ход: <b>+{current.incrementSeconds} с</b>
            </span>
            <input
              type="range"
              className={styles.slider}
              min={inc.min}
              max={inc.max}
              step={inc.step}
              value={current.incrementSeconds}
              disabled={disabled}
              onChange={(e) => update({ incrementSeconds: Number(e.target.value) })}
            />
          </label>

          <div className={styles.presets}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`${styles.preset} ${isSame(preset.value, current) ? styles.presetActive : ''}`}
                disabled={disabled}
                onClick={() => onChange(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <p className={styles.hint}>
            У каждого игрока свой банк времени на всю партию. Часы идут только во время его
            хода, после хода к банку добавляется бонус.
          </p>
        </>
      )}
    </div>
  );
};
