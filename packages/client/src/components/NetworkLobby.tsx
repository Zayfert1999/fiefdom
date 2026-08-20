// packages/client/src/components/NetworkLobby.tsx
// 🌟 Сетевое лобби: создание/присоединение к комнате, ожидание игроков
import { useState, useEffect } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { SessionSettings } from '@/components/lobby/SessionSettings';

// 🌟 Единый CSS-модуль для всех лобби
import styles from '@/components/styles/lobby.module.css';

export const NetworkLobby = () => {
  const [screen, setScreen] = useState<'main' | 'create' | 'join' | 'waiting'>('main');

  // 🌟 Используем имя и цвет из uiSlice (главное меню)
  const profileName = useGameStore(s => s.playerName);
  const profileColor = useGameStore(s => s.playerColor);

  const [roomId, setRoomId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [turnTimer, setTurnTimer] = useState(60);
  const [showRegions, setShowRegions] = useState(true);
  const [showDeadCells, setShowDeadCells] = useState(true);
  const [enabledDeckView, setEnabledDeckView] = useState(true);

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
  const kickPlayer = useGameStore(s => s.kickPlayer);

  // 🌟 Если уже в комнате — показываем экран ожидания
  useEffect(() => {
    if (currentRoomId && screen !== 'waiting') {
      setScreen('waiting');
    }
  }, [currentRoomId, screen]);

  // 🌟 Возврат в главное меню
  const handleBackToMainMenu = () => {
    useGameStore.getState().setLobbyScreen('modeSelect');
  };

  const handleCreateRoom = () => {
    if (!profileName.trim()) return;
    createRoom(profileName.trim(), {
      isPrivate,
      turnTimerSeconds: turnTimer,
      maxPlayers: 5,
      // 🌟 Передаём настройки сессии по умолчанию
      showRegions,
      showDeadCells,
      enabledDeckView,
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
      <div className={styles.overlay}>
        <div className={styles.card}>
          <h2 className={styles.title}>🌐 Подключение...</h2>
          {connectionError && (
            <div className={styles.errorBox}>
              Ошибка: {connectionError}
            </div>
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
      <div className={styles.overlay}>
        <div className={styles.card}>
          <h1 className={styles.title}>🌐 Сетевая игра</h1>

          <button onClick={() => setScreen('create')} className={styles.buttonPrimary}>
            🏠 Создать комнату
          </button>

          <button onClick={() => setScreen('join')} className={styles.buttonPrimary}>
            🚪 Присоединиться по коду
          </button>

          <button onClick={handleBackToMainMenu} className={styles.buttonSecondary}>
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
      <div className={styles.overlay}>
        <div className={styles.card}>
          <h2 className={styles.title}>🏠 Создать комнату</h2>

          <label className={styles.settingRow}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className={styles.settingCheckbox}
            />
            <span className={styles.settingLabel}>🔒 Приватная комната (по коду)</span>
          </label>

          <label className={styles.labelColumn}>
            <span>⏱️ Таймер на ход (секунды)</span>
            <input
              type="number"
              min={0}
              max={300}
              value={turnTimer}
              onChange={(e) => setTurnTimer(Number(e.target.value))}
              className={styles.input}
            />
          </label>

          {/*  Настройки сессии */}
          <SessionSettings
            showRegions={showRegions}
            showDeadCells={showDeadCells}
            enabledDeckView={enabledDeckView}
            onToggleRegions={() => setShowRegions(!showRegions)}
            onToggleDeadCells={() => setShowDeadCells(!showDeadCells)}
            onToggleDeckView={() => setEnabledDeckView(!enabledDeckView)}
          />

          <button
            onClick={handleCreateRoom}
            disabled={!profileName.trim()}
            className={styles.buttonPrimary}
          >
            Создать
          </button>

          <button onClick={() => setScreen('main')} className={styles.buttonSecondary}>
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
      <div className={styles.overlay}>
        <div className={styles.card}>
          <h2 className={styles.title}>🚪 Присоединиться</h2>

          <input
            type="text"
            placeholder="Код комнаты (6 символов)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            maxLength={6}
            className={styles.input}
            style={{
              textTransform: 'uppercase',
              letterSpacing: '4px',
              textAlign: 'center',
              fontSize: '20px',
            }}
          />

          <button
            onClick={handleJoinRoom}
            disabled={!profileName.trim() || roomId.length !== 6}
            className={styles.buttonPrimary}
          >
            Присоединиться
          </button>

          <button onClick={() => setScreen('main')} className={styles.buttonSecondary}>
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
    const allReady = networkLobbyPlayers.every(p => p.isReady && !p.isDisconnected);
    const canStart = networkLobbyPlayers.length >= 2 && allReady;

    return (
      <div className={styles.overlay}>
        <div className={styles.card}>
          <h2 className={styles.title}>⏳ Комната {currentRoomId}</h2>

          {/* Код комнаты для друзей */}
          <p className={styles.roomCode}>
            Сообщите код друзьям:{' '}
            <strong className={styles.roomCodeValue}>{currentRoomId}</strong>
          </p>

          {/* Список игроков */}
          <div className={styles.playersList}>
            {networkLobbyPlayers.map(player => (
              <div
                key={player.id}
                className={`${styles.playerRow} ${player.isDisconnected ? styles.disconnected : ''}`}
              >
                <div
                  className={styles.playerColor}
                  style={{ backgroundColor: player.color }}
                />
                <span className={styles.playerName}>
                  {player.name}
                  {player.isHost && <span className={styles.playerBadge}>👑</span>}
                  {player.id === playerId && <span className={styles.playerBadge}>(вы)</span>}
                  {player.isDisconnected && (
                    <span className={styles.playerBadge} style={{ color: '#e74c3c' }}>
                      ⚠️ отключился
                    </span>
                  )}
                </span>
                <span className={`${styles.playerStatus} ${player.isReady ? styles.ready : styles.notReady}`}>
                  {player.isReady ? '✅ Готов' : '⏳ Не готов'}
                </span>

                {/* 🌟 Кнопка кика (только для хоста, не для себя) */}
                {isHost && player.id !== playerId && (
                  <button
                    className={styles.removeButton}
                    onClick={() => kickPlayer(player.id)}
                    title="Кикнуть игрока"
                  >
                    −
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Информация о комнате */}
          {roomSettings && (
            <p className={styles.roomInfo}>
              ⏱️ Таймер: {roomSettings.turnTimerSeconds} сек |{' '}
              {roomSettings.isPrivate ? '🔒 Приватная' : '🌐 Публичная'}
            </p>
          )}

          {/* Кнопка готовности */}
          <button
            onClick={() => {
              const me = networkLobbyPlayers.find(p => p.id === playerId);
              setReady(!me?.isReady);
            }}
            className={styles.buttonPrimary}
          >
            {networkLobbyPlayers.find(p => p.id === playerId)?.isReady
              ? '❌ Отменить готовность'
              : '✅ Готов'}
          </button>

          {/* Кнопка старта (только хост) */}
          {isHost && (
            <button
              onClick={startNetworkGame}
              disabled={!canStart}
              className={styles.buttonSuccess}
            >
              🚀 Начать игру
            </button>
          )}

          <button onClick={leaveRoom} className={styles.buttonSecondary}>
            👋 Покинуть комнату
          </button>
        </div>
      </div>
    );
  }

  return null;
};