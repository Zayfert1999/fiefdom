// packages/client/src/components/DebugPanel.tsx
// 🐛 Панель отладки: информация о выбранном тайле, фичах и регионах.
// Открывается через Ctrl+клик на тайл.
import { useGameStore } from '@/state/useGameStore';
import { calculateMonasteryPoints, getAdjacentCitiesForField } from '@fiefdom/shared/core/scoring';
import styles from '@/components/styles/game.module.css';

// ============================================
// 🏷️ Конфигурация меток типов фич
// ============================================
const FEATURE_TAGS: Record<string, { label: string; className: string }> = {
  city: { label: '[City]', className: styles.debugFeatureTagCity },
  field: { label: '[Field]', className: styles.debugFeatureTagField },
  monastery: { label: '[Monastery]', className: styles.debugFeatureTagMonastery },
  road: { label: '[Road]', className: styles.debugFeatureTagRoad },
};

export const DebugPanel = () => {
  // ============================================
  // 🎯 Селекторы
  // ============================================
  const debugSelectedTile = useGameStore(s => s.debugSelectedTile);
  const board = useGameStore(s => s.board);
  const regionManager = useGameStore(s => s.regionManager);
  const players = useGameStore(s => s.players);
  const setDebugSelectedTile = useGameStore(s => s.setDebugSelectedTile);
  const debugForceEndGame = useGameStore(s => s.debugForceEndGame);
  const saveDebugGame = useGameStore(s => s.saveDebugGame);
  const loadDebugGame = useGameStore(s => s.loadDebugGame);

  // ============================================
  // 👁️ Видимость панели
  // ============================================
  if (!debugSelectedTile) return null;

  const { x, y } = debugSelectedTile;
  const tile = board.get(`${x},${y}`);

  // ============================================
  // ⚠️ Тайл не найден (edge case)
  // ============================================
  if (!tile) {
    return (
      <div className={styles.debugPanel}>
        <div className={styles.debugPanelHeader}>
          <h3 className={styles.debugPanelTitle}>🐛 Debug Panel</h3>
          <button
            onClick={debugForceEndGame}
            className={`${styles.debugIconButton} ${styles.debugIconButtonEnd}`}
            title="Принудительно завершить игру"
          >
            🏁
          </button>
        </div>
        <p>Тайл не найден в ({x}, {y})</p>
        <button
          onClick={() => setDebugSelectedTile(null)}
          className={styles.debugCloseBtn}
        >
          Закрыть
        </button>
      </div>
    );
  }

  // ============================================
  // 📦 Основной рендер
  // ============================================
  return (
    <div className={styles.debugPanel}>
      {/* Заголовок + кнопки действий */}
      <div className={styles.debugPanelHeader}>
        <h3 className={styles.debugPanelTitle}>🐛 Debug Panel</h3>
        <div className={styles.debugPanelButtons}>
          {/* 💾 Сохранить */}
          <button
            onClick={saveDebugGame}
            className={`${styles.debugIconButton} ${styles.debugIconButtonSave}`}
            title="Сохранить игру"
          >
            💾
          </button>
          {/* 📂 Загрузить */}
          <button
            onClick={loadDebugGame}
            className={`${styles.debugIconButton} ${styles.debugIconButtonLoad}`}
            title="Загрузить игру"
          >
            📂
          </button>
          {/* 🏁 Принудительно завершить */}
          <button
            onClick={debugForceEndGame}
            className={`${styles.debugIconButton} ${styles.debugIconButtonEnd}`}
            title="Принудительно завершить игру"
          >
            🏁
          </button>
        </div>
      </div>

      {/* 📍 Информация о тайле */}
      <div className={styles.debugSection}>
        <h4 className={styles.debugSectionTitle}>📍 Тайл</h4>
        <p><strong>ID:</strong> {tile.templateId}</p>
        <p><strong>Координаты:</strong> ({x}, {y})</p>
        <p><strong>Поворот:</strong> {tile.rotation}°</p>
        <p>
          <strong>Мипл:</strong>{' '}
          {tile.meeple
            ? `${players.find(p => p.id === tile.meeple?.playerId)?.name} (${tile.meeple?.color})`
            : 'Нет'}
        </p>
      </div>

      {/* 🎯 Фичи и регионы */}
      <div className={styles.debugSection}>
        <h4 className={styles.debugSectionTitle}>🎯 Фичи и регионы</h4>
        {tile.features.map((feature, idx) => {
          const featureKey = `${x},${y}:${feature.id}`;
          const owners = regionManager.getFeatureOwners(featureKey);
          const rootKey = regionManager.find(featureKey);
          const metadata = rootKey ? regionManager.getMetadata(rootKey) : undefined;
          const regionKeys = metadata ? Array.from(metadata.featureKeys) : [];

          // Вычисляем текущее состояние монастыря
          const monasteryState = feature.type === 'monastery'
            ? calculateMonasteryPoints(board, x, y)
            : null;

          // Специфичная информация для полей
          const fieldState = feature.type === 'field' && rootKey
            ? getAdjacentCitiesForField(board, regionManager, rootKey)
            : null;

          // Статистика по полю
          let fieldStats = null;
          if (fieldState) {
            const total = fieldState.size;
            let completed = 0;
            for (const isComplete of fieldState.values()) {
              if (isComplete) completed++;
            }
            fieldStats = { total, completed };
          }

          // Получаем конфигурацию метки для типа фичи
          const tag = FEATURE_TAGS[feature.type] ?? { label: `[${feature.type}]`, className: '' };

          return (
            <div key={idx} className={styles.debugFeature}>
              {/* Заголовок фичи с меткой типа */}
              <p>
                <span className={`${styles.debugFeatureTag} ${tag.className}`}>
                  {tag.label}
                </span>
                <strong>#{idx + 1} {feature.id}</strong>
              </p>

              <p>Направления: {feature.directions.join(', ')}</p>
              <p>
                Владельцы (локально):{' '}
                {owners.length > 0
                  ? owners.map(id => {
                    const player = players.find(p => p.id === id);
                    return `${player?.name} (${player?.color})`;
                  }).join(', ')
                  : 'Нет'}
              </p>

              {/* Специфичная информация для монастыря */}
              {feature.type === 'monastery' && monasteryState && (
                <p style={{ color: '#d4a373' }}>
                  Соседей вокруг: {monasteryState.points - 1} / 8
                </p>
              )}

              {/* Специфичная информация для поля */}
              {feature.type === 'field' && fieldStats && (
                <p style={{ color: '#4CAF50' }}>
                  Всего/Завершённых городов в регионе: {fieldStats.total}/{fieldStats.completed}
                </p>
              )}

              {metadata && (
                <>
                  <p>Размер региона: {metadata.segments} тайл(ов)</p>

                  {/* Щит показываем только для городов */}
                  {metadata.type === 'city' && (
                    <p style={{ color: '#4a90e2' }}>
                      Щит: {metadata.hasShield ? 'Да' : 'Нет'}
                    </p>
                  )}

                  <p style={{ color: metadata.isComplete ? '#4CAF50' : '#FF9800' }}>
                    Статус завершения (DSU): {metadata.isComplete ? 'ЗАВЕРШЁН' : 'НЕ ЗАВЕРШЁН'}
                  </p>

                  {metadata.isComplete && <p>Очки в метаданных: {metadata.points}</p>}

                  <div>
                    <p>Владельцы региона и миплы:</p>
                    {metadata.meepleCounts.size > 0 ? (
                      <ul>
                        {Array.from(metadata.meepleCounts.entries()).map(([playerId, count]) => {
                          const player = players.find(p => p.id === playerId);
                          return (
                            <li key={playerId}>
                              {player?.name} ({player?.color}): {count} мипл(ов)
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p style={{ fontSize: '11px' }}>Нет миплов</p>
                    )}
                  </div>

                  <details>
                    <summary>Ключи региона ({regionKeys.length})</summary>
                    <ul>
                      {regionKeys.map((key, kidx) => (
                        <li key={kidx}>{key}</li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Кнопка закрытия */}
      <button
        onClick={() => setDebugSelectedTile(null)}
        className={styles.debugCloseBtn}
      >
        Закрыть
      </button>
    </div>
  );
};