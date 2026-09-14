// packages/client/src/components/MainMenu.tsx
// 🌟 Главное меню игры.

import { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { getSaveMeta, SAVE_KEYS } from '@/core/gameSaveManager';
import { AVAILABLE_COLORS } from '@fiefdom/shared/core/constants';
import { getSocket } from '@/network/socket';
import { loadConnectionInfo } from '@/network/persistence';  // 🌟 Используем persistence

import styles from '@/components/styles/lobby.module.css';

const MAX_NAME_LENGTH = 20;

export const MainMenu = () => {
    const playerName = useGameStore(s => s.playerName);
    const playerColor = useGameStore(s => s.playerColor);
    const setPlayerName = useGameStore(s => s.setPlayerName);
    const setPlayerColor = useGameStore(s => s.setPlayerColor);
    const loadLocalGame = useGameStore(s => s.loadLocalGame);

    // 🌟 НОВОЕ: проверяем локальное сохранение
    const localSaveMeta = useMemo(() => {
        return getSaveMeta(SAVE_KEYS.LOCAL);
    }, []);

    const activeGame = useGameStore(s => s.activeGame);
    const reconnectError = useGameStore(s => s.reconnectError);
    const setReconnectError = useGameStore(s => s.setReconnectError);
    const isConnected = useGameStore(s => s.isConnected);
    const serverPing = useGameStore(s => s.serverPing);
    const setLobbyScreen = useGameStore(s => s.setLobbyScreen);

    // 🌟 Локальное состояние для UI (не в store)
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [tempName, setTempName] = useState(playerName);  // 🌟 Для input с Enter

    const hasNetworkGame = activeGame !== null;
    const hasLocalGame = localSaveMeta !== null;
    const hasActiveSession = hasNetworkGame || hasLocalGame;

    // 🌟 Синхронизируем tempName с playerName ТОЛЬКО когда playerName меняется извне
    // (например, после reconnect сервер возвращает другое имя)
    useEffect(() => {
        // Синхронизируем только если нет активной сессии
        // (при активной сессии поля заблокированы, и синхронизация не нужна)
        if (!hasActiveSession) {
            setTempName(playerName);
        }
    }, [playerName, hasActiveSession]);

    // 🌟 Сбрасываем ошибку при любом действии
    const clearError = () => {
        if (reconnectError) setReconnectError(null);
    };

    // 🌟 Применение имени (Enter или blur)
    const applyName = () => {
        setPlayerName(tempName);
    };

    // 🌟 Обновление имени по Enter
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            applyName();
            (e.target as HTMLInputElement).blur();
        }
    };

    const handleContinueGame = () => {
        if (isReconnecting) return;
        clearError();

        // ============================================
        // 🌟 ПРИОРИТЕТ 1: Сетевая игра
        // ============================================
        if (activeGame) {
            const saved = loadConnectionInfo();
            if (!saved) {
                console.warn('⚠️ [MainMenu] Нет сохранённой сессии для сетевой игры');
                setReconnectError('Сессия не найдена. Попробуйте войти заново.');
                return;
            }

            console.log(`🔄 [MainMenu] Продолжить сетевую игру в комнате ${activeGame.roomId}`);
            setIsReconnecting(true);
            useGameStore.setState({ isReconnectingToRoom: true });

            const socket = getSocket();
            if (!socket.connected) {
                setIsReconnecting(false);
                useGameStore.setState({ isReconnectingToRoom: false });
                setReconnectError('Нет подключения к серверу');
                return;
            }

            socket.emit('lobby:reconnect', {
                playerId: saved.playerId,
                roomId: activeGame.roomId,
            });

            setTimeout(() => {
                setIsReconnecting(false);
                useGameStore.setState({ isReconnectingToRoom: false });
            }, 5000);
            return;
        }

        // ============================================
        // 🌟 ПРИОРИТЕТ 2: Локальная игра
        // ============================================
        if (localSaveMeta) {
            console.log(`🔄 [MainMenu] Продолжить локальную игру (${localSaveMeta.playerCount} игроков)`);
            const success = loadLocalGame();
            if (!success) {
                setReconnectError('Не удалось загрузить сохранение');
                return;
            }
            console.log('✅ [MainMenu] Локальная игра восстановлена');
        }
    };

    const handleLocalGame = () => {
        clearError();
        applyName();  // 🌟 Применяем имя перед стартом
        console.log('🎮 [MainMenu] Локальная игра');
        useGameStore.getState().initLocalLobby(playerName, playerColor);
        setLobbyScreen('localLobby');
    };

    const handleNetworkGame = () => {
        if (!isConnected) return;
        clearError();
        applyName();  // 🌟 Применяем имя перед стартом
        console.log('🌐 [MainMenu] Сетевая игра');
        setLobbyScreen('networkLobby');
    };

    // Определяем класс для ping
    const getPingClass = (ping: number) => {
        if (ping < 100) return styles.pingGood;
        if (ping < 200) return styles.pingMedium;
        return styles.pingBad;
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.card}>
                {/* Заголовок */}
                <h1 className={styles.title}>Fiefdom</h1>
                <p className={styles.subtitle}>your medieval domain, tile by tile</p>

                {/* Профиль */}
                <div className={styles.section}>
                    {/* Имя игрока */}
                    <label className={styles.sectionTitle}>
                        Имя игрока
                        {hasActiveSession && <span style={{ fontSize: '12px', marginLeft: '8px' }}>🔒</span>}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        {/* Предпросмотр цвета */}
                        <div
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                backgroundColor: playerColor,
                                border: '2px solid rgba(255, 255, 255, 0.3)',
                                flexShrink: 0,
                            }}
                            title="Ваш цвет мипла"
                        />
                        <input
                            type="text"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={applyName}
                            onKeyDown={handleKeyDown}
                            className={styles.input}
                            placeholder="Введите имя..."
                            maxLength={MAX_NAME_LENGTH}
                            disabled={hasActiveSession}
                            title={hasActiveSession ? 'Заблокировано: активная сессия' : ''}
                        />
                        <span style={{ fontSize: '11px', color: '#666' }}>
                            {tempName.length}/{MAX_NAME_LENGTH}
                        </span>
                    </div>

                    {/* Цвет мипла */}
                    <label className={styles.sectionTitle}>
                        Предпочтительный цвет
                        {hasActiveSession && <span style={{ fontSize: '12px', marginLeft: '8px' }}>🔒</span>}
                    </label>
                    <p style={{ fontSize: '12px', color: '#666', margin: '0 0 12px 0', fontStyle: 'italic' }}>
                        {hasActiveSession
                            ? 'Цвет зафиксирован для текущей игры'
                            : 'Если цвет занят — будет назначен другой'}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                        {AVAILABLE_COLORS.map((color) => (
                            <button
                                key={color}
                                style={{
                                    width: '100%',
                                    aspectRatio: '1',
                                    borderRadius: '8px',
                                    cursor: hasActiveSession ? 'not-allowed' : 'pointer',
                                    backgroundColor: color,
                                    border: playerColor === color ? '3px solid #fff' : '3px solid transparent',
                                    opacity: hasActiveSession ? 0.5 : 1,
                                    transform: playerColor === color ? 'scale(1.1)' : 'scale(1)',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                                }}
                                onClick={() => {
                                    if (!hasActiveSession) {
                                        clearError();
                                        setPlayerColor(color);
                                    }
                                }}
                                disabled={hasActiveSession}
                                title={playerColor === color ? 'Выбран' : 'Выбрать этот цвет'}
                            />
                        ))}
                    </div>
                </div>

                {/* Кнопка Продолжить игру */}
                {hasActiveSession && (
                    <button
                        className={styles.buttonContinue}
                        onClick={handleContinueGame}
                        disabled={isReconnecting}
                        style={{ opacity: isReconnecting ? 0.7 : 1 }}
                    >
                        {isReconnecting ? '⏳ Подключение...' : '🔄 Продолжить игру'}
                        <span style={{ display: 'block', fontSize: '12px', fontWeight: 400, color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                            {/* 🌟 Сетевая игра */}
                            {hasNetworkGame && activeGame && (
                                <>
                                    Комната: {activeGame.roomId} • {activeGame.playerCount} игроков
                                    {activeGame.gameStarted ? ' • Игра идёт' : ' • В лобби'}
                                </>
                            )}
                            {/* 🌟 Локальная игра */}
                            {!hasNetworkGame && localSaveMeta && (
                                <>
                                    🎮 Локальная игра • {localSaveMeta.playerCount} игроков
                                    {' • '}Тайлов: {localSaveMeta.deckRemaining}/{localSaveMeta.totalTiles}
                                </>
                            )}
                        </span>
                    </button>
                )}

                {/* Ошибка reconnect */}
                {reconnectError && (
                    <div className={styles.errorBox}>
                        ⚠️ {reconnectError}
                    </div>
                )}

                {/* Основные кнопки */}
                <button className={styles.buttonPrimary} onClick={handleLocalGame}>
                    🎮 Локальная игра
                </button>

                <button
                    className={styles.buttonPrimary}
                    onClick={handleNetworkGame}
                    disabled={!isConnected}
                    title={!isConnected ? 'Нет подключения к серверу' : 'Создать или присоединиться к сетевой игре'}
                >
                    🌐 Сетевая игра
                    {isConnected && serverPing !== null && (
                        <span className={`${styles.ping} ${getPingClass(serverPing)}`}>
                            {serverPing}ms
                        </span>
                    )}
                </button>

                {/* Статус подключения */}
                <div className={styles.connectionStatus}>
                    {isConnected ? (
                        <span className={styles.connected}>● Подключено к серверу</span>
                    ) : (
                        <span className={styles.disconnected}>○ Не подключено</span>
                    )}
                </div>
            </div>
        </div>
    );
};