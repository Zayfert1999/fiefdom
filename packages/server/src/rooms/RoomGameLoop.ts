// packages/server/src/rooms/RoomGameLoop.ts
// 🌟 Игровой цикл: старт, ходы, таймер, конец игры.
// Отделён от Room для чёткого разделения ответственности.

import type { RoomSettings } from '@fiefdom/shared/protocol/events';
import type { PlayerConnection } from '../state/PlayerConnection';
import type { ServerGameState } from '../state/ServerGameState';
import { FischerClock, normalizeTimeControl } from '@fiefdom/shared/core/fischerClock';
import type { RoomBroadcaster } from './RoomBroadcaster';
import { generateGameSeed } from '@fiefdom/shared/prng/seedRandom';
import { logger } from '../utils/logger';

// 🌟 Время, в течение которого все видят мипла перед проверкой регионов
const MEEPLE_VISIBLE_DELAY = 1000; // 1 секунда

// ============================================
// 🕳️ ПОЛИТИКА ДЛЯ ОТСУТСТВУЮЩИХ ИГРОКОВ
// ============================================

/**
 * Сколько ждём отключённого игрока, чей сейчас ход (перезагрузка страницы,
 * кратковременный обрыв). Не вернулся — ход пропускается, а тайл из его руки
 * выбрасывается. Действует и при выключенном таймере хода, иначе игра
 * зависала бы навсегда.
 */
const ABSENT_GRACE_MS = 20_000;

/**
 * Сколько ходов ПОДРЯД игрок может пропустить (офлайн, по бездействию или по времени).
 * Достиг лимита — считается покинувшим игру: в очереди ходов он автоматически
 * пропускается (без ожидания и без таймера), вернуться в партию уже нельзя.
 * Удачный ход обнуляет счётчик.
 */
export const MAX_MISSED_TURNS = 3;

// ============================================
// 💤 AFK: ИГРОК НА СВЯЗИ, НО НЕ ХОДИТ
// ============================================
// Банк времени по Фишеру (например, 10 минут) — это время на ВСЮ партию. Если ждать,
// пока AFK-игрок сожжёт банк целиком, остальные простоят до 10 минут. Поэтому на ход
// действует ещё и лимит бездействия: клиент шлёт `game:activity` при любом действии
// игрока (мышь, клавиши, касания); нет активности — ход пропускается задолго до
// конца банка. Тратить банк на размышления это не мешает: пока игрок что-то
// делает, лимит не срабатывает, ограничивают только часы.

/** Сколько можно ничего не делать в свой ход */
const IDLE_LIMIT_MS = 60_000;
/** То же для игрока, который уже пропустил ход (подозрение на AFK — ждём меньше) */
const IDLE_LIMIT_AFTER_MISS_MS = 25_000;
/** За сколько до пропуска предупреждаем игрока (game:afk-warning) */
const IDLE_WARNING_MS = 15_000;
/** Период публикации часов и проверок */
const TICK_MS = 1000;

/**
 * Если ходы пропускаются столько кругов подряд (по каждому игроку), игра
 * считается брошенной и завершается подсчётом очков. Иначе при уходе всех
 * игроков тайл возвращался бы в колоду бесконечно.
 */
const MAX_SKIP_ROUNDS = 2;

/**
 * 🌟 Управляет игровым циклом:
 * - Старт игры
 * - Начало хода и таймер
 * - Обработка ходов
 * - Переход между ходами
 * - Конец игры
 */
export class RoomGameLoop {
    /** Часы Фишера (создаются в initializeGame) */
    private clock: FischerClock | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;
    /** Когда игрок, чей сейчас ход, в последний раз подавал признаки жизни */
    private lastActivityAt = 0;
    private afkWarned = false;

    // 🌟 Отложенные шаги (пауза на мипла, анимации регионов, финал).
    // Хранятся, чтобы dispose() мог их отменить: иначе после удаления комнаты
    // они продолжили бы двигать игру «в пустоту» и запускать таймеры.
    private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
    private disposed = false;

    // 🕳️ Отсутствующие игроки
    private absentTimer: ReturnType<typeof setTimeout> | null = null;
    /** Пропущенные ходы подряд среди ВСЕХ игроков (сбрасывается любым удачным ходом) */
    private consecutiveSkips = 0;
    /** Подряд пропущенные ходы каждого игрока (3 → выбывает; сбрасывается удачным ходом) */
    private missedTurns = new Map<string, number>();
    /** Игра уже завершена (защита от повторного endGame) */
    private ended = false;

    constructor(
        private players: Map<string, PlayerConnection>,
        private gameState: ServerGameState,
        private broadcaster: RoomBroadcaster,
        private settings: RoomSettings
    ) { }

    /** setTimeout с учётом dispose(): после освобождения комнаты колбэк не вызывается */
    private schedule(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
        const id = setTimeout(() => {
            this.pendingTimeouts.delete(id);
            if (this.disposed) return;
            fn();
        }, delayMs);
        this.pendingTimeouts.add(id);
        return id;
    }

    private cancel(id: ReturnType<typeof setTimeout>): void {
        clearTimeout(id);
        this.pendingTimeouts.delete(id);
    }

    // ============================================
    // 🕳️ ОТСУТСТВУЮЩИЕ ИГРОКИ
    // ============================================

    private hasConnectedPlayers(): boolean {
        for (const conn of this.players.values()) {
            if (!conn.isDisconnected) return true;
        }
        return false;
    }

    private clearAbsentTimer(): void {
        if (this.absentTimer !== null) {
            this.cancel(this.absentTimer);
            this.absentTimer = null;
        }
    }

    /**
     * Пересмотреть «сторожа»: нужно ли пропускать ход отключённого игрока.
     * Идемпотентен — повторный вызов не сдвигает уже идущий отсчёт.
     * Сторож работает только в окне хода (тайл выдан, ход ещё не сыгран),
     * и только если в комнате остался кто-то онлайн: пустую комнату
     * убирает RoomManager (cleanup), а игру ставить на «автопилот» некому.
     */
    private armAbsentWatch(): void {
        const gs = this.gameState;
        if (this.disposed || gs.phase !== 'playing' || !gs.drawnTile) {
            this.clearAbsentTimer();
            return;
        }

        const current = this.players.get(gs.currentPlayer.id);
        const shouldWatch = !!current && current.isDisconnected && this.hasConnectedPlayers();
        if (!shouldWatch) {
            this.clearAbsentTimer();
            return;
        }
        if (this.absentTimer !== null) return;

        logger.info('[GameLoop]', `⏳ Ход игрока ${current?.name} (отключён): ждём ${ABSENT_GRACE_MS / 1000}с до пропуска`);
        this.absentTimer = this.schedule(() => {
            this.absentTimer = null;
            this.skipCurrentTurn('absent');
        }, ABSENT_GRACE_MS);
    }

    /** Room сообщает, что кто-то отключился или вернулся */
    onConnectionChanged(): void {
        this.armAbsentWatch();
    }

    // ============================================
    // 🕐 ЧАСЫ И AFK-КОНТРОЛЬ
    // ============================================

    private broadcastClocks(now = Date.now()): void {
        if (!this.clock) return;
        this.broadcaster.broadcast('game:timer-update', {
            banksMs: this.clock.snapshot(now),
            activePlayerId: this.clock.activePlayerId,
        });
    }

    private startTicker(): void {
        this.stopTicker();
        this.ticker = setInterval(() => this.tick(), TICK_MS);
    }

    private stopTicker(): void {
        if (this.ticker !== null) {
            clearInterval(this.ticker);
            this.ticker = null;
        }
    }

    /** Окно хода открыто: тайл выдан, ход ещё не сыгран */
    private isTurnInProgress(): boolean {
        const gs = this.gameState;
        return !this.disposed && !this.ended && gs.phase === 'playing' && !!gs.drawnTile;
    }

    /** Раз в секунду: публикуем часы, проверяем «упал флажок» и бездействие */
    private tick(): void {
        if (!this.isTurnInProgress() || !this.clock) {
            this.stopTicker();
            return;
        }

        // В комнате никого нет онлайн — часы стоят (иначе вернувшийся игрок застал бы пустой банк)
        if (!this.hasConnectedPlayers()) {
            this.clock.stop(Date.now());
            return;
        }
        // Кто-то вернулся после паузы — продолжаем с того же места
        if (this.clock.activePlayerId === null) {
            this.clock.start(this.gameState.currentPlayer.id, Date.now());
            this.lastActivityAt = Date.now();
        }

        const now = Date.now();
        const playerId = this.gameState.currentPlayer.id;
        this.broadcastClocks(now);

        // 1) Время на часах закончилось
        if (this.clock.isFlagged(playerId, now)) {
            this.skipCurrentTurn('timeout');
            return;
        }

        // 2) Бездействие (только для игроков на связи: отключённых обрабатывает сторож absent)
        const conn = this.players.get(playerId);
        if (!conn || conn.isDisconnected) return;

        const idleLimit = (this.missedTurns.get(playerId) ?? 0) > 0
            ? IDLE_LIMIT_AFTER_MISS_MS
            : IDLE_LIMIT_MS;
        const idleMs = now - this.lastActivityAt;

        if (idleMs >= idleLimit) {
            this.skipCurrentTurn('afk');
            return;
        }
        const leftMs = idleLimit - idleMs;
        if (leftMs <= IDLE_WARNING_MS && !this.afkWarned) {
            this.afkWarned = true;
            conn.emit('game:afk-warning', { secondsLeft: Math.ceil(leftMs / 1000) });
        }
    }

    /**
     * Игрок подал признак жизни (game:activity, ход, запрос синхронизации).
     * Учитывается только для игрока, чей сейчас ход.
     */
    noteActivity(playerId: string): void {
        if (!this.isTurnInProgress() || this.gameState.currentPlayer.id !== playerId) return;
        this.lastActivityAt = Date.now();
        this.afkWarned = false;
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

        // 🕐 У каждого игрока — свой банк времени на всю партию (+ инкремент после каждого хода)
        this.clock = new FischerClock(
            playerProfiles.map(p => p.id),
            normalizeTimeControl(this.settings.timeControl)
        );
        this.missedTurns.clear();
        this.consecutiveSkips = 0;

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
        if (this.disposed || this.ended) return;
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

        // 🕐 Часы игрока пошли; бездействие считаем с начала хода
        const now = Date.now();
        this.clock?.start(gs.currentPlayer.id, now);
        this.lastActivityAt = now;
        this.afkWarned = false;
        this.broadcastClocks(now);
        this.startTicker();

        // Если ходит отключённый игрок — запускаем отсчёт до автопропуска
        this.armAbsentWatch();
    }

    /**
     * ⏭️ Пропуск хода сервером. Тайл из руки выбрасывается.
     *  - timeout — на часах Фишера закончилось время: игрок становится зрителем;
     *  - afk     — игрок на связи, но бездействует (см. IDLE_LIMIT_MS);
     *  - absent  — игрок отключён и не вернулся за ABSENT_GRACE_MS;
     *  - left    — игрок вышел из игры прямо в свой ход (без ожидания и без таймера).
     *
     * Пропуски `afk` и `absent` засчитываются как «пропущенный ход»: MAX_MISSED_TURNS таких
     * ходов подряд — и игрок выбывает из партии. Инкремент за пропущенный ход НЕ начисляется.
     */
    private skipCurrentTurn(reason: 'timeout' | 'afk' | 'absent' | 'left'): void {
        const gs = this.gameState;
        // Защита от гонок: ход уже сыгран (идёт пауза после commit) или игра окончена
        if (this.disposed || this.ended || gs.phase !== 'playing' || !gs.drawnTile) return;

        const skipped = gs.currentPlayer;
        logger.warn('[GameLoop]', `Игрок ${skipped.name} → пропуск хода (${reason})`);

        // Один из механизмов (часы/AFK/сторож) сработал — остальные больше не нужны
        this.stopTicker();
        this.clearAbsentTimer();
        this.clock?.stop(Date.now()); // без инкремента

        let missedTurns = 0;
        if (reason === 'afk' || reason === 'absent') {
            missedTurns = (this.missedTurns.get(skipped.id) ?? 0) + 1;
            this.missedTurns.set(skipped.id, missedTurns);

            this.consecutiveSkips += 1;
            // 🌟 Сообщаем всем, чей ход пропущен (клиенты покажут toast)
            this.broadcaster.broadcast('game:turn-skipped', {
                playerId: skipped.id,
                reason,
                missedTurns,
                maxMissedTurns: MAX_MISSED_TURNS,
            });
        }

        // Выбрасываем тайл и передаём ход (выбывшие игроки в очереди пропускаются)
        gs.skipTurn();

        // Выбытие игрока: сам вышел или исчерпал лимит пропусков
        let ended = false;
        if (reason === 'left') {
            ended = this.abandonPlayer(skipped.id, 'left');
        } else if (reason === 'timeout') {
            // ⏰ Время на часах вышло — играть дальше нельзя, игрок становится зрителем
            ended = this.abandonPlayer(skipped.id, 'timeout');
        } else if (missedTurns >= MAX_MISSED_TURNS) {
            ended = this.abandonPlayer(skipped.id, 'missed-turns');
        }
        if (ended) return;

        // Все оставшиеся игроки пропускают ход несколько кругов подряд → игра брошена
        if (this.consecutiveSkips >= Math.max(gs.activePlayerCount * MAX_SKIP_ROUNDS, 4)) {
            logger.warn('[GameLoop]', `🏳️ ${this.consecutiveSkips} пропусков подряд → игра завершена досрочно`);
            this.endGame('abandoned');
            return;
        }

        // Передаём ход следующему игроку
        this.broadcaster.broadcastState();
        this.beginTurn();
    }

    // ============================================
    // 🚪 ВЫБЫТИЕ ИГРОКОВ
    // ============================================

    /**
     * Игрок выбывает из партии.
     * @returns true, если из-за этого игра завершилась (остался один игрок)
     */
    private abandonPlayer(playerId: string, reason: 'left' | 'missed-turns' | 'timeout'): boolean {
        const gs = this.gameState;
        const marked = reason === 'timeout' ? gs.markPlayerTimedOut(playerId) : gs.markPlayerLeft(playerId);
        if (!marked) return false;

        logger.warn('[GameLoop]', `🚪 Игрок ${playerId} выбыл из игры (${reason})`);
        this.missedTurns.delete(playerId);
        this.broadcaster.broadcast('game:player-abandoned', { playerId, reason });

        // Остался один (или никого) — играть не с кем: подводим итоги
        if (gs.activePlayerCount < 2 && gs.phase === 'playing') {
            logger.warn('[GameLoop]', `🏳️ В игре остался ${gs.activePlayerCount} игрок → досрочное завершение`);
            this.endGame('forfeit');
            return true;
        }
        return false;
    }

    /**
     * Игрок явно вышел из игры (кнопка «Выйти»).
     * Если сейчас его ход — пропускаем его сразу, без ожидания и без таймера;
     * иначе просто помечаем выбывшим: очередь сама его пропустит.
     */
    onPlayerLeft(playerId: string): void {
        const gs = this.gameState;
        if (this.disposed || this.ended || gs.phase !== 'playing') return;

        if (gs.currentPlayer.id === playerId && gs.drawnTile) {
            this.skipCurrentTurn('left');
            return;
        }
        this.abandonPlayer(playerId, 'left');
    }

    /** Покинул ли игрок партию (вышел / пропустил 3 хода). Зрители из-за времени — нет */
    isPlayerAbandoned(playerId: string): boolean {
        // Зритель из-за времени «покинувшим» не считается: он может вернуться и наблюдать
        return this.gameState.isPlayerLeft(playerId) && !this.gameState.isPlayerTimedOut(playerId);
    }

    /**
     * Переход к следующему ходу.
     * Вызывается после обработки хода или таймаута.
     */
    private proceedToNextTurn(): void {
        const gs = this.gameState;
        // Игра могла закончиться за время паузы (например, все остальные вышли)
        if (this.disposed || this.ended || gs.phase !== 'playing') return;

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
        this.stopTicker();
        this.clearAbsentTimer();

        // 🕐 Ход сделан: часы останавливаются, к банку добавляется инкремент
        this.clock?.commit(Date.now());
        this.broadcastClocks();

        // Игрок жив и играет — сбрасываем счётчики пропусков
        this.missedTurns.delete(playerId);
        this.consecutiveSkips = 0;

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
    private endGame(reason: 'completed' | 'abandoned' | 'forfeit' = 'completed'): void {
        if (this.ended) return;
        this.ended = true;
        this.stopTicker();
        this.clock?.stop(Date.now());
        this.clearAbsentTimer();

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
            this.broadcaster.broadcast('game:over', { finalScores: this.gameState.players, reason });
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
        this.stopTicker();
        this.absentTimer = null;
        for (const id of this.pendingTimeouts) {
            clearTimeout(id);
        }
        this.pendingTimeouts.clear();
    }
}
