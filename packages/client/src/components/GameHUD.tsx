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
    const turnTimerRemaining = useGameStore(s => s.turnTimerRemaining);
    const turnDeadline = useGameStore(s => s.turnDeadline);
    const turnTimerTotal = useGameStore(s => s.roomSettings?.turnTimerSeconds ?? 0);
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
                                        timerRemaining={isActive ? turnTimerRemaining : null}
                                        timerTotal={turnTimerTotal}
                                        turnDeadline={isActive ? turnDeadline : null}
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
    timerRemaining: number | null;
    timerTotal: number;
    turnDeadline: number | null;
}

const PlayerCard = memo(({ player, isActive, isSelf, isDisconnected, timerTotal, turnDeadline }: PlayerCardProps) => {

    // Упрощённая логика: таймер активен если есть deadline и timerTotal > 0
    const hasTimer = turnDeadline !== null && timerTotal > 0;

    // ============================================
    // 🎨 Цвет базовой рамки
    // ============================================
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
    // 🌟 ПЛАВНЫЙ ТАЙМЕР ОТ DEADLINE
    // ============================================
    const [displayProgress, setDisplayProgress] = useState<number>(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        // Сброс при отсутствии таймера или deadline
        if (!hasTimer || turnDeadline === null) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            setDisplayProgress(0);
            return;
        }

        // 🌟 rAF цикл: вычисляем прогресс от реального времени до deadline
        const animate = () => {
            const now = Date.now();
            const remainingMs = Math.max(0, turnDeadline - now);
            const remainingSeconds = remainingMs / 1000;
            const progress = Math.max(0, (remainingSeconds / timerTotal) * 100);

            setDisplayProgress(progress);

            if (remainingSeconds > 0) {
                rafRef.current = requestAnimationFrame(animate);
            }
        };

        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [hasTimer, turnDeadline, timerTotal]);

    // 🌟 Пульсация от отображаемого прогресса (точнее, чем от timerRemaining)
    const isPulsing = hasTimer && displayProgress <= (5 / timerTotal) * 100;

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