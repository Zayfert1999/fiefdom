// packages/server/src/rooms/RoomGameLoop.ts
// 🌟 Игровой цикл: старт, ходы, таймер, конец игры.
// Отделён от Room для чёткого разделения ответственности.

import type { RoomSettings } from '@fiefdom/shared/protocol/events';
import type { PlayerConnection } from '../state/PlayerConnection';
import type { ServerGameState } from '../state/ServerGameState';
import { TurnTimer } from '../services/TurnTimer';
import type { RoomBroadcaster } from './RoomBroadcaster';
import { generateGameSeed } from '@fiefdom/shared/prng/seedRandom';
import { logger } from '../utils/logger';

// 🌟 Время, в течение которого все видят мипла перед проверкой регионов
const MEEPLE_VISIBLE_DELAY = 1000; // 1 секунда

/**
 * 🌟 Управляет игровым циклом:
 * - Старт игры
 * - Начало хода и таймер
 * - Обработка ходов
 * - Переход между ходами
 * - Конец игры
 */
export class RoomGameLoop {
    private turnTimer = new TurnTimer();

    // 🌟 Отложенные шаги (пауза на мипла, анимации регионов, финал).
    // Хранятся, чтобы dispose() мог их отменить: иначе после удаления комнаты
    // они продолжили бы двигать игру «в пустоту» и запускать таймеры.
    private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
    private disposed = false;

    constructor(
        private players: Map<string, PlayerConnection>,
        private gameState: ServerGameState,
        private broadcaster: RoomBroadcaster,
        private settings: RoomSettings
    ) { }

    /** setTimeout с учётом dispose(): после освобождения комнаты колбэк не вызывается */
    private schedule(fn: () => void, delayMs: number): void {
        const id = setTimeout(() => {
            this.pendingTimeouts.delete(id);
            if (this.disposed) return;
            fn();
        }, delayMs);
        this.pendingTimeouts.add(id);
    }

    // ============================================
    // 🚀 СТАРТ ИГРЫ
    // ============================================

    /**
       * 🌟 Инициализация игры БЕЗ начала первого хода.
       * Создаёт колоду, раскладывает стартовый тайл, устанавливает gameStartTime.
       * Вызывается ПЕРЕД рассылкой game:started.
       */
    initializeGame(): void {
        const seed = generateGameSeed();
        const playerProfiles = Array.from(this.players.values()).map(c => c.player);

        this.gameState.initialize(playerProfiles, seed);
        this.gameState.gameStartTime = Date.now();

        logger.info('[GameLoop]', `🎮 Игра инициализирована, seed=${seed}`);
    }

    /**
     * 🌟 Начало первого хода.
     * Вызывается ПОСЛЕ рассылки game:started.
     */
    startFirstTurn(): void {
        this.beginTurn();
    }

    /**
     * Полный старт игры (для обратной совместимости).
     */
    startGame(): void {
        this.initializeGame();
        this.startFirstTurn();
    }

    // ============================================
    // 🔄 ЦИКЛ ХОДА
    // ============================================

    /**
     * Начало хода текущего игрока: выдача тайла + таймер.
     */
    private beginTurn(): void {
        if (this.disposed) return;
        const gs = this.gameState;
        logger.info('[GameLoop]', `🔄 beginTurn: игрок ${gs.currentPlayer.name}`);

        const canContinue = gs.drawTile();
        if (!canContinue) {
            this.endGame();
            return;
        }

        this.broadcaster.broadcastState();

        const currentConn = this.players.get(gs.currentPlayer.id);
        if (currentConn && gs.drawnTile) {
            currentConn.emit('game:your-turn', { drawnTile: gs.drawnTile });
        }

        this.turnTimer.start(
            this.settings.turnTimerSeconds,
            (remaining, deadline) => this.broadcaster.broadcast('game:timer-update', { remainingSeconds: remaining, deadline }),
            () => this.handleTimeout()
        );
    }

    /**
     * ⏰ Таймаут: авто-пропуск хода.
     */
    private handleTimeout(): void {
        const skippedPlayer = this.gameState.currentPlayer;
        logger.warn('[GameLoop]', `Игрок ${skippedPlayer.name} не успел → пропуск хода`);

        // 🌟 Сообщаем всем, чей ход пропущен (клиенты покажут toast)
        this.broadcaster.broadcast('game:turn-skipped', { playerId: skippedPlayer.id });

        // Возвращаем тайл в колоду и передаём ход
        this.gameState.skipTurn();

        // Проверяем конец игры
        if (this.gameState.deck.length === 0) {
            this.endGame();
            return;
        }

        // Передаём ход следующему игроку
        this.broadcaster.broadcastState();
        this.beginTurn();
    }

    /**
     * Переход к следующему ходу.
     * Вызывается после обработки хода или таймаута.
     */
    private proceedToNextTurn(): void {
        const gs = this.gameState;

        // Проверяем конец игры
        if (gs.deck.length === 0) {
            logger.info('[GameLoop]', `🏁 Колода пуста → конец игры`);
            this.endGame();
            return;
        }

        gs.nextTurn();
        this.broadcaster.broadcastState();
        this.beginTurn();
    }

    // ============================================
    // 🎴 ОБРАБОТКА ХОДА
    // ============================================

    /**
     * Обработка хода игрока: установка тайла и мипла.
     * Включает валидацию, применение, проверку регионов и переход хода.
     */
    handleCommitMove(
        playerId: string,
        tileData: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
        meepleData: { featureId: string; x: number; y: number } | null
    ): { success: boolean; error?: string } {
        const gs = this.gameState;

        if (this.disposed || gs.phase !== 'playing') {
            return { success: false, error: 'GAME_NOT_STARTED' };
        }

        // ============================================
        // ФАЗА 1: Применяем тайл + мипл (БЕЗ регионов)
        // ============================================
        const result = gs.commitMove(playerId, tileData, meepleData);

        if (result.error) {
            logger.warn('[GameLoop]', `❌ commitMove отклонён: ${result.error}`);
            return { success: false, error: result.error };
        }

        logger.info('[GameLoop]', `✅ commitMove принят (фаза 1: тайл + мипл)`);
        this.turnTimer.stop();

        // Рассылаем move-committed
        this.broadcaster.broadcast('game:move-committed', {
            playerId,
            tile: {
                x: tileData.x,
                y: tileData.y,
                rotation: tileData.rotation,
                tileId: gs.board.get(`${tileData.x},${tileData.y}`)?.templateId ?? '',
            },
            meeple: meepleData,
        });

        // 🌟 Рассылаем state С миплом (все видят мипла!)
        this.broadcaster.broadcastState();

        // ============================================
        // ФАЗА 2: Пауза, чтобы все увидели мипла
        // ============================================
        logger.info('[GameLoop]', `⏱️ Фаза 2: пауза ${MEEPLE_VISIBLE_DELAY}мс (все видят мипла)`);

        this.schedule(() => {
            // ============================================
            // ФАЗА 3: Проверяем завершённые регионы
            // ============================================
            const completedRegions = gs.findCompletedRegions();
            logger.info('[GameLoop]', `🔍 Фаза 3: найдено завершённых регионов: ${completedRegions.length}`);

            if (completedRegions.length > 0) {
                // Рассылаем данные для анимации ДО применения
                this.broadcaster.broadcast('game:regions-completed', {
                    regions: completedRegions.map(r => ({
                        rootKey: r.rootKey,
                        type: r.type,
                        points: r.points,
                        winners: r.winners,
                        allMeepleOwners: r.allMeepleOwners,
                        featureKeys: r.featureKeys,
                    })),
                });

                // Применяем регионы (удаляет миплы, начисляет очки)
                gs.applyCompletedRegions(completedRegions);
                logger.info('[GameLoop]', `✅ Фаза 3: регионы применены (миплы удалены, очки начислены)`);

                // Рассылаем state БЕЗ миплов (финальное состояние)
                this.broadcaster.broadcastState();

                // ============================================
                // ФАЗА 4: Ждём завершения анимаций
                // ============================================
                const animationDelay = completedRegions.length * 3000;
                logger.info('[GameLoop]', `⏱️ Фаза 4: ждём ${animationDelay}мс (анимация регионов)`);

                this.schedule(() => {
                    this.proceedToNextTurn();
                }, animationDelay);

            } else {
                // Нет регионов — сразу передаём ход
                logger.info('[GameLoop]', `✅ Фаза 3: регионов нет → немедленная передача хода`);
                this.proceedToNextTurn();
            }
        }, MEEPLE_VISIBLE_DELAY);

        return { success: true };
    }

    // ============================================
    // 🏁 КОНЕЦ ИГРЫ
    // ============================================

    /**
     * Финальный подсчёт очков и завершение игры.
     */
    private endGame(): void {
        this.turnTimer.stop();

        // Финальный подсчёт
        const finalRegions = this.gameState.finalizeGame();

        this.gameState.phase = 'gameOver';
        logger.info('[GameLoop]', `🏁 Игра окончена`);

        // Рассылаем данные для анимации
        if (finalRegions.length > 0) {
            this.broadcaster.broadcast('game:final-scoring', { regions: finalRegions });
        }

        // Ждём анимации перед финальным state
        const animationDelay = finalRegions.length * 3000;
        this.schedule(() => {
            this.broadcaster.broadcast('game:over', { finalScores: this.gameState.players });
            this.broadcaster.broadcastState();
        }, animationDelay);
    }

    // ============================================
    // 🧹 ОЧИСТКА
    // ============================================

    /**
     * Остановить таймер и освободить ресурсы.
     */
    dispose(): void {
        this.disposed = true;
        this.turnTimer.stop();
        for (const id of this.pendingTimeouts) {
            clearTimeout(id);
        }
        this.pendingTimeouts.clear();
    }
}
