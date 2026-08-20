// packages/client/src/components/lobby/SessionSettings.tsx
// 🌟 Переиспользуемый компонент настроек сессии.
// Используется в LocalLobby и NetworkLobby.
// Controlled-компонент: значения и колбэки приходят через пропсы.

import styles from '@/components/styles/lobby.module.css';

interface SessionSettingsProps {
  // 🌟 Текущие значения
  showRegions: boolean;
  showDeadCells: boolean;
  enabledDeckView: boolean;
  // 🌟 Отключение (например, для не-хостов в сетевом лобби)
  disabled?: boolean;
  // 🌟 Колбэки изменения
  onToggleRegions: () => void;
  onToggleDeadCells: () => void;
  onToggleDeckView: () => void;
}

export const SessionSettings = ({
  showRegions,
  showDeadCells,
  enabledDeckView,
  disabled = false,
  onToggleRegions,
  onToggleDeadCells,
  onToggleDeckView,
}: SessionSettingsProps) => {
  return (
    <div className={styles.settingsPanel}>
      <h3 className={styles.sectionTitle}>⚙️ Настройки</h3>

      {/* 🗺️ Показывать регионы */}
      <label className={styles.settingRow}>
        <input
          type="checkbox"
          checked={showRegions}
          onChange={onToggleRegions}
          disabled={disabled}
          className={styles.settingCheckbox}
        />
        <span className={styles.settingLabel}>🗺️ Показывать регионы</span>
      </label>

      {/* 💀 Показывать мёртвые клетки */}
      <label className={styles.settingRow}>
        <input
          type="checkbox"
          checked={showDeadCells}
          onChange={onToggleDeadCells}
          disabled={disabled}
          className={styles.settingCheckbox}
        />
        <span className={styles.settingLabel}>💀 Показывать мёртвые клетки</span>
      </label>

      {/* 📦 Просмотр колоды */}
      <label className={styles.settingRow}>
        <input
          type="checkbox"
          checked={enabledDeckView}
          onChange={onToggleDeckView}
          disabled={disabled}
          className={styles.settingCheckbox}
        />
        <span className={styles.settingLabel}>📦 Просмотр колоды</span>
      </label>
    </div>
  );
};