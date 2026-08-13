// components/Lobby.tsx
import { useState } from 'react';
import { useGameStore } from '@/state/useGameStore';

export const Lobby = () => {
  const {
    lobbyPlayers = [],
    showRegions,
    showDeadCells,
    enabledDeckView,
    addPlayer,
    removePlayer,
    renamePlayer,
    startGame,
    toggleRegions,
    toggleDeadCells,
    toggleDeckView
  } = useGameStore();

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

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: 'rgba(30, 30, 30, 0.95)',
        borderRadius: '24px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        maxWidth: '500px',
        width: '90%',
        backdropFilter: 'blur(10px)',
      }}>
        {/* Заголовок */}
        <h1 style={{
          color: '#fff',
          fontSize: '32px',
          textAlign: 'center',
          marginBottom: '32px',
          fontWeight: '700',
        }}>
          Локальная игра
        </h1>

        {/* Список игроков */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: '#fff', fontSize: '18px', marginBottom: '12px' }}>
            👥 Игроки ({lobbyPlayers.length}/5)
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lobbyPlayers.map((player, index) => {
              const isEditing = editingId === player.id;
              const canRemoveThis = index >= 2;
              
              return (
                <div
                  key={player.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {/* Цветной индикатор */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: player.color,
                    border: '3px solid rgba(255, 255, 255, 0.3)',
                    flexShrink: 0,
                  }} />
                  
                  {/* Имя (кликабельное) */}
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
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: '1px solid #4a90e2',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '16px',
                        fontWeight: '500',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => handleStartEdit(player)}
                      style={{
                        color: '#fff',
                        fontSize: '16px',
                        fontWeight: '500',
                        flex: 1,
                        cursor: 'text',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        transition: 'background 0.2s',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                      title="Нажмите, чтобы переименовать"
                    >
                      {player.name}
                    </span>
                  )}
                  
                  {/* Кнопка удаления (только если >2 игроков) */}
                  {canRemoveThis && (
                    <button
                      onClick={() => removePlayer(player.id)}
                      style={{
                        background: 'rgba(231, 76, 60, 0.2)',
                        color: '#e74c3c',
                        border: '1px solid rgba(231, 76, 60, 0.4)',
                        borderRadius: '6px',
                        width: '32px',
                        height: '32px',
                        cursor: 'pointer',
                        fontSize: '18px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#e74c3c';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(231, 76, 60, 0.2)';
                        e.currentTarget.style.color = '#e74c3c';
                      }}
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
            <button
              onClick={addPlayer}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px',
                background: 'rgba(46, 204, 113, 0.15)',
                color: '#2ecc71',
                border: '1px dashed rgba(46, 204, 113, 0.5)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '600',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(46, 204, 113, 0.25)';
                e.currentTarget.style.borderColor = '#2ecc71';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(46, 204, 113, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(46, 204, 113, 0.5)';
              }}
            >
              ➕ Добавить игрока
            </button>
          )}
        </div>

        {/* Настройки */}
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
        }}>
          <h3 style={{ color: '#fff', fontSize: '18px', marginBottom: '12px' }}>
            ⚙️ Настройки
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showRegions}
                onChange={toggleRegions}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ color: '#fff', fontSize: '14px' }}>
                🗺️ Показывать регионы
              </span>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showDeadCells}
                onChange={toggleDeadCells}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ color: '#fff', fontSize: '14px' }}>
                💀 Показывать мёртвые клетки
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabledDeckView}
                onChange={toggleDeckView}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ color: '#fff', fontSize: '14px' }}>
                📦 Просмотр колоды
              </span>
            </label>
          </div>
        </div>

        {/* Кнопка начала игры */}
        <button
          onClick={startGame}
          disabled={!canStart}
          style={{
            width: '100%',
            padding: '16px',
            background: canStart ? '#2ecc71' : '#555',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '700',
            cursor: canStart ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            boxShadow: canStart ? '0 4px 12px rgba(46, 204, 113, 0.4)' : 'none',
          }}
          onMouseOver={(e) => canStart && (e.currentTarget.style.background = '#27ae60')}
          onMouseOut={(e) => canStart && (e.currentTarget.style.background = '#2ecc71')}
        >
          {canStart ? '🚀 Начать игру' : '⚠️ Нужно минимум 2 игрока'}
        </button>
      </div>
    </div>
  );
};