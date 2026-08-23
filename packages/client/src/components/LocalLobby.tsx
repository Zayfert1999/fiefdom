// components/Lobby.tsx
import { useState } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { SessionSettings } from '@/components/lobby/SessionSettings';

import styles from '@/components/styles/lobby.module.css'

export const Lobby = () => {
  const lobbyPlayers = useGameStore(s => s.lobbyPlayers);
  const showRegions = useGameStore(s => s.showRegions);
  const showDeadCells = useGameStore(s => s.showDeadCells);
  const enabledDeckView = useGameStore(s => s.enabledDeckView);
  const addPlayer = useGameStore(s => s.addPlayer);
  const removePlayer = useGameStore(s => s.removePlayer);
  const renamePlayer = useGameStore(s => s.renamePlayer);
  const startGame = useGameStore(s => s.startGame);
  const toggleRegions = useGameStore(s => s.toggleRegions);
  const toggleDeadCells = useGameStore(s => s.toggleDeadCells);
  const toggleDeckView = useGameStore(s => s.toggleDeckView);
  const setLobbyScreen = useGameStore(s => s.setLobbyScreen);

  // 🌟 Состояние inline-редактирования
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const canStart = lobbyPlayers.length >= 2;
  const canAdd = lobbyPlayers.length < 5;

  // 🌟 Начало редактирования
  const handleStartEdit = (player: typeof lobbyPlayers[0]) => {
    setEditingId(player.id);
    setEditingValue(player.name);
  };

  // 🌟 Сохранение имени
  const handleSaveEdit = (id: string) => {
    if (editingValue.trim()) {
      renamePlayer(id, editingValue);
    }
    setEditingId(null);
    setEditingValue('');
  };

  // 🌟 Отмена редактирования
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };
  // 🌟 Возврат в главное меню
  const handleBackToMainMenu = () => {
    console.log('🔙 [LocalLobby] Возврат в главное меню');
    setLobbyScreen('modeSelect');
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {/* Заголовок */}
        <h1 className={styles.title}>🎮 Локальная игра</h1>

        {/* Список игроков */}
        <div>
          <h3 className={styles.sectionTitle}>
            👥 Игроки ({lobbyPlayers.length}/5)
          </h3>

          <div className={styles.playersList}>
            {lobbyPlayers.map((player, index) => {
              const isEditing = editingId === player.id;
              // 🌟 Удалять можно только игроков начиная с третьего (индекс 2)
              const canRemoveThis = index >= 2;

              return (
                <div key={player.id} className={styles.playerRow}>
                  {/* Цветной индикатор */}
                  <div
                    className={styles.playerColor}
                    style={{ backgroundColor: player.color }}
                  />

                  {/* Имя (кликабельное) или input для редактирования */}
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => handleSaveEdit(player.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(player.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      maxLength={20}
                      className={styles.editInput}
                    />
                  ) : (
                    <span
                      onClick={() => handleStartEdit(player)}
                      className={`${styles.playerName} ${styles.editable}`}
                      title="Нажмите, чтобы переименовать"
                    >
                      {player.name}
                    </span>
                  )}

                  {/* Кнопка удаления (только если >2 игроков) */}
                  {canRemoveThis && (
                    <button
                      onClick={() => removePlayer(player.id)}
                      className={styles.removeButton}
                      title="Удалить игрока"
                    >
                      −
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Кнопка добавления игрока */}
          {canAdd && (
            <button onClick={addPlayer} className={styles.addButton}>
              ➕ Добавить игрока
            </button>
          )}
        </div>

        {/* Настройки сессии*/}
        <SessionSettings
          showRegions={showRegions}
          showDeadCells={showDeadCells}
          enabledDeckView={enabledDeckView}
          onToggleRegions={toggleRegions}
          onToggleDeadCells={toggleDeadCells}
          onToggleDeckView={toggleDeckView}
        />

        {/* Кнопка начала игры */}
        <button
          onClick={startGame}
          disabled={!canStart}
          className={styles.buttonSuccess}
        >
          {canStart ? '🚀 Начать игру' : '⚠️ Нужно минимум 2 игрока'}
        </button>

        {/* Кнопка возврата в главное меню */}
        <button onClick={handleBackToMainMenu} className={styles.buttonSecondary}>
          ← Назад
        </button>
      </div>
    </div>
  );
};