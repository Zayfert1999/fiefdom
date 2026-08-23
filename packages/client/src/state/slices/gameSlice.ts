import type { StateCreator } from 'zustand';
import type { GameStore } from '../useGameStore';
import type { GamePhase, LastPlacedTile, CompletionAnimation, MoveSnapshot } from '../types';
import type { Player, PlacedTile, PlacedMeeple, Tile, FeatureType } from '@carcassonne/shared/core/types';
import { getTileSides, rotateFeatures } from '@carcassonne/shared/core/tileUtils';
import {
    SAVE_KEYS,
    saveGameState,
    loadGameState,
    clearGameState,
    type GameStateForSave,
} from '@/core/gameSaveManager';
import { RegionManager } from '@carcassonne/shared/core/regionManager';
import { findCompletedRegionsOnTile, findAllIncompleteRegionsWithMeeples, type CompletedRegion } from '@carcassonne/shared/core/scoring';
import { COMPLITED_REGION_ANIMATION_DURATION, CAMERA_CONFIG } from '@carcassonne/shared/core/constants'
import { createDeck, drawPlayableTile } from '@carcassonne/shared/core/deck';


export interface GameSlice {
    //Игра
    deck: Tile[];
    totalTiles: number;
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
    processCompletedRegionsInStore: (regions: CompletedRegion[]) => void;
    processEndGameInStore: (nextTurn: number) => void;
    animateRegionCompletion: (
        region: CompletedRegion,
        startDelay?: number,
        preCollectedMeeples?: Array<{
            tileKey: string;
            meeple: PlacedMeeple;
            points: number | undefined;
        }>
    ) => void;

    // Авто-сохранение игры
    autoSaveLocalGame: () => void;
    loadLocalGame: () => boolean;
    clearLocalSave: () => void;

    // === Дебаг-сохранение (ручное) ===
    saveDebugGame: () => void;
    loadDebugGame: () => void;
}

export const createGameSlice: StateCreator<GameStore, [], [], GameSlice> = (set, get) => ({
    // Начальное состояние
    deck: [],
    totalTiles: 0,
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
        const fullDeck = createDeck();
        const totalTiles = fullDeck.length
        const gameBoard = new Map<string, PlacedTile>();
        const startingTile = fullDeck.pop();
        const rm = new RegionManager();

        if (startingTile) {
            gameBoard.set('0,0', {
                templateId: startingTile.id,
                x: 0, y: 0, rotation: 0,
                features: startingTile.features,
                derivedSides: getTileSides(startingTile),
            });

            for (const feature of startingTile.features) {
                rm.makeSet(`0,0:${feature.id}`, feature.type, (feature as any).hasShield ?? false);
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
            set({ deck: newDeck, phase: 'gameOver' });
            return;
        }

        set({ deck: newDeck, drawnTile, phase: 'placeTile' });

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
                previewTile: { ...state.previewTile },
                previewTileRegionManager: state.previewRegionManager.clone(),
            };

            const rotatedFeatures = rotateFeatures(state.previewTile.tile.features, rotation);
            const newBoard = new Map(state.board);
            newBoard.set(`${x},${y}`, {
                templateId: state.previewTile.tile.id,
                x, y, rotation,
                features: rotatedFeatures,
                derivedSides: getTileSides({ ...state.previewTile.tile, features: rotatedFeatures }),
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

            previewTile: { ...state.previewTile },
            previewTileRegionManager: state.previewRegionManager.clone(),
        };

        const rotatedFeatures = rotateFeatures(tile.features, rotation);
        const newBoard = new Map(state.board);
        newBoard.set(`${x},${y}`, {
            templateId: tile.id,
            x, y, rotation,
            features: rotatedFeatures,
            derivedSides: getTileSides({ ...tile, features: rotatedFeatures }),
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

            // ⏱️ Вычисляем максимальное время ожидания:
            const maxWaitTime = completedRegions.length * COMPLITED_REGION_ANIMATION_DURATION + CAMERA_CONFIG.ANIMATION_DURATION;

            console.log(`⏱️ [Store] Передача хода через ${maxWaitTime}мс`);

            setTimeout(() => {
                get().finishEndTurn();
            }, maxWaitTime);
        } else {
            // ✅ Нет регионов → сразу передаём ход
            console.log(`✅ [Store] Нет регионов → немедленная передача хода`);
            get().finishEndTurn();
        }

    },

    // ============================================
    // 🌟 НОВОЕ: Завершение хода
    // ============================================
    finishEndTurn: () => {
        const state = get();
        const nextTurn = (state.currentTurn + 1) % state.players.length;
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
        const newPlayers = [...state.players];

        for (let i = 0; i < regions.length; i++) {
            const region = regions[i];
            const startDelay = i * COMPLITED_REGION_ANIMATION_DURATION;

            // Получаем метаданные ДО markComplete
            const metaBeforeComplete = rm.getMetadata(region.rootKey);

            // ============================================
            // 🌟 ШАГ 1: Запускаем анимацию С предсобранымы миплами
            // ============================================
            get().animateRegionCompletion(region, startDelay);

            // ============================================
            // 🌟 ШАГ 2: Применяем изменения к RegionManager
            // ============================================
            rm.markComplete(region.rootKey, region.points);

            // ============================================
            // 🌟 ШАГ 3: Начисляем очки победителям
            // ============================================
            for (const winnerId of region.winners) {
                const playerIndex = newPlayers.findIndex(p => p.id === winnerId);
                if (playerIndex !== -1) {
                    const player = newPlayers[playerIndex];
                    newPlayers[playerIndex] = {
                        ...player,
                        score: player.score + region.points,
                        pointsByCategory: {
                            ...player.pointsByCategory,
                            [region.type]: player.pointsByCategory[region.type] + region.points
                        }
                    };
                    console.log(`🏆 [Store] Игроку ${newPlayers[playerIndex].name} +${region.points} очков за ${region.type}`);
                }
            }

            // ============================================
            // 🌟 ШАГ 4: Возвращаем миплы всем владельцам
            // ============================================
            for (const meepleOwnerId of region.allMeepleOwners) {
                const playerIndex = newPlayers.findIndex(p => p.id === meepleOwnerId);
                if (playerIndex !== -1) {
                    // 🌟 ИСПРАВЛЕНО: используем метаданные, полученные ДО markComplete
                    const meepleCount = metaBeforeComplete?.meepleCounts.get(meepleOwnerId) ?? 1;

                    newPlayers[playerIndex] = {
                        ...newPlayers[playerIndex],
                        meepleCount: newPlayers[playerIndex].meepleCount + meepleCount,
                    };

                    console.log(`🔄 [Store] Мипл${meepleCount > 1 ? `ы (${meepleCount} шт.)` : ''} возвращён игроку ${newPlayers[playerIndex].name}`);
                }
            }
        }

        set({ players: newPlayers, regionManager: rm });
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
        const totalAnimationTime = regionsWithMeeples.length * COMPLITED_REGION_ANIMATION_DURATION;

        setTimeout(() => {
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
        }, totalAnimationTime);
    },

    animateRegionCompletion: (
        region: CompletedRegion,
        startDelay: number = 0,
    ) => {

        console.log(`✨ [Store] Запуск анимации региона ${region.type} ${region.rootKey} (задержка ${startDelay}мс)`);

        // 🌟 Собираем миплов и определяем, кому показать очки
        const animatedWinners = new Set<string>();
        const meeplesToAnimate: Array<{
            tileKey: string;
            featureId: string;
            meeple: PlacedMeeple;
            points: number | undefined;
        }> = [];

        for (const regionFeatureKey of region.featureKeys) {
            const [tileCoord, featureId] = regionFeatureKey.split(':');
            const currentState = get();
            const tileWithMeeple = currentState.board.get(tileCoord);

            if (tileWithMeeple?.meeple?.featureId === featureId) {
                const meepleOwnerId = tileWithMeeple.meeple.playerId;

                // 🌟 Очки показываем ТОЛЬКО победителям
                const isWinner = region.winners.includes(meepleOwnerId);
                const showPoints = isWinner && !animatedWinners.has(meepleOwnerId);

                meeplesToAnimate.push({
                    tileKey: tileCoord,
                    featureId,
                    meeple: tileWithMeeple.meeple,
                    points: showPoints ? region.points : undefined,
                });

                if (showPoints) animatedWinners.add(meepleOwnerId);
            }
        }

        console.log(`✨ [Store] Собрано миплов для анимации: ${meeplesToAnimate.length}`);

        // ============================================
        // 🎬 ФАЗА 1: Начало анимации (startDelay)
        // - Добавляем обводку региона
        // - Помечаем миплов как isCompleting
        // ============================================
        setTimeout(() => {
            // 1.1 Добавляем обводку
            const animation = { region, startTime: Date.now() };
            set((state) => ({
                completionAnimations: [...state.completionAnimations, animation],
            }));
            console.log(`✨ [Store] Обводка добавлена для региона ${region.rootKey}`);

            // 1.2 Помечаем миплов как isCompleting (для CSS-анимации в Tile)
            if (meeplesToAnimate.length > 0) {
                const currentState = get();
                const currentBoard = new Map(currentState.board);

                for (const { tileKey, featureId, meeple, points } of meeplesToAnimate) {
                    const tile = currentBoard.get(tileKey);
                    if (tile?.meeple?.featureId === featureId) {
                        currentBoard.set(tileKey, {
                            ...tile,
                            meeple: { ...meeple, isCompleting: true, points },
                        });
                    }
                }

                set({ board: currentBoard });
                console.log(`✨ [Store] Миплы помечены для анимации (${meeplesToAnimate.length} шт.)`);
            }
        }, startDelay);

        // ============================================
        // 🎬 ФАЗА 2: Конец анимации (startDelay + ANIMATION_DURATION)
        // - Удаляем миплов с доски
        // - Убираем обводку региона
        // ============================================
        setTimeout(() => {
            // 2.1 Удаляем миплов
            if (meeplesToAnimate.length > 0) {
                const currentState = get();
                const currentBoard = new Map(currentState.board);
                let boardChanged = false;

                for (const { tileKey, featureId } of meeplesToAnimate) {
                    const tile = currentBoard.get(tileKey);
                    if (tile?.meeple?.isCompleting && tile.meeple.featureId === featureId) {
                        currentBoard.set(tileKey, { ...tile, meeple: undefined });
                        boardChanged = true;
                    }
                }

                if (boardChanged) {
                    set({ board: currentBoard });
                    console.log(`✨ [Store] Миплы удалены с доски`);
                }
            }

            // 2.2 Убираем обводку
            set((state) => ({
                completionAnimations: state.completionAnimations.filter(
                    a => a.region.rootKey !== region.rootKey
                ),
            }));
            console.log(`✨ [Store] Обводка убрана для региона ${region.rootKey}`);
            console.log(`✨ [Store] Анимация региона ${region.rootKey} завершена`);
        }, startDelay + COMPLITED_REGION_ANIMATION_DURATION);
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
            // Сброс клиентского состояния
            previewTile: null,
            previewRegionManager: null,
            moveSnapshot: null,
            completionAnimations: [],
        });
        console.log('📂 [GameSlice] Дебаг-сохранение загружено');
    },
});