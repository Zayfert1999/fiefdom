// packages/client/src/components/MainMenu.tsx
// 🌟 Главное меню игры.

import { useState, useEffect } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { AVAILABLE_COLORS } from '@carcassonne/shared/core/constants';
import { getSocket } from '@/network/socket';
import { loadConnectionInfo } from '@/network/persistence';  // 🌟 Используем persistence

const MAX_NAME_LENGTH = 20;

export const MainMenu = () => {
    const playerName = useGameStore(s => s.playerName);
    const playerColor = useGameStore(s => s.playerColor);
    const setPlayerName = useGameStore(s => s.setPlayerName);
    const setPlayerColor = useGameStore(s => s.setPlayerColor);
    const activeGame = useGameStore(s => s.activeGame);
    const reconnectError = useGameStore(s => s.reconnectError);
    const setReconnectError = useGameStore(s => s.setReconnectError);
    const isConnected = useGameStore(s => s.isConnected);
    const serverPing = useGameStore(s => s.serverPing);
    const setLobbyScreen = useGameStore(s => s.setLobbyScreen);

    // 🌟 Локальное состояние для UI (не в store)
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [tempName, setTempName] = useState(playerName);  // 🌟 Для input с Enter

    const hasActiveSession = activeGame !== null;

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
        if (!activeGame || isReconnecting) return;

        clearError();

        // 🌟 Используем persistence вместо прямой работы с localStorage
        const saved = loadConnectionInfo();
        if (!saved) {
            console.warn('⚠️ [MainMenu] Нет сохранённой сессии');
            setReconnectError('Сессия не найдена. Попробуйте войти заново.');
            return;
        }

        console.log(`🔄 [MainMenu] Продолжить игру в комнате ${activeGame.roomId}`);
        setIsReconnecting(true);

        const socket = getSocket();
        if (!socket.connected) {
            setIsReconnecting(false);
            setReconnectError('Нет подключения к серверу');
            return;
        }

        socket.emit('lobby:reconnect', {
            playerId: saved.playerId,
            roomId: activeGame.roomId,
        });

        // 🌟 Таймаут на случай, если сервер не ответит
        setTimeout(() => {
            setIsReconnecting(false);
        }, 5000);
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

    return (
        <div style={styles.container}>
            <div style={styles.content}>
                {/* Заголовок */}
                <h1 style={styles.title}>Carcassonne</h1>
                <p style={styles.subtitle}>Настольная игра</p>

                {/* Поля ввода имени и цвета */}
                <div style={styles.profileSection}>
                    {/* Имя игрока с предпросмотром цвета */}
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>
                            Имя игрока
                            {hasActiveSession && (
                                <span style={styles.locked} title="Изменения недоступны во время активной игры">
                                    🔒
                                </span>
                            )}
                        </label>
                        <div style={styles.nameInputWrapper}>
                            {/* 🌟 Предпросмотр цвета */}
                            <div
                                style={{
                                    ...styles.colorPreview,
                                    backgroundColor: playerColor
                                }}
                                title="Ваш цвет мипла"
                            />
                            <input
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                onBlur={applyName}
                                onKeyDown={handleKeyDown}
                                style={{
                                    ...styles.input,
                                    opacity: hasActiveSession ? 0.5 : 1,
                                    cursor: hasActiveSession ? 'not-allowed' : 'text',
                                }}
                                placeholder="Введите имя..."
                                maxLength={MAX_NAME_LENGTH}
                                disabled={hasActiveSession}
                                title={hasActiveSession ? 'Заблокировано: активная сессия' : ''}
                            />
                            <span style={styles.charCount}>
                                {tempName.length}/{MAX_NAME_LENGTH}
                            </span>
                        </div>
                    </div>

                    {/* Цвет мипла */}
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>
                            Предпочтительный цвет
                            {hasActiveSession && (
                                <span style={styles.locked} title="Изменения недоступны во время активной игры">
                                    🔒
                                </span>
                            )}
                        </label>
                        <p style={styles.hint}>
                            {hasActiveSession
                                ? 'Цвет зафиксирован для текущей игры'
                                : 'Если цвет занят — будет назначен другой'}
                        </p>
                        <div style={styles.colorGrid}>
                            {AVAILABLE_COLORS.map((color) => (
                                <button
                                    key={color}
                                    style={{
                                        ...styles.colorButton,
                                        backgroundColor: color,
                                        border: playerColor === color
                                            ? '3px solid #fff'
                                            : '3px solid transparent',
                                        opacity: hasActiveSession ? 0.5 : 1,
                                        cursor: hasActiveSession ? 'not-allowed' : 'pointer',
                                        transform: playerColor === color ? 'scale(1.1)' : 'scale(1)',
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
                </div>

                {/* Кнопка Продолжить игру */}
                {hasActiveSession && (
                    <button
                        style={{
                            ...styles.continueButton,
                            opacity: isReconnecting ? 0.7 : 1,
                            cursor: isReconnecting ? 'not-allowed' : 'pointer',
                        }}
                        onClick={handleContinueGame}
                        disabled={isReconnecting}
                    >
                        {isReconnecting ? '⏳ Подключение...' : '🔄 Продолжить игру'}
                        <span style={styles.gameInfo}>
                            Комната: {activeGame.roomId} • {activeGame.playerCount} игроков
                            {activeGame.gameStarted ? ' • Игра идёт' : ' • В лобби'}
                        </span>
                    </button>
                )}

                {/* Ошибка reconnect */}
                {reconnectError && (
                    <div style={styles.errorBox}>
                        ⚠️ {reconnectError}
                    </div>
                )}

                {/* Основные кнопки */}
                <button
                    style={styles.menuButton}
                    onClick={handleLocalGame}
                >
                    🎮 Локальная игра
                </button>

                <button
                    style={{
                        ...styles.menuButton,
                        opacity: isConnected ? 1 : 0.5,
                        cursor: isConnected ? 'pointer' : 'not-allowed',
                    }}
                    onClick={handleNetworkGame}
                    disabled={!isConnected}
                    title={!isConnected ? 'Нет подключения к серверу' : 'Создать или присоединиться к сетевой игре'}
                >
                    🌐 Сетевая игра
                    {isConnected && serverPing !== null && (
                        <span style={{
                            ...styles.ping,
                            color: serverPing < 100 ? '#4ade80' : serverPing < 200 ? '#fbbf24' : '#ef4444',
                        }}>
                            {serverPing}ms
                        </span>
                    )}
                </button>

                {/* Статус подключения */}
                <div style={styles.connectionStatus}>
                    {isConnected ? (
                        <span style={styles.connected}>● Подключено к серверу</span>
                    ) : (
                        <span style={styles.disconnected}>○ Не подключено</span>
                    )}
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        padding: '20px',
    } as React.CSSProperties,
    content: {
        textAlign: 'center',
        padding: '40px',
        maxWidth: '420px',
        width: '100%',
    } as React.CSSProperties,
    title: {
        fontSize: '48px',
        color: '#fff',
        margin: '0 0 8px 0',
        fontFamily: 'serif',
        letterSpacing: '2px',
    } as React.CSSProperties,
    subtitle: {
        fontSize: '16px',
        color: '#888',
        margin: '0 0 40px 0',
        letterSpacing: '4px',
        textTransform: 'uppercase' as const,
    } as React.CSSProperties,
    profileSection: {
        background: 'rgba(255, 255, 255, 0.05)',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '30px',
        textAlign: 'left',
        border: '1px solid rgba(255, 255, 255, 0.08)',
    } as React.CSSProperties,
    inputGroup: {
        marginBottom: '24px',
    } as React.CSSProperties,
    label: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        color: '#aaa',
        marginBottom: '8px',
        fontWeight: 500,
    } as React.CSSProperties,
    locked: {
        fontSize: '12px',
    } as React.CSSProperties,
    nameInputWrapper: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        position: 'relative',
    } as React.CSSProperties,
    colorPreview: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        border: '2px solid rgba(255, 255, 255, 0.3)',
        flexShrink: 0,
    } as React.CSSProperties,
    input: {
        flex: 1,
        padding: '12px',
        paddingRight: '50px',
        fontSize: '16px',
        color: '#fff',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '8px',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
    } as React.CSSProperties,
    charCount: {
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '11px',
        color: '#666',
        pointerEvents: 'none',
    } as React.CSSProperties,
    hint: {
        fontSize: '12px',
        color: '#666',
        margin: '0 0 12px 0',
        fontStyle: 'italic',
    } as React.CSSProperties,
    colorGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '10px',
    } as React.CSSProperties,
    colorButton: {
        width: '100%',
        aspectRatio: '1',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
    } as React.CSSProperties,
    continueButton: {
        display: 'block',
        width: '100%',
        padding: '16px',
        margin: '0 auto 16px',
        fontSize: '18px',
        fontWeight: 600,
        color: '#fff',
        background: 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 4px 12px rgba(74, 144, 226, 0.3)',
    } as React.CSSProperties,
    gameInfo: {
        display: 'block',
        fontSize: '12px',
        fontWeight: 400,
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: '4px',
    } as React.CSSProperties,
    errorBox: {
        padding: '12px 16px',
        margin: '0 0 16px',
        fontSize: '14px',
        color: '#ef4444',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '8px',
        textAlign: 'left',
    } as React.CSSProperties,
    menuButton: {
        display: 'block',
        width: '100%',
        padding: '14px',
        margin: '0 auto 12px',
        fontSize: '16px',
        color: '#fff',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
    } as React.CSSProperties,
    ping: {
        marginLeft: '8px',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: 'monospace',
    } as React.CSSProperties,
    connectionStatus: {
        marginTop: '30px',
        fontSize: '14px',
    } as React.CSSProperties,
    connected: {
        color: '#4ade80',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
    } as React.CSSProperties,
    disconnected: {
        color: '#888',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
    } as React.CSSProperties,
};