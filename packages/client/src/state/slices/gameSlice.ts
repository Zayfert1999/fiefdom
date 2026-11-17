import type { StateCreator } from 'zustand';
import type { GameStore } from '../useGameStore';
import type { GamePhase, LastPlacedTile, CompletionAnimation, MoveSnapshot } from '../types';
import type { Player, PlacedTile, Tile, FeatureType } from '@fiefdom/shared/core/types';
import { getTilePorts, rotateFeatures } from '@fiefdom/shared/core/tileUtils';
import {
    SAVE_KEYS,
    saveGameState,
    loadGameState,
    clearGameState,
    type GameStateForSave,
    type SavedClockState,
} from '@/core/gameSaveManager';
import { RegionManager } from '@fiefdom/shared/core/regionManager';
import { findCompletedRegionsOnTile, findAllIncompleteRegionsWithMeeples, type CompletedRegion } from '@fiefdom/shared/core/scoring';
import { CAMERA_CONFIG } from '@fiefdom/shared/core/constants'
import { createDeck, drawPlayableTile, takeStartTile } from '@fiefdom/shared/core/deck';
import { settleRegions, applyDeltasToPlayers } from '@fiefdom/shared/core/applyRegions';
import { toast } from '@/state/useToastStore';
import { normalizeTimeControl, type TimeControl } from '@fiefdom/shared/core/fischerClock';


export interface GameSlice {
    //Игра
    deck: Tile[];
    totalTiles: number;
    /** Сколько тайлов осталось в колоде (локально — deck.length, онлайн — приходит от сервера) */
    deckCount: number;
    board: Map<string, PlacedTile>;
    players: Player[];
    currentTurn: number;
    drawnTile: Tile | null;
    phase: GamePhase;
    regionManager: RegionManager;
    visibleFeatureTypes: FeatureType[];
    completionAnimations: CompletionAnimation[];
    lastPlacedTiles: Map<string, LastPlacedTile>;


    //Инициализация игры
    initGame: (players: Omit<Player, 'score' | 'meepleCount' | 'pointsByCategory'>[]) => void;

    //Выдача тайла в начале хода
    drawTile: () => void;

    // Методы управления превью тайла 
    confirmPreview: () => void;
    confirmMeeple: () => void;

    // Вспомогательные функции
    processEndTurn: () => void;
    finishEndTurn: () => void;
    /** 🕐 Локальная игра: банк времени игрока исчерпан — он больше не ходит (зритель) */
    expireLocalTurn: () => void;
    processCompletedRegionsInStore: (regions: CompletedRegion[]) => void;
    processEndGameInStore: (nextTurn: number) => void;

    // Авто-сохранение игры
    autoSaveLocalGame: () => void;
    loadLocalGame: () => boolean;
    clearLocalSave: () => void;

    // === Дебаг-сохранение (ручное) ===
    saveDebugGame: () => void;
    loadDebugGame: () => void;
}

/**
 * Индекс следующего игрока в очереди. Проигравшие по времени пропускаются.
 * Если активных игроков не осталось — возвращает следующий индекс как есть.
 */
function nextActiveTurn(players: Player[], current: number, timedOutIds: string[]): number {
    for (let step = 1; step <= players.length; step++) {
        const index = (current + step) % players.length;
        if (!timedOutIds.includes(players[index].id)) return index;
    }
    return (current + 1) % players.length;
}

/**
 * 🕐 Часы для сохранения: банки игроков на ТЕКУЩИЙ момент (у игрока с идущими часами
 * вычитается время, прошедшее с последнего снимка).
 */
function captureClock(state: GameStore): SavedClockState {
    const snapshot = state.clockSnapshot;
    let banksMs: Record<string, number> | null = null;
    if (snapshot) {
        const elapsed = Date.now() - snapshot.receivedAt;
        banksMs = {};
        for (const [id, bank] of Object.entries(snapshot.banksMs)) {
            banksMs[id] = Math.max(0, snapshot.activePlayerId === id ? bank - elapsed : bank);
        }
    }
    return {
        timeControl: state.gameTimeControl,
        banksMs,
        timedOutPlayerIds: state.timedOutPlayerIds,
    };
}

/**
 * 🕐 Состояние часов после загрузки сохранения.
 * Сохранение без часов (старое) — партия продолжается с текущей настройкой таймера и свежими банками.
 */
function restoreClock(saved: SavedClockState | undefined, fallback: TimeControl | null) {
    if (!saved) {
        return { gameTimeControl: fallback, clockSnapshot: null, timedOutPlayerIds: [] as string[] };
    }
    const timeControl = saved.timeControl ? normalizeTimeControl(saved.timeControl) : null;
    return {
        gameTimeControl: timeControl,
        clockSnapshot: timeControl && saved.banksMs
            ? { banksMs: saved.banksMs, activePlayerId: null, receivedAt: Date.now() }
            : null,
        timedOutPlayerIds: Array.isArray(saved.timedOutPlayerIds) ? saved.timedOutPlayerIds : [],
    };
}

export const createGameSlice: StateCreator<GameStore, [], [], GameSlice> = (set, get) => ({
    // Начальное состояние
    deck: [],
    totalTiles: 0,
    deckCount: 0,
    board: new Map(),
    players: [],
    currentTurn: 0,
    drawnTile: null,
    phase: 'lobby',
    regionManager: new RegionManager(),
    visibleFeatureTypes: ['field'],
    debugSelectedTile: null,
    completionAnimations: [],
    lastPlacedTiles: new Map(),


    // ============================================
    // 🎮 ИНИЦИАЛИЗАЦИЯ ИГРЫ
    // ============================================
    initGame: (newPlayers) => {
        console.log('🎮 [Store] Инициализация игры...');
        // 🌟 Стартовый тайл фиксирован (как на сервере): город + дорога насквозь
        const { startTile: startingTile, deck: fullDeck } = takeStartTile(createDeck());
        const totalTiles = fullDeck.length + 1; // колода + стартовый тайл
        const gameBoard = new Map<string, PlacedTile>();
        const rm = new RegionManager();

        if (startingTile) {
            gameBoard.set('0,0', {
                templateId: startingTile.id,
                x: 0, y: 0, rotation: 0,
                features: startingTile.features,
                derivedPorts: getTilePorts(startingTile),
            });

            for (const feature of startingTile.features) {
                rm.makeSet(`0,0:${feature.id}`, feature.type, feature.shieldSpot !== undefined);
            }
        }

        set({
            players: newPlayers.map(p => ({
                ...p,
                meepleCount: 8,
                pointsByCategory: {
                    road: 0,
                    city: 0,
                    field: 0,
                    monastery: 0,
                },
                score: 0
            })),
            deck: fullDeck,
            deckCount: fullDeck.length,
            totalTiles,
            board: gameBoard,
            currentTurn: 0,
            drawnTile: null,
            phase: 'startTurn',
            regionManager: rm,
            debugSelectedTile: null,
            completionAnimations: [],
            lastPlacedTiles: new Map(),
        });
    },

    // ============================================
    // 🎴 ВЫДАЧА ТАЙЛА
    // ============================================
    drawTile: () => {
        const state = get();

        // Валидация фазы
        if (state.phase !== 'startTurn') {
            console.warn(`⚠️ [Store] drawTile вызван не в фазе startTurn (текущая: ${state.phase})`);
            return;
        }

        if (state.drawnTile !== null) {
            console.warn('⚠️ [Store] Тайл уже выдан');
            return;
        }

        // 🌟 ИСПОЛЬЗУЕМ ОБЩУЮ ФУНКЦИЮ ИЗ SHARED
        const { drawnTile, newDeck } = drawPlayableTile(state.deck, state.board);

        if (!drawnTile) {
            // 🌟 Играбельных тайлов нет → конец игры С финальным подсчётом (как на сервере).
            // Раньше здесь сразу ставился gameOver, и миплы на доске не приносили очков.
            // Фаза endTurn блокирует доску и не даёт эффекту в App повторно вызвать drawTile.
            set({ deck: newDeck, deckCount: newDeck.length, phase: 'endTurn' });
            get().processEndGameInStore(state.currentTurn);
            return;
        }

        set({ deck: newDeck, deckCount: newDeck.length, drawnTile, phase: 'placeTile' });

        // 🌟 НОВОЕ: автосохранение в начале хода (только локальная игра)
        if (state.roomId === null) {
            get().autoSaveLocalGame();
        }
    },

    // ============================================
    // ✅ НОВОЕ: ПОДТВЕРЖДЕНИЕ ПРИМЕРКИ
    // Применяет preview-тайл к доске
    // ============================================
    confirmPreview: () => {
        const state = get();

        // 🌟 НОВОЕ: валидация фазы
        if (state.phase !== 'placeTile') {
            console.warn(`⚠️ [Store] confirmPreview вызван не в фазе placeTile (текущая: ${state.phase})`);
            return;
        }

        if (!state.previewTile || !state.previewRegionManager) {
            console.warn('⚠️ [Store] Нет preview-тайла для подтверждения');
            return;
        }

        const { x, y, rotation, tile } = state.previewTile;

        // 🌟 СЕТЕВОЙ РЕЖИМ: НЕ отправляем на сервер
        // Просто переходим в placeMeeple локально
        if (state.roomId !== null) {
            const snapshot: MoveSnapshot = {
                board: new Map(state.board),
                regionManager: state.regionManager,
                drawnTile: state.drawnTile!,
                deck: [...state.deck],
                players: state.players,
                previewTile: { ...state.previewTile },
                previewTileRegionManager: state.previewRegionManager.clone(),
            };

            const rotatedFeatures = rotateFeatures(state.previewTile.tile.features, rotation);
            const newBoard = new Map(state.board);
            newBoard.set(`${x},${y}`, {
                templateId: state.previewTile.tile.id,
                x, y, rotation,
                features: rotatedFeatures,
                derivedPorts: getTilePorts({ ...state.previewTile.tile, features: rotatedFeatures }),
            });

            set({
                board: newBoard,
                regionManager: state.previewRegionManager,
                previewRegionManager: null,
                previewTile: null,
                drawnTile: null,
                phase: 'placeMeeple',
                moveSnapshot: snapshot,
            });
            console.log(`✅ [Store] Примерка подтверждена (локально, ждём мипла)`);
            return;
        }

        // Сохраняем snapshot ПОЛНОСТЬЮ (включая preview)
        const snapshot: MoveSnapshot = {
            board: new Map(state.board),
            regionManager: state.regionManager,
            drawnTile: state.drawnTile!,
            deck: [...state.deck],
            players: state.players,

            previewTile: { ...state.previewTile },
            previewTileRegionManager: state.previewRegionManager.clone(),
        };

        const rotatedFeatures = rotateFeatures(tile.features, rotation);
        const newBoard = new Map(state.board);
        newBoard.set(`${x},${y}`, {
            templateId: tile.id,
            x, y, rotation,
            features: rotatedFeatures,
            derivedPorts: getTilePorts({ ...tile, features: rotatedFeatures }),
        });


        set({
            board: newBoard,
            regionManager: state.previewRegionManager,
            previewRegionManager: null,
            previewTile: null,
            drawnTile: null,
            phase: 'placeMeeple',
            moveSnapshot: snapshot,
        });
        console.log(`✅ [Store] Примерка подтверждена, тайл установлен: (${x}, ${y})`);
    },

    // ============================================
    // ✅ НОВОЕ: ПОДТВЕРЖДЕНИЕ ХОДА
    // Превращает временный мипл в постоянный ИЛИ пропускает ход
    // ============================================
    confirmMeeple: () => {
        const state = get();

        // 🌟 НОВОЕ: валидация фазы
        if (state.phase !== 'placeMeeple') {
            console.warn(`⚠️ [Store] confirmMeeple вызван не в фазе placeMeeple (текущая: ${state.phase})`);
            return;
        }

        const tiles = Array.from(state.board.values());
        const last = tiles[tiles.length - 1];

        // 🌟 СЕТЕВОЙ РЕЖИМ: отправляем commit-move на сервер
        if (state.roomId !== null) {
            const tileData = {
                x: last.x,
                y: last.y,
                rotation: last.rotation,
            };

            const meepleData = last.meeple?.isTemporary
                ? { featureId: last.meeple.featureId, x: last.meeple.x, y: last.meeple.y }
                : null;

            console.log(`📤 [Store] Отправка commit-move на сервер`);

            set({ phase: 'endTurn' });
            state.sendCommitMove(tileData, meepleData);

            // НЕ меняем состояние локально — ждём state-update от сервера
            return;
        }

        if (last?.meeple?.isTemporary) {
            const { featureId } = last.meeple;


            // Превращаем временный мипл в постоянный
            const newBoard = new Map(state.board);
            newBoard.set(`${last.x},${last.y}`, {
                ...last,
                meeple: { ...last.meeple, isTemporary: false },
            });

            set({
                board: newBoard,
                regionManager: state.previewRegionManager!,
                previewRegionManager: null,
                phase: 'endTurn',
            });

            console.log(`✅ [Store] Мипл подтверждён на ${featureId}`);
        } else {
            // Пропуск мипла
            set({ phase: 'endTurn' });
            console.log(`⏭️ [Store] Пропуск мипла`);
        }

        get().processEndTurn();

    },

    // ============================================
    // 🔄 ЗАВЕРШЕНИЕ ХОДА
    // ============================================
    processEndTurn: () => {
        console.log("🔄 [Store] Начало обработки фазы 'endTurn'.");
        const state = get();

        let lastTile: PlacedTile | undefined;
        for (const tile of state.board.values()) lastTile = tile;

        let completedRegions: CompletedRegion[] = [];
        if (lastTile) {
            completedRegions = findCompletedRegionsOnTile(state.board, state.regionManager, lastTile);
        }

        if (completedRegions.length > 0) {
            get().processCompletedRegionsInStore(completedRegions);

            // ⏱️ Ход передаётся, когда доиграна очередь анимаций (+ короткая пауза камеры).
            // completed === false — игру закрыли, пока шла анимация: ход передавать не нужно.
            console.log(`⏱️ [Store] Ждём окончания анимаций перед передачей хода`);
            void get().whenScoreAnimationsIdle().then(completed => {
                if (!completed) return;
                setTimeout(() => get().finishEndTurn(), CAMERA_CONFIG.ANIMATION_DURATION);
            });
        } else {
            // ✅ Нет регионов → сразу передаём ход
            console.log(`✅ [Store] Нет регионов → немедленная передача хода`);
            get().finishEndTurn();
        }

    },

    // ============================================
    // 🌟 НОВОЕ: Завершение хода
    // ============================================
    // ============================================
    // 🕐 ВРЕМЯ НА ЧАСАХ ВЫШЛО (только локальная игра; онлайн это делает сервер)
    // ============================================
    expireLocalTurn: () => {
        const state = get();
        if (state.roomId !== null) return;
        if (state.phase !== 'placeTile' && state.phase !== 'placeMeeple') return;

        const loser = state.players[state.currentTurn];
        if (!loser || state.timedOutPlayerIds.includes(loser.id)) return;

        // Незавершённый ход игрока без времени отменяем: если тайл уже подтверждён, но мипл ещё
        // не выбран, откатываем доску к состоянию до хода (тайл возвращается в «руку»)
        if (state.phase === 'placeMeeple' && state.moveSnapshot) {
            get().rollbackMove();
        }

        console.log(`⏰ [Store] У ${loser.name} закончилось время — дальше он только наблюдает`);
        toast.warning(`⏰ У ${loser.name} вышло время — дальше он наблюдает за игрой`, { duration: 8000 });

        // Тайл из руки выбрасывается (в колоду не возвращается), превью отменяется
        set({
            previewTile: null,
            previewRegionManager: null,
            moveSnapshot: null,
            drawnTile: null,
        });

        // Игрок становится зрителем: очередь его пропускает, очки и миплы на доске остаются
        const timedOutPlayerIds = [...state.timedOutPlayerIds, loser.id];
        set({ timedOutPlayerIds });

        const nextTurn = nextActiveTurn(state.players, state.currentTurn, timedOutPlayerIds);
        const activeCount = state.players.length - timedOutPlayerIds.length;

        // Остался один игрок (или колода пуста) — подводим итоги
        if (activeCount < 2 || get().deck.length === 0) {
            get().processEndGameInStore(nextTurn);
            return;
        }
        set({ currentTurn: nextTurn, phase: 'startTurn' });
    },

    finishEndTurn: () => {
        const state = get();
        const nextTurn = nextActiveTurn(state.players, state.currentTurn, state.timedOutPlayerIds);
        const currentPlayer = state.players[state.currentTurn];
        let lastTile: PlacedTile | undefined;
        for (const tile of state.board.values()) lastTile = tile;

        // 🌟 Обновляем подсветку для текущего игрока
        const newLastPlacedTiles = new Map(state.lastPlacedTiles);
        if (lastTile) {
            newLastPlacedTiles.set(currentPlayer.id, {
                x: lastTile.x,
                y: lastTile.y,
                color: currentPlayer.color,
            });
            console.log(`🎨 [Store] Подсветка обновлена для игрока ${currentPlayer.name}: (${lastTile.x}, ${lastTile.y})`);
        }

        console.log(`🏁 [Store] Передача хода: ${state.currentTurn} → ${nextTurn}`);

        // Проверка конца игры
        if (state.deck.length === 0) {
            console.log('🏁 [Store] Колода пуста! Переход к концу игры.');
            get().processEndGameInStore(nextTurn);
            return;
        }

        // 🌟 Передаём ход следующему игроку
        set({
            currentTurn: nextTurn,
            drawnTile: null,
            phase: 'startTurn',
            lastPlacedTiles: newLastPlacedTiles
        });
    },

    // ============================================
    // 🌟 ВСПОМОГАТЕЛЬНАЯ: обработка завершённых регионов
    // Используется и в середине игры, и в конце
    // ============================================
    processCompletedRegionsInStore: (regions: CompletedRegion[]) => {
        const state = get();
        const rm = state.regionManager.clone();

        // 🌟 Очки и возврат миплов — та же функция, что использует сервер
        const deltas = settleRegions(rm, regions);

        // 🌟 Состояние меняется СРАЗУ: миплы снимаются с доски. То, что видит игрок,
        // рисует слой анимаций (ghostMeeples из region.meeples) — он не зависит от доски,
        // поэтому state-update от сервера не может прервать анимацию.
        const board = new Map(state.board);
        for (const region of regions) {
            for (const m of region.meeples) {
                const tile = board.get(m.tileKey);
                if (tile?.meeple?.featureId === m.featureId) {
                    board.set(m.tileKey, { ...tile, meeple: undefined });
                }
            }
        }

        set({
            players: applyDeltasToPlayers(state.players, deltas),
            regionManager: rm,
            board,
        });

        // Показ: очередь анимаций (строго по порядку, очки в счётчике — по ходу показа)
        get().enqueueScoreAnimations(regions);
    },

    // ============================================
    // 🏁 ВСПОМОГАТЕЛЬНАЯ: обработка конца игры
    // 🌟 Теперь с поэтапной анимацией, как в середине игры
    // ============================================
    processEndGameInStore: (nextTurn: number) => {
        const state = get();

        console.log('🏁 [Store] === КОНЕЦ ИГРЫ: сбор всех регионов с миплами ===');

        // 🌟 ИСПОЛЬЗУЕМ shared-функцию вместо ручной итерации
        const regionsWithMeeples = findAllIncompleteRegionsWithMeeples(
            state.board,
            state.regionManager
        );

        console.log(`🏁 [Store] Найдено ${regionsWithMeeples.length} регионов для финального подсчёта`);

        // Используем ту же функцию, что и в середине игры
        if (regionsWithMeeples.length > 0) {
            get().processCompletedRegionsInStore(regionsWithMeeples);
        }

        // После ВСЕХ анимаций — переходим в gameOver
        // (completed === false — игру закрыли во время анимации: gameOver не нужен)
        void get().whenScoreAnimationsIdle().then(completed => {
            if (!completed) return;

            set({
                currentTurn: nextTurn,
                drawnTile: null,
                phase: 'gameOver'
            });

            // Фиксируем время окончания игры (для локальной игры)
            get().setGameEndTime(Date.now());
            // 🌟 НОВОЕ: удаляем локальное сохранение при конце игры
            get().clearLocalSave();
            console.log(`🏁 [Store] Переход в фазу gameOver`);
        });
    },

    // ============================================
    // 💾 АВТОСОХРАНЕНИЕ (локальная игра)
    // ============================================
    autoSaveLocalGame: () => {
        const state = get();
        // Сохраняем только локальную игру (не сетевую)
        if (state.roomId !== null) return;
        // Не сохраняем лобби или gameOver
        if (state.phase === 'lobby' || state.phase === 'gameOver') return;

        const dataForSave: GameStateForSave = {
            board: state.board,
            regionManager: state.regionManager,
            players: state.players,
            deck: state.deck,
            currentTurn: state.currentTurn,
            phase: state.phase,
            drawnTile: state.drawnTile,
            totalTiles: state.totalTiles,
            lastPlacedTiles: state.lastPlacedTiles,
            showRegions: state.showRegions,
            showDeadCells: state.showDeadCells,
            enabledDeckView: state.enabledDeckView,
            gameStartTime: state.gameStartTime,
            lobbyPlayers: state.lobbyPlayers,
            clock: captureClock(state),
        };
        saveGameState(SAVE_KEYS.LOCAL, dataForSave);
    },

    // ============================================
    // 📂 ЗАГРУЗКА ЛОКАЛЬНОГО СОХРАНЕНИЯ
    // ============================================

    /**
     * 🌟 Загружает локальное сохранение.
     * Возвращает true если загрузка успешна.
     */
    loadLocalGame: () => {
        const data = loadGameState(SAVE_KEYS.LOCAL);
        if (!data) return false;

        // 🌟 ИСПРАВЛЕНО: data.board и data.lastPlacedTiles УЖЕ являются Map
        // (десериализованы в loadGameState → deserializeGameState)
        const regionManager = RegionManager.deserialize(data.regionManagerData);

        set({
            board: data.board,                   
            regionManager,
            players: data.players,
            deck: data.deck,
            deckCount: data.deck.length,
            currentTurn: data.currentTurn,
            phase: data.phase as GamePhase,
            drawnTile: data.drawnTile,
            totalTiles: data.totalTiles,
            lastPlacedTiles: data.lastPlacedTiles, 
            showRegions: data.showRegions,
            showDeadCells: data.showDeadCells,
            enabledDeckView: data.enabledDeckView,
            gameStartTime: data.gameStartTime ?? null,
            lobbyPlayers: data.lobbyPlayers || [],
            // 🕐 Часы восстанавливаются из сохранения (банки, зрители, контроль времени)
            ...restoreClock(data.clock, get().localTimeControl),
            previewTile: null,
            previewRegionManager: null,
            moveSnapshot: null,
            completionAnimations: [],
        });

        console.log(`📂 [GameSlice] Локальное сохранение загружено: ${data.board.size} тайлов`);
        return true;
    },

    /**
     * 🌟 Удаляет локальное сохранение.
     */
    clearLocalSave: () => {
        clearGameState(SAVE_KEYS.LOCAL);
    },

    // ============================================
    // 🐛 ДЕБАГ-СОХРАНЕНИЕ (ручное)
    // ============================================
    saveDebugGame: () => {
        const state = get();

        // 🌟 НОВОЕ: запрет загрузки в сетевом режиме
        if (state.roomId !== null) {
            console.warn('⚠️ [GameSlice] Нельзя загружать игру в сетевом режиме');
            return;
        }

        const dataForSave: GameStateForSave = {
            board: state.board,
            regionManager: state.regionManager,
            players: state.players,
            deck: state.deck,
            currentTurn: state.currentTurn,
            phase: state.phase,
            drawnTile: state.drawnTile,
            totalTiles: state.totalTiles,
            lastPlacedTiles: state.lastPlacedTiles,
            showRegions: state.showRegions,
            showDeadCells: state.showDeadCells,
            enabledDeckView: state.enabledDeckView,
            gameStartTime: state.gameStartTime,
            lobbyPlayers: state.lobbyPlayers,
            clock: captureClock(state),
        };
        saveGameState(SAVE_KEYS.DEBUG, dataForSave);
        console.log('💾 [GameSlice] Дебаг-сохранение создано');
    },

    loadDebugGame: () => {
        const state = get();

        // 🌟 НОВОЕ: запрет загрузки в сетевом режиме
        if (state.roomId !== null) {
            console.warn('⚠️ [GameSlice] Нельзя загружать игру в сетевом режиме');
            return;
        }

        const loaded = loadGameState(SAVE_KEYS.DEBUG);
        if (!loaded) {
            console.warn('⚠️ [GameSlice] Нет дебаг-сохранения');
            return;
        }

        const regionManager = RegionManager.deserialize(loaded.regionManagerData);

        set({
            board: loaded.board,
            regionManager,
            players: loaded.players,
            deck: loaded.deck,
            deckCount: loaded.deck.length,
            currentTurn: loaded.currentTurn,
            phase: loaded.phase,
            drawnTile: loaded.drawnTile,
            totalTiles: loaded.totalTiles,
            lastPlacedTiles: loaded.lastPlacedTiles,
            showRegions: loaded.showRegions,
            showDeadCells: loaded.showDeadCells,
            enabledDeckView: loaded.enabledDeckView,
            gameStartTime: loaded.gameStartTime,
            lobbyPlayers: loaded.lobbyPlayers,
            ...restoreClock(loaded.clock, get().localTimeControl),
            // Сброс клиентского состояния
            previewTile: null,
            previewRegionManager: null,
            moveSnapshot: null,
            completionAnimations: [],
        });
        console.log('📂 [GameSlice] Дебаг-сохранение загружено');
    },
});
