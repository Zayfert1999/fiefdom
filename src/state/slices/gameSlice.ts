import type { StateCreator } from 'zustand';
import type { Player, PlacedTile, PlacedMeeple, Tile, FeatureType } from '@/core/types';
import { TILE_DEFINITIONS } from '@/core/tileData';
import { getTileSides, rotateFeatures, getValidPlacementCells } from '@/core/tileUtils';
import { RegionManager, type FeatureKey } from '@/core/regionManager';
import { findCompletedRegionsOnTile, calculateRegionPoints, type CompletedRegion } from '@/core/scoring';
import type { GameStore } from '../useGameStore';
import type { GamePhase, LastPlacedTile, CompletionAnimation, MoveSnapshot } from '../types';

// 🌟 Длительность анимации одного региона
const ANIMATION_DURATION = 5000;
// 🌟 Задержка между анимациями
const DELAY_BETWEEN_ANIMATIONS = ANIMATION_DURATION / 2;

// 🌟 Палитра цветов
const AVAILABLE_COLORS = [
    '#ff5555', // Красный
    '#5555ff', // Синий
    '#55ff55', // Зелёный
    '#ffff55', // Жёлтый
    '#ff55ff', // Фиолетовый
];

export interface GameSlice {
    //Лобби
    lobbyPlayers: Omit<Player, 'score' | 'meepleCount' | 'pointsByCategory'>[];

    //Игра
    deck: Tile[];
    totalTiles: number;
    board: Map<string, PlacedTile>;
    players: Player[];
    currentTurn: number;
    drawnTile: Tile | null;
    phase: GamePhase;
    regionManager: RegionManager;
    showRegions: boolean;
    visibleFeatureTypes: FeatureType[];
    completionAnimations: CompletionAnimation[];
    showDeadCells: boolean;
    lastPlacedTiles: Map<string, LastPlacedTile>;



    //Методы лобби
    addPlayer: () => void;
    removePlayer: (id: string) => void;
    renamePlayer: (id: string, newName: string) => void;
    startGame: () => void;

    //Инициализация игры
    initGame: (players: Omit<Player, 'score' | 'meepleCount' | 'pointsByCategory'>[]) => void;

    //Выдача тайла в начале хода
    drawTile: () => void;

    // Методы управления превью тайла 
    confirmPreview: () => void;
    confirmMeeple: () => void;

    // Переключалки подсветки регионов и мертвых клеток
    toggleRegions: () => void;
    toggleDeadCells: () => void;

    // Вспомогательные функции
    processEndTurn: () => void;
    processCompletedRegionsInStore: (regions: CompletedRegion[]) => void;
    processEndGameInStore: (nextTurn: number) => void;
    animateRegionCompletion: (region: CompletedRegion, startDelay?: number) => void;

    //Сериализация
    saveGame: () => void;
    loadGame: () => void;
}

const createDeck = (): Tile[] => {
    const deck: Tile[] = [];
    for (const def of TILE_DEFINITIONS) {
        for (let i = 0; i < def.quantity; i++) deck.push(def);
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
};

export const createGameSlice: StateCreator<GameStore, [], [], GameSlice> = (set, get) => ({
    // Начальное состояние
    lobbyPlayers: [
        { id: 'p1', name: 'Игрок 1', color: '#ff5555' },
        { id: 'p2', name: 'Игрок 2', color: '#5555ff' },
    ],
    deck: [],
    totalTiles: 0,
    board: new Map(),
    players: [],
    currentTurn: 0,
    drawnTile: null,
    phase: 'lobby',
    regionManager: new RegionManager(),
    showRegions: true,
    showDeadCells: true,
    visibleFeatureTypes: ['field'],
    debugSelectedTile: null,
    completionAnimations: [],
    lastPlacedTiles: new Map(),

    // ============================================
    // Лобби
    // ============================================
    addPlayer: () => {
        const state = get();
        if (state.lobbyPlayers.length >= 5) {
            console.warn('⚠️ [GameSlice] Максимум 5 игроков');
            return;
        }

        // 🌟 Находим первый свободный цвет
        const usedColors = new Set(state.lobbyPlayers.map(p => p.color));
        const freeColor = AVAILABLE_COLORS.find(c => !usedColors.has(c)) || '#ffffff';

        const newId = `p${Date.now()}`;
        const newName = `Игрок ${state.lobbyPlayers.length + 1}`;

        set({
            lobbyPlayers: [...state.lobbyPlayers, { id: newId, name: newName, color: freeColor }]
        });
        console.log(`✅ [GameSlice] Игрок добавлен: ${newName} (${freeColor})`);
    },

    removePlayer: (id) => {
        const state = get();
        if (state.lobbyPlayers.length <= 2) {
            console.warn('⚠️ [Store] Минимум 2 игрока');
            return;
        }

        set({
            lobbyPlayers: state.lobbyPlayers.filter(p => p.id !== id)
        });
        console.log(`❌ [Store] Игрок удалён: ${id}`);
    },

    renamePlayer: (id, newName) => {
        const trimmed = newName.trim();
        if (!trimmed) {
            console.warn('⚠️ [GameSlice] Имя не может быть пустым');
            return;
        }

        set({
            lobbyPlayers: get().lobbyPlayers.map(p =>
                p.id === id ? { ...p, name: trimmed } : p
            )
        });
        console.log(`✏️ [GameSlice] Игрок ${id} переименован в "${trimmed}"`);
    },

    startGame: () => {
        const state = get();
        if (state.lobbyPlayers.length < 2) {
            console.warn('⚠️ [Store] Нужно минимум 2 игрока');
            return;
        }

        // Инициализируем игру с игроками из лобби
        get().initGame(state.lobbyPlayers);
        set({ phase: 'startTurn' });
        console.log(`🎮 [Store] Игра начата с ${state.lobbyPlayers.length} игроками`);
    },

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
            showRegions: true,
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
        if (state.phase !== 'startTurn') {
            console.warn('⚠️ [Store] Неверная фаза для взятия тайла');
            return;
        }
        if (state.drawnTile !== null) {
            console.warn('⚠️ [Store] Тайл уже выдан');
            return;
        }

        const newDeck = [...state.deck];
        let drawnTile: Tile | null = null;
        let attempts = 0;
        const maxAttempts = newDeck.length;

        while (newDeck.length > 0 && attempts < maxAttempts) {
            attempts++;
            const candidate = newDeck.pop()!;
            const validCells = getValidPlacementCells(candidate, state.board);

            if (validCells.size > 0) {
                drawnTile = candidate;
                console.log(`🎴 [Store] Выдан тайл ${candidate.id}`);
                break;
            }

            if (newDeck.length === 0) {
                console.log(`🏁 [Store] Последний тайл нельзя поставить.`);
                break;
            }

            const insertIndex = Math.floor(Math.random() * (newDeck.length + 1));
            newDeck.splice(insertIndex, 0, candidate);
        }

        if (!drawnTile) {
            set({ deck: newDeck, phase: 'gameOver' });
            return;
        }

        set({ deck: newDeck, drawnTile, phase: 'placeTile' });
    },

    // ============================================
    // ✅ НОВОЕ: ПОДТВЕРЖДЕНИЕ ПРИМЕРКИ
    // Применяет preview-тайл к доске
    // ============================================
    confirmPreview: () => {
        const state = get();
        if (!state.previewTile || !state.previewRegionManager) {
            console.warn('⚠️ [Store] Нет preview-тайла для подтверждения');
            return;
        }

        const { x, y, rotation, tile } = state.previewTile;

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
        if (state.phase !== 'placeMeeple') {
            console.warn('⚠️ [Store] Неверная фаза для подтверждения');
            return;
        }

        const tiles = Array.from(state.board.values());
        const last = tiles[tiles.length - 1];

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

        let completedRegions: CompletedRegion[] = [];
        if (lastTile) {
            completedRegions = findCompletedRegionsOnTile(state.board, state.regionManager, lastTile);
        }

        if (completedRegions.length > 0) {
            get().processCompletedRegionsInStore(completedRegions);
        }

        if (state.deck.length === 0) {
            console.log('🏁 [Store] Колода пуста! Переход к концу игры.');
            get().processEndGameInStore(nextTurn);
        } else {
            set({
                currentTurn: nextTurn,
                drawnTile: null,
                phase: 'startTurn',
                lastPlacedTiles: newLastPlacedTiles
            });
        }
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
            // 🌟 Задержка: i * (ANIMATION_DURATION / 2)
            const startDelay = i * DELAY_BETWEEN_ANIMATIONS;

            // 🌟 НОВОЕ: одна функция для всей анимации
            get().animateRegionCompletion(region, startDelay);

            rm.markComplete(region.rootKey, region.points);

            // Начисляем очки победителям
            for (const winnerId of region.winners) {
                const playerIndex = newPlayers.findIndex(p => p.id === winnerId);
                if (playerIndex !== -1) {
                    const player = newPlayers[playerIndex];
                    // Распределяем очки по категории региона
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

            // Возвращаем миплы всем владельцам
            for (const meepleOwnerId of region.allMeepleOwners) {
                const playerIndex = newPlayers.findIndex(p => p.id === meepleOwnerId);
                if (playerIndex !== -1) {
                    newPlayers[playerIndex].meepleCount += 1;
                    console.log(`🔄 [Store] Мипл возвращён игроку ${newPlayers[playerIndex].name}`);
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
        const rm = state.regionManager;

        console.log('🏁 [Store] === КОНЕЦ ИГРЫ: сбор всех регионов с миплами ===');

        // 🌟 ШАГ 1: Собираем ВСЕ регионы с миплами в формате CompletedRegion
        const regionsWithMeeples: CompletedRegion[] = [];
        const processedRegions = new Set<string>();

        for (const tile of state.board.values()) {
            for (const feature of tile.features) {
                const featureKey: FeatureKey = `${tile.x},${tile.y}:${feature.id}`;
                const root = rm.find(featureKey);

                if (!root || processedRegions.has(root)) continue;
                processedRegions.add(root);

                const meta = rm.getMetadata(root);
                if (!meta || meta.meepleCounts.size === 0) continue;

                //Пропуск завершенных регионов
                if (meta.isComplete) continue;

                // Подсчёт очков БЕЗ удвоения (isEndGame = true)
                const points = calculateRegionPoints(state.board, rm, root, true);

                // Находим победителей (доминантов)
                const maxCount = Math.max(...Array.from(meta.meepleCounts.values()));
                const winners = Array.from(meta.meepleCounts.entries())
                    .filter(([_, count]) => count === maxCount)
                    .map(([ownerId]) => ownerId);

                const allMeepleOwners = Array.from(meta.meepleCounts.keys());

                regionsWithMeeples.push({
                    rootKey: root,
                    type: meta.type,
                    points,
                    winners,
                    allMeepleOwners,
                    featureKeys: [...meta.featureKeys]
                });

                console.log(`🏆 [Store] EndGame: Регион ${meta.type} ${root} — ${points} очков`);
            }
        }

        // 🌟 ШАГ 2: Используем ту же функцию, что и в середине игры
        // Она сама запустит поэтапную анимацию с задержкой DELAY_BETWEEN_ANIMATIONS
        if (regionsWithMeeples.length > 0) {
            get().processCompletedRegionsInStore(regionsWithMeeples);
        }

        // 🌟 ШАГ 3: После ВСЕХ анимаций — переходим в gameOver
        // Общая длительность: (regions.length - 1) * DELAY_BETWEEN_ANIMATIONS + ANIMATION_DURATION
        const totalAnimationTime = regionsWithMeeples.length > 0
            ? (regionsWithMeeples.length - 1) * DELAY_BETWEEN_ANIMATIONS + ANIMATION_DURATION
            : 0;

        setTimeout(() => {
            set({
                currentTurn: nextTurn,
                drawnTile: null,
                phase: 'gameOver'
            });
            console.log(`🏁 [Store] Переход в фазу gameOver`);
        }, totalAnimationTime);
    },

    animateRegionCompletion: (region: CompletedRegion, startDelay: number = 0) => {
        console.log(`✨ [Store] Запуск анимации региона ${region.type} ${region.rootKey} (задержка ${startDelay}мс)`);

        // 🌟 Собираем миплов региона для анимации
        const animatedPlayers = new Set<string>();
        const meeplesToAnimate: Array<{
            tileKey: string;
            meeple: PlacedMeeple;
            points: number | undefined;
        }> = [];

        for (const regionFeatureKey of region.featureKeys) {
            const [tileCoord, featureId] = regionFeatureKey.split(':');
            const currentState = get();
            const tileWithMeeple = currentState.board.get(tileCoord);

            if (tileWithMeeple?.meeple?.featureId === featureId) {
                const meepleOwnerId = tileWithMeeple.meeple.playerId;
                const showPoints = !animatedPlayers.has(meepleOwnerId);

                meeplesToAnimate.push({
                    tileKey: tileCoord,
                    meeple: tileWithMeeple.meeple,
                    points: showPoints ? region.points : undefined,
                });

                if (showPoints) animatedPlayers.add(meepleOwnerId);
            }
        }

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

                for (const { tileKey, meeple, points } of meeplesToAnimate) {
                    const tile = currentBoard.get(tileKey);
                    if (tile?.meeple) {
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

                for (const { tileKey } of meeplesToAnimate) {
                    const tile = currentBoard.get(tileKey);
                    if (tile?.meeple?.isCompleting) {
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
        }, startDelay + ANIMATION_DURATION);
    },

    // ============================================
    // 🎨 UI-действия
    // ============================================
    toggleRegions: () => {
        set((state) => ({ showRegions: !state.showRegions }));
    },

    toggleDeadCells: () => {
        set((state) => ({ showDeadCells: !state.showDeadCells }));
        console.log(`💀 [Store] Показ мёртвых клеток: ${!get().showDeadCells ? 'ВКЛ' : 'ВЫКЛ'}`);
    },

    // ============================================
    // 💾 СОХРАНЕНИЕ ИГРЫ
    // ============================================
    saveGame: () => {
        const state = get();

        // 🌟 Преобразуем Map в Record для JSON
        const boardRecord = Object.fromEntries(state.board);
        const lastPlacedRecord = Object.fromEntries(state.lastPlacedTiles);

        const serialized = {
            board: boardRecord,
            regionManager: state.regionManager.serialize(),
            players: state.players,
            deck: state.deck,
            currentTurn: state.currentTurn,
            phase: state.phase,
            drawnTile: state.drawnTile,
            totalTiles: state.totalTiles,
            lastPlacedTiles: lastPlacedRecord,
            showRegions: state.showRegions,
            showDeadCells: state.showDeadCells,
        };

        localStorage.setItem('carcassonne_save', JSON.stringify(serialized));
        console.log('💾 [GameSlice] Игра сохранена');
    },

    // ============================================
    // 📂 ЗАГРУЗКА ИГРЫ
    // ============================================
    loadGame: () => {
        const json = localStorage.getItem('carcassonne_save');
        if (!json) {
            console.warn('⚠️ [GameSlice] Нет сохранённой игры');
            return;
        }

        try {
            const data = JSON.parse(json);

            // 🌟 Восстанавливаем Map из Record
            const board = new Map<string, PlacedTile>(Object.entries(data.board));
            const lastPlacedTiles = new Map<string, LastPlacedTile>(Object.entries(data.lastPlacedTiles));

            // 🌟 Восстанавливаем RegionManager через static deserialize
            const regionManager = RegionManager.deserialize(data.regionManager);

            set({
                board,
                regionManager,
                players: data.players,
                deck: data.deck,
                currentTurn: data.currentTurn,
                phase: data.phase as GamePhase,
                drawnTile: data.drawnTile,
                totalTiles: data.totalTiles,
                lastPlacedTiles,
                showRegions: data.showRegions,
                showDeadCells: data.showDeadCells,

                // 🌟 Сброс клиентского (UI) состояния
                previewTile: null,
                previewRegionManager: null,
                moveSnapshot: null,
                completionAnimations: [],
            });

            console.log('📂 [GameSlice] Игра загружена');
        } catch (e) {
            console.error('❌ [GameSlice] Ошибка десериализации:', e);
            localStorage.removeItem('carcassonne_save'); // Защита от битого файла
        }
    },
});