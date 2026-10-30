// packages/client/src/components/GameHUD.tsx
// 🌟 Единый игровой HUD: игроки, таймер, колода, фаза, управление
import { useState, useEffect, memo, useMemo, useRef, useLayoutEffect, lazy, Suspense } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { useHotkeysModal } from '@/hooks/useHotkeysModal';
import { useDeckModal } from '@/hooks/useDeckModal';
import { useHotkeys } from '@/hooks/useHotkeys';
import { HOTKEY_DEFINITIONS } from '@fiefdom/shared/core/hotkeys';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from '@/components/styles/game.module.css';
import type { Player } from '@fiefdom/shared/core/types';
import { darkenColor } from '@/utils/color';
import { formatClock } from '@fiefdom/shared/core/fischerClock';

// Ленивые импорты модалок
const HotkeysModal = lazy(() => import('@/components/hotKeysModal').then(m => ({ default: m.HotkeysModal })));
const DeckModal = lazy(() => import('@/components/DeckModal').then(m => ({ default: m.DeckModal })));

export const GameHUD: React.FC = () => {
    // ============================================
    // 🎯 Селекторы
    // ============================================
    const players = useGameStore(s => s.players);
    const currentTurn = useGameStore(s => s.currentTurn);
    const phase = useGameStore(s => s.phase);
    const totalTiles = useGameStore(s => s.totalTiles);
    const board = useGameStore(s => s.board);
    const drawnTile = useGameStore(s => s.drawnTile);
    const roomId = useGameStore(s => s.roomId);
    const playerId = useGameStore(s => s.playerId);
    const networkLobbyPlayers = useGameStore(s => s.networkLobbyPlayers);
    const isConnected = useGameStore(s => s.isConnected);
    const isReconnecting = useGameStore(s => s.isReconnecting);
    const enabledDeckView = useGameStore(s => s.enabledDeckView);
    // 🕐 Шахматные часы: онлайн — настройка комнаты, локально — настройка партии (null = без таймера)
    const clockSnapshot = useGameStore(s => s.clockSnapshot);
    const timedOutPlayerIds = useGameStore(s => s.timedOutPlayerIds);
    const timeControl = useGameStore(s =>
        s.roomId !== null ? (s.roomSettings?.timeControl ?? null) : s.gameTimeControl
    );
    const exitToLobby = useGameStore(s => s.exitToLobby);

    // ============================================
    // 🎴 Колода
    // ============================================
    const deckRemaining = useMemo(() => {
        let remaining = totalTiles - board.size;
        if (drawnTile) remaining -= 1;
        return Math.max(0, remaining);
    }, [totalTiles, board, drawnTile]);

    // ============================================
    // 👥 Разбивка игроков на ряды по 3
    // ============================================
    const playerRows = useMemo(() => {
        const rows: Array<Array<{ player: Player; index: number }>> = [];
        for (let i = 0; i < players.length; i += 3) {
            rows.push(
                players.slice(i, i + 3).map((player, idx) => ({
                    player,
                    index: i + idx,
                }))
            );
        }
        return rows;
    }, [players]);

    // ============================================
    // ⌨️ Модалки и хоткеи
    // ============================================
    const hotkeysModal = useHotkeysModal();
    const deckModal = useDeckModal();

    useHotkeys([
        { ...HOTKEY_DEFINITIONS.SHOW_HOTKEYS, action: hotkeysModal.toggle, enabled: phase !== 'lobby' },
        {
            ...HOTKEY_DEFINITIONS.SHOW_DECK,
            action: deckModal.toggle,
            enabled: enabledDeckView && phase !== 'lobby' && phase !== 'gameOver' && phase !== 'endTurn',
        },
    ]);

    // ============================================
    // 🚪 Выход из игры
    // ============================================
    const handleExit = () => {
        if (window.confirm('Выйти в меню? Прогресс хода будет потерян.')) {
            console.log('🚪 [GameHUD] Выход из игры');
            exitToLobby();
        }
    };

    return (
        <>
            {/* ============================================
          🌟 ОСНОВНОЙ HUD (компактный блок по центру)
          ============================================ */}
            <div className={styles.gameHud}>
                {/* 🌟 Единая строка: колода слева, время по центру, кнопки справа */}
                <div className={styles.topRow}>
                    {/* Левая зона: колода */}
                    <div className={styles.deckZone}>
                        {enabledDeckView && (
                            <button
                                className={styles.deckWidget}
                                onClick={deckModal.open}
                                title="Посмотреть колоду (D)"
                            >
                                <span>🎴</span>
                                <span className={styles.deckCount}>{deckRemaining}</span>
                                <span className={styles.deckTotal}>/ {totalTiles}</span>
                            </button>
                        )}
                    </div>

                    {/* Центральная зона: общее время игры */}
                    <div className={styles.timerZone}>
                        <GameTimer />
                    </div>

                    {/* Правая зона: кнопки управления */}
                    <div className={styles.controlsSection}>
                        {/* Индикатор подключения (сетевой режим) */}
                        {roomId !== null && (
                            <span
                                className={`${styles.connectionDot} ${isReconnecting ? styles.connectionDotReconnecting :
                                    !isConnected ? styles.connectionDotOffline : ''
                                    }`}
                                title={isReconnecting ? 'Переподключение...' : isConnected ? 'Онлайн' : 'Оффлайн'}
                            />
                        )}

                        {/* Кнопка хоткеев */}
                        <button
                            className={styles.controlButton}
                            onClick={hotkeysModal.open}
                            title="Горячие клавиши (F1)"
                        >
                            ?
                        </button>

                        {/* Кнопка выхода */}
                        <button
                            className={`${styles.controlButton} ${styles.controlButtonDanger}`}
                            onClick={handleExit}
                            title="Выйти из игры"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Игроки */}
                <div className={styles.playersSection}>
                    {playerRows.map((row, rowIndex) => (
                        <div key={rowIndex} className={styles.playersRow}>
                            {row.map(({ player, index }) => {
                                const isActive = currentTurn === index;
                                const isSelf = roomId !== null && player.id === playerId;
                                const networkPlayer = networkLobbyPlayers.find(np => np.id === player.id);
                                const isDisconnected = networkPlayer?.isDisconnected ?? false;
                                return (
                                    <PlayerCard
                                        key={player.id}
                                        player={player}
                                        isActive={isActive}
                                        isSelf={isSelf}
                                        isDisconnected={isDisconnected}
                                        baseSeconds={timeControl?.baseSeconds ?? 0}
                                        clockBankMs={timeControl && clockSnapshot ? (clockSnapshot.banksMs[player.id] ?? null) : null}
                                        clockReceivedAt={clockSnapshot?.receivedAt ?? 0}
                                        clockRunning={clockSnapshot?.activePlayerId === player.id}
                                        isSpectator={timedOutPlayerIds.includes(player.id)}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* ============================================
          📦 МОДАЛКИ
          ============================================ */}
            <Suspense fallback={null}>
                <ErrorBoundary name="HotkeysModal">
                    <HotkeysModal isOpen={hotkeysModal.isOpen} onClose={hotkeysModal.close} />
                </ErrorBoundary>
                <ErrorBoundary name="DeckModal">
                    {enabledDeckView && (
                        <DeckModal isOpen={deckModal.isOpen} onClose={deckModal.close} />
                    )}
                </ErrorBoundary>
            </Suspense>
        </>
    );
};

// ============================================
// 👤 КАРТОЧКА ИГРОКА С РАМКОЙ-ТАЙМЕРОМ
// ============================================
const TIMER_RX = 12;

interface PlayerCardProps {
    player: Player;
    isActive: boolean;
    isSelf: boolean;
    isDisconnected: boolean;
    /** Основное время партии, сек (0 — таймера нет) */
    baseSeconds: number;
    /** Банк игрока на момент clockReceivedAt, мс (null — часов нет) */
    clockBankMs: number | null;
    clockReceivedAt: number;
    /** Часы этого игрока идут сейчас */
    clockRunning: boolean;
    /** У игрока закончилось время: он больше не ходит, а наблюдает */
    isSpectator: boolean;
}

/** Остаток времени игрока на момент now (у игрока с идущими часами — с учётом тикающего времени) */
const bankAt = (bankMs: number, receivedAt: number, running: boolean, now: number): number =>
    Math.max(0, running ? bankMs - (now - receivedAt) : bankMs);

const PlayerCard = memo(({ player, isActive, isSelf, isDisconnected, baseSeconds, clockBankMs, clockReceivedAt, clockRunning, isSpectator }: PlayerCardProps) => {

    // Часы показываем у всех игроков, если в партии есть таймер
    const hasTimer = clockBankMs !== null && baseSeconds > 0;
    const timerTotal = baseSeconds;

    // ============================================
    // 🎨 Цвет базовой рамки
    // ============================================
    // С таймером базовая рамка тёмная — на её фоне виден «банк времени»; активного игрока
    // выделяет полная яркость кольца (часы идут) и класс playerCardActive
    const borderColor = (isActive && !hasTimer)
        ? player.color
        : darkenColor(player.color, 0.5);

    // ============================================
    // 🌟 Сдвиг для старта таймера сверху с центра
    // ============================================
    const rectRef = useRef<SVGRectElement>(null);
    const [timerShift, setTimerShift] = useState<number | null>(null);

    useLayoutEffect(() => {
        if (!hasTimer || !rectRef.current) {
            setTimerShift(null);
            return;
        }

        try {
            const bbox = rectRef.current.getBoundingClientRect();
            if (bbox.width <= 0 || bbox.height <= 0) return;

            const straightW = bbox.width - 2 * TIMER_RX;
            const straightH = bbox.height - 2 * TIMER_RX;
            const perimeter = 2 * straightW + 2 * straightH + 2 * Math.PI * TIMER_RX;

            const shift = (straightW / 2) / perimeter * 100;
            setTimerShift(shift);
        } catch (e) {
            console.warn('⚠️ [GameHUD] Не удалось вычислить сдвиг таймера', e);
        }
    }, [hasTimer]);

    // ============================================
    // 🌟 ПЛАВНЫЕ ЧАСЫ
    // Показываем остаток банка (мс). У игрока с идущими часами остаток досчитывается
    // от момента получения снимка (rAF); у остальных — статичное значение банка.
    // ============================================
    const [displayMs, setDisplayMs] = useState<number>(clockBankMs ?? 0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!hasTimer || clockBankMs === null) {
            setDisplayMs(0);
            return;
        }

        // Часы стоят: просто показываем банк
        if (!clockRunning) {
            setDisplayMs(clockBankMs);
            return;
        }

        const animate = () => {
            const remaining = bankAt(clockBankMs, clockReceivedAt, true, Date.now());
            setDisplayMs(remaining);
            if (remaining > 0) {
                rafRef.current = requestAnimationFrame(animate);
            }
        };
        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [hasTimer, clockBankMs, clockReceivedAt, clockRunning]);

    // Рамка показывает долю от основного времени (банк может превышать его за счёт инкремента)
    const displayProgress = hasTimer ? Math.min(100, (displayMs / (timerTotal * 1000)) * 100) : 0;

    // 🌟 Пульсация, когда осталось ≤ 10 секунд и часы идут
    const isLowTime = hasTimer && displayMs <= 10_000;
    const isPulsing = isLowTime && clockRunning;

    // ============================================
    // 🌟 Параметры SVG-таймера
    // ============================================
    const strokeDasharray = `${displayProgress} ${100 - displayProgress}`;
    const strokeDashoffset = timerShift !== null ? -timerShift : 0;
    const timerReady = timerShift !== null;

    return (
        <div
            className={`${styles.playerCard} ${isActive ? styles.playerCardActive : ''
                } ${isDisconnected ? styles.playerCardDisconnected : ''}`}
            style={{ borderColor }}
            title={isDisconnected ? `${player.name} отключился` : player.name}
        >
            {/* 🌟 Рамка-таймер */}
            {hasTimer && (
                <svg
                    className={styles.timerBorder}
                    style={{ visibility: timerReady ? 'visible' : 'hidden' }}
                >
                    <rect
                        key={timerShift ?? 'init'}
                        ref={rectRef}
                        className={`${styles.timerBorderRect} ${isPulsing ? styles.timerBorderRectPulse : ''
                            }`}
                        x="0"
                        y="0"
                        width="100%"
                        height="100%"
                        rx={TIMER_RX}
                        pathLength={100}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        stroke={player.color}
                        // Часы стоят — кольцо приглушено; идут — на полную яркость
                        style={{ opacity: clockRunning ? 1 : 0.4 }}
                    />
                </svg>
            )}

            {/* Индикатор отключения */}
            {isDisconnected && (
                <div className={styles.disconnectBadge} title="Игрок отключился">⚠</div>
            )}

            {/* Цветовой индикатор */}
            <div
                className={styles.playerColor}
                style={{ backgroundColor: player.color }}
            />

            {/* Имя игрока */}
            <span className={`${styles.playerName} ${isSelf ? styles.playerNameSelf : ''}`}>
                {player.name}
            </span>

            {/* Статистика */}
            <div className={styles.playerStats}>
                <span className={styles.playerScore}>🏆 {player.score}</span>
                <span className={styles.playerMeeples}>🔶 {player.meepleCount}</span>
                {isSpectator && (
                    <span className={styles.playerClock} title="Время вышло — игрок наблюдает за партией">
                        👁 наблюдает
                    </span>
                )}
                {hasTimer && !isSpectator && (
                    <span
                        className={`${styles.playerClock} ${clockRunning ? styles.playerClockRunning : ''} ${isLowTime ? styles.playerClockLow : ''}`}
                        title="Остаток времени на партию"
                    >
                        ⏱ {formatClock(displayMs)}
                    </span>
                )}
            </div>
        </div>
    );
});

PlayerCard.displayName = 'PlayerCard';

// ============================================
// ⏱️ ИЗОЛИРОВАННЫЙ ТАЙМЕР ИГРЫ
// ============================================
/**
 * Компонент вынесен отдельно, чтобы его ежесекундное обновление
 * НЕ вызывало перерендер всего GameHUD.

 * Логика:
 * - Локальная игра (gameStartTime === null): считаем от монтирования
 * - Сетевая игра: считаем от серверного времени старта
 */
const GameTimer = memo(() => {
  const gameStartTime = useGameStore(s => s.gameStartTime);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    console.log(`⏱️ [GameTimer] Таймер запущен, gameStartTime=${gameStartTime}`);

    // 🌟 Локальная игра: считаем секунды от монтирования
    if (gameStartTime === null) {
      const interval = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }

    // 🌟 Сетевая игра: синхронизируемся с серверным временем
    const update = () => {
      const secs = Math.max(0, Math.floor((Date.now() - gameStartTime) / 1000));
      setElapsed(secs);
    };

    // Сразу вычисляем при монтировании
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [gameStartTime]);

  // 🌟 Форматирование мм:сс
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    <span className={styles.gameTimer}>
      ⏱️ {formatted}
    </span>
  );
});

GameTimer.displayName = 'GameTimer';
