// state/useGameStore.ts
import { create } from 'zustand';
import type { Player, PlacedTile, PlacedMeeple, Tile, FeatureType} from '@/core/types';
import { TILE_DEFINITIONS } from '@/core/tileData';
import {
  rotateFeatures,
  getTileSides,
  isValidPlacement,
  getValidPlacementCells,
  BOUNDARY_MATCHES,
  NEIGHBOR_OFFSETS
} from '@/core/tileUtils';
import { RegionManager, type FeatureKey } from '@/core/regionManager';
import {
  findCompletedRegionsOnTile,
  calculateRegionPoints,
  type CompletedRegion
} from '@/core/scoring';

export type GamePhase = 'startTurn' | 'placeTile' | 'placeMeeple' | 'endTurn' | 'gameOver';

// 🌟 Длительность анимации одного региона
const ANIMATION_DURATION = 5000;
// 🌟 Задержка между анимациями
const DELAY_BETWEEN_ANIMATIONS = ANIMATION_DURATION / 2;

export interface CompletionAnimation {
  region: CompletedRegion;
  startTime: number;
}


export interface GameStore {
  deck: Tile[];
  board: Map<string, PlacedTile>;
  players: Player[];
  currentTurn: number;
  drawnTile: Tile | null;
  phase: GamePhase;
  regionManager: RegionManager;
  showRegions: boolean;
  debugSelectedTile: { x: number; y: number } | null;
  visibleFeatureTypes: FeatureType[];
  completionAnimations: CompletionAnimation[];

  initGame: (players: Omit<Player, 'score' | 'meepleCount' | 'pointsByCategory'>[]) => void;
  drawTile: () => void;
  placeTile: (x: number, y: number, rotation: 0 | 90 | 180 | 270) => boolean;
  placeMeeple: (featureId: string, x: number, y: number) => void;
  toggleRegions: () => void;
  setDebugSelectedTile: (coords: { x: number; y: number } | null) => void;
  debugForceEndGame: () => void;

  // 🌟 Вспомогательные функции
  processEndTurn: () => void;
  processCompletedRegionsInStore: (regions: CompletedRegion[]) => void;
  processEndGameInStore: (nextTurn: number) => void;
  animateRegionCompletion: (region: CompletedRegion, startDelay?: number) => void;
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

export const useGameStore = create<GameStore>((set, get) => ({
  deck: [],
  board: new Map(),
  players: [],
  currentTurn: 0,
  drawnTile: null,
  phase: 'startTurn',
  regionManager: new RegionManager(),
  showRegions: true,
  visibleFeatureTypes: ['road', 'city', 'field'],
  debugSelectedTile: null,
  completionAnimations: [],

  // ============================================
  // 🎮 ИНИЦИАЛИЗАЦИЯ ИГРЫ
  // ============================================
  initGame: (newPlayers) => {
    console.log('🎮 [Store] Инициализация игры...');
    const fullDeck = createDeck();
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
      board: gameBoard,
      currentTurn: 0,
      drawnTile: null,
      phase: 'startTurn',
      regionManager: rm,
      showRegions: true,
      debugSelectedTile: null,
      completionAnimations: [],
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
  // 📍 РАЗМЕЩЕНИЕ ТАЙЛА
  // ============================================
  placeTile: (x, y, rotation) => {
    const state = get();
    if (!state.drawnTile || state.phase !== 'placeTile') return false;
    const cellKey = `${x},${y}`;
    if (state.board.has(cellKey)) return false;

    const rotatedFeatures = rotateFeatures(state.drawnTile.features, rotation);
    if (!isValidPlacement(state.board, x, y, rotatedFeatures)) return false;

    const newBoard = new Map(state.board);
    newBoard.set(cellKey, {
      templateId: state.drawnTile.id,
      x, y, rotation,
      features: rotatedFeatures,
      derivedSides: getTileSides({ ...state.drawnTile, features: rotatedFeatures }),
    });

    const rm = state.regionManager.clone();
    for (const feature of rotatedFeatures) {
      const featureKey: FeatureKey = `${x},${y}:${feature.id}`;
      rm.makeSet(featureKey, feature.type, (feature as any).hasShield ?? false);
    }

    for (const { dx, dy, matchKey } of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const neighborTile = newBoard.get(`${nx},${ny}`);
      if (!neighborTile) continue;

      const matches = BOUNDARY_MATCHES[matchKey];
      for (const { my: myDir, their: theirDir } of matches) {
        const myFeat = rotatedFeatures.find(f => f.directions.includes(myDir));
        const theirFeat = neighborTile.features.find(f => f.directions.includes(theirDir));

        if (myFeat && theirFeat && myFeat.type === theirFeat.type) {
          rm.union(`${x},${y}:${myFeat.id}`, `${nx},${ny}:${theirFeat.id}`);
        }
      }
    }

    console.log(`✅ [Store] Тайл установлен в (${x}, ${y})`);
    set({ board: newBoard, drawnTile: null, phase: 'placeMeeple', regionManager: rm });
    return true;
  },

  // ============================================
  // 🔶 РАЗМЕЩЕНИЕ МИПЛА
  // ============================================
  placeMeeple: (featureId, mx, my) => {
    const state = get();
    const player = state.players[state.currentTurn];
    if (player.meepleCount <= 0) return;

    const tiles = Array.from(state.board.values());
    const last = tiles[tiles.length - 1];
    if (!last || last.meeple) return;

    const featureKey: FeatureKey = `${last.x},${last.y}:${featureId}`;
    const owners = state.regionManager.getFeatureOwners(featureKey);
    if (owners.length > 0) return;

    const rm = state.regionManager.clone();
    rm.addMeeple(featureKey, player.id);
    rm.addOwner(featureKey, player.id);

    const newBoard = new Map(state.board);
    newBoard.set(`${last.x},${last.y}`, {
      ...last,
      meeple: {
        playerId: player.id,
        featureId,
        color: player.color,
        x: mx,
        y: my
      } as PlacedMeeple
    });

    const newPlayers = [...state.players];
    newPlayers[state.currentTurn] = { ...player, meepleCount: player.meepleCount - 1 };

    set({
      board: newBoard,
      players: newPlayers,
      regionManager: rm,
      phase: 'endTurn'
    });

    queueMicrotask(() => {
      get().processEndTurn();
    });
  },

  // ============================================
  // 🔄 ЗАВЕРШЕНИЕ ХОДА
  // ============================================
  processEndTurn: () => {
    console.log("🔄 [Store] Начало обработки фазы 'endTurn'.");
    const state = get();
    const nextTurn = (state.currentTurn + 1) % state.players.length;

    let lastTile: PlacedTile | undefined;
    for (const tile of state.board.values()) lastTile = tile;

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
        phase: 'startTurn'
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
          // 🌟 НОВОЕ: распределяем очки по категории региона
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

        // 🌟 Подсчёт очков БЕЗ удвоения (isEndGame = true)
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
  debugForceEndGame: () => {
    console.log('🐛 [DEBUG] Принудительный конец игры');
    const state = get();
    const nextTurn = (state.currentTurn + 1) % state.players.length;
    
    // Очищаем колоду
    set({ deck: [] });
    
    // Запускаем процесс конца игры
    get().processEndGameInStore(nextTurn);
},
  toggleRegions: () => {
    set((state) => ({ showRegions: !state.showRegions }));
  },

  setDebugSelectedTile: (coords) => {
    set({ debugSelectedTile: coords });
  },
}));