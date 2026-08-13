// packages/client/src/components/NetworkLobby.tsx
// 🌟 Сетевое лобби: создание/присоединение к комнате, ожидание игроков

import { useState } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { useEffect } from 'react';

export const NetworkLobby = () => {
  const [screen, setScreen] = useState<'main' | 'create' | 'join' | 'waiting'>('main');

  // 🌟 Используем имя и цвет из uiSlice (главное меню)
  const profileName = useGameStore(s => s.playerName);
  const profileColor = useGameStore(s => s.playerColor)

  const [roomId, setRoomId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [turnTimer, setTurnTimer] = useState(60);

  const isConnected = useGameStore(s => s.isConnected);
  const connectionError = useGameStore(s => s.connectionError);
  const currentRoomId = useGameStore(s => s.roomId);
  const playerId = useGameStore(s => s.playerId);
  const networkLobbyPlayers = useGameStore(s => s.networkLobbyPlayers);
  const isHost = useGameStore(s => s.isHost);
  const roomSettings = useGameStore(s => s.roomSettings);

  const createRoom = useGameStore(s => s.createRoom);
  const joinRoom = useGameStore(s => s.joinRoom);
  const leaveRoom = useGameStore(s => s.leaveRoom);
  const setReady = useGameStore(s => s.setReady);
  const startNetworkGame = useGameStore(s => s.startNetworkGame);


  // 🌟 Если уже в комнате — показываем экран ожидания
  useEffect(() => {
    if (currentRoomId && screen !== 'waiting') {
      setScreen('waiting');
    }
  }, [currentRoomId, screen]);

  const handleCreateRoom = () => {
    if (!profileName.trim()) return;
    createRoom(profileName.trim(), {
      isPrivate,
      turnTimerSeconds: turnTimer,
      maxPlayers: 5,
    }, profileColor);
  };

  const handleJoinRoom = () => {
    if (!profileName.trim() || !roomId.trim()) return;
    joinRoom(roomId.trim().toUpperCase(), profileName.trim(), profileColor);
  };

  // ============================================
  // 🔌 ЭКРАН ПОДКЛЮЧЕНИЯ
  // ============================================
  if (!isConnected) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={titleStyle}>🌐 Подключение...</h2>
          {connectionError && (
            <p style={{ color: '#e74c3c', textAlign: 'center' }}>
              Ошибка: {connectionError}
            </p>
          )}
          <p style={{ color: '#aaa', textAlign: 'center' }}>
            Подключение к серверу...
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // 🏠 ГЛАВНОЕ МЕНЮ
  // ============================================
  if (screen === 'main') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>🌐 Сетевая игра</h1>

          <button onClick={() => setScreen('create')} style={primaryBtnStyle}>
            🏠 Создать комнату
          </button>

          <button onClick={() => setScreen('join')} style={primaryBtnStyle}>
            🚪 Присоединиться по коду
          </button>

          <button onClick={() => useGameStore.getState().setLobbyScreen('modeSelect')} style={secondaryBtnStyle}>
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // 🏠 СОЗДАНИЕ КОМНАТЫ
  // ============================================
  if (screen === 'create') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={titleStyle}>🏠 Создать комнату</h2>

          {/* 🌟 Показываем имя и цвет из профиля */}
          <div style={profilePreviewStyle}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: profileColor }} />
            <span style={{ color: '#fff' }}>{profileName}</span>
          </div>

          <label style={checkboxStyle}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            Приватная комната (по коду)
          </label>

          <label style={labelStyle}>
            ⏱️ Таймер на ход (секунды):
            <input
              type="number"
              min={0}
              max={300}
              value={turnTimer}
              onChange={(e) => setTurnTimer(Number(e.target.value))}
              style={inputStyle}
            />
          </label>

          <button onClick={handleCreateRoom} disabled={!profileName.trim()} style={primaryBtnStyle}>
            Создать
          </button>

          <button onClick={() => setScreen('main')} style={secondaryBtnStyle}>
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // 🚪 ПРИСОЕДИНЕНИЕ К КОМНАТЕ
  // ============================================
  if (screen === 'join') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={titleStyle}>🚪 Присоединиться</h2>

          {/* 🌟 Показываем имя и цвет из профиля */}
          <div style={profilePreviewStyle}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: profileColor }} />
            <span style={{ color: '#fff' }}>{profileName}</span>
          </div>

          <input
            type="text"
            placeholder="Код комнаты (6 символов)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            maxLength={6}
            style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center', fontSize: '20px' }}
          />

          <button
            onClick={handleJoinRoom}
            disabled={!profileName.trim() || roomId.length !== 6}
            style={primaryBtnStyle}
          >
            Присоединиться
          </button>

          <button onClick={() => setScreen('main')} style={secondaryBtnStyle}>
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // ⏳ ОЖИДАНИЕ В КОМНАТЕ
  // ============================================
  if (screen === 'waiting') {
    const allReady = networkLobbyPlayers.every(p => p.isReady);
    const canStart = networkLobbyPlayers.length >= 2 && allReady;

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={titleStyle}>⏳ Комната {currentRoomId}</h2>
          <p style={{ color: '#4a90e2', textAlign: 'center', fontSize: '14px' }}>
            Сообщите код комнаты друзьям: <strong style={{ fontSize: '18px', letterSpacing: '2px' }}>{currentRoomId}</strong>
          </p>

          {/* Список игроков */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {networkLobbyPlayers.map(player => (
              <div key={player.id} style={playerRowStyle}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: player.color }} />
                <span style={{ color: '#fff', flex: 1 }}>
                  {player.name} {player.isHost && '👑'} {player.id === playerId && '(вы)'}
                </span>
                <span style={{ color: player.isReady ? '#2ecc71' : '#e74c3c' }}>
                  {player.isReady ? '✅ Готов' : '⏳ Не готов'}
                </span>
              </div>
            ))}
          </div>

          {/* Настройки комнаты */}
          {roomSettings && (
            <div style={{ color: '#888', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
              ⏱️ Таймер: {roomSettings.turnTimerSeconds} сек | 🔒 {roomSettings.isPrivate ? 'Приватная' : 'Публичная'}
            </div>
          )}

          {/* Кнопки */}
          <button
            onClick={() => {
              const me = networkLobbyPlayers.find(p => p.id === playerId);
              setReady(!me?.isReady);
            }}
            style={primaryBtnStyle}
          >
            {networkLobbyPlayers.find(p => p.id === playerId)?.isReady ? '❌ Отменить готовность' : '✅ Готов'}
          </button>

          {isHost && (
            <button
              onClick={startNetworkGame}
              disabled={!canStart}
              style={{
                ...primaryBtnStyle,
                background: canStart ? '#2ecc71' : '#555',
                cursor: canStart ? 'pointer' : 'not-allowed',
              }}
            >
              🚀 Начать игру
            </button>
          )}

          <button onClick={leaveRoom} style={secondaryBtnStyle}>
            👋 Покинуть комнату
          </button>
        </div>
      </div>
    );
  }

  return null;
};

// ============================================
// 🎨 Стили
// ============================================
const containerStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(30, 30, 30, 0.95)',
  borderRadius: '24px',
  padding: '32px',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  maxWidth: '420px',
  width: '90%',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const titleStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '24px',
  textAlign: 'center',
  margin: '0 0 16px 0',
};

const inputStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '16px',
  border: '2px solid rgba(74, 144, 226, 0.4)',
  borderRadius: '8px',
  background: 'rgba(255, 255, 255, 0.08)',
  color: '#fff',
  outline: 'none',
};

const checkboxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: '#fff',
  fontSize: '14px',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  color: '#fff',
  fontSize: '14px',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '14px',
  background: '#4a90e2',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  fontSize: '16px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const secondaryBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: 'rgba(255, 255, 255, 0.1)',
  color: '#aaa',
};

const playerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 14px',
  background: 'rgba(255, 255, 255, 0.05)',
  borderRadius: '8px',
};

const profilePreviewStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  background: 'rgba(255, 255, 255, 0.05)',
  borderRadius: '8px',
  marginBottom: '8px',
};