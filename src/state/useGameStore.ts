// state/useGameStore.ts
import { create } from 'zustand';
import type { Player, PlacedTile, PlacedMeeple, Tile } from '@/core/types';
import { TILE_DEFINITIONS } from '@/core/tileData';
import { rotateFeatures, getTileSides, isValidPlacement, getValidPlacementCells, BOUNDARY_MATCHES, NEIGHBOR_OFFSETS } from '@/core/tileUtils';
import { RegionManager, type FeatureKey } from '@/core/regionManager';
import { checkRoadCompleteness } from '@/core/scoring';

export type GamePhase = 'startTurn' | 'placeTile' | 'placeMeeple' | 'endTurn' | 'gameOver';

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
  
  initGame: (players: Omit<Player, 'score' | 'meepleCount'>[]) => void;
  drawTile: () => void;
  placeTile: (x: number, y: number, rotation: 0 | 90 | 180 | 270) => boolean;
  placeMeeple: (featureId: string, x: number, y: number) => void;
  endTurn: () => void; // 🌟 Логика завершения хода теперь сюда
  processEndTurn: () => void; // 🌟 Новая функция для обработки логики внутри фазы 'endTurn'
  toggleRegions: () => void;
  setDebugSelectedTile: (coords: { x: number; y: number } | null) => void;
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
  debugSelectedTile: null,

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

    console.log(`🎴 [Store] Стартовый тайл установлен. Игра начинается. Фаза: startTurn`);

    set({
      players: newPlayers.map(p => ({ ...p, score: 0, meepleCount: 8 })),
      deck: fullDeck,
      board: gameBoard,
      currentTurn: 0,
      drawnTile: null,
      phase: 'startTurn',
      regionManager: rm,
      showRegions: true,
      debugSelectedTile: null,
    });
  },

  // 🌟 Теперь это функция автоматической выдачи тайла
  drawTile: () => {
    const state = get();
    if (state.phase !== 'startTurn') {
      console.warn('⚠️ [Store] Неверная фаза для взятия тайла');
      return;
    }

    // 🌟 Защита от повторного вызова
    if (state.drawnTile !== null) {
      console.warn('⚠️ [Store] Тайл уже выдан, повторный вызов игнорируется');
      return;
    }

    const newDeck = [...state.deck];
    let drawnTile: Tile | null = null;
    let attempts = 0;
    const maxAttempts = newDeck.length; // Защита от бесконечного цикла

    // 🌟 Цикл: пока колода не пуста, берём тайл и проверяем
    while (newDeck.length > 0 && attempts< maxAttempts) {
      attempts++;
      const candidate = newDeck.pop()!;
      const validCells = getValidPlacementCells(candidate, state.board);

      if (validCells.size > 0) {
        // ✅ Тайл можно поставить — оставляем его
        drawnTile = candidate;
        console.log(`🎴 [Store] Выдан тайл ${candidate.id} (валидных клеток: ${validCells.size})`);
        break;
      }
          // 🌟 Если колода пуста после pop — замешивать нечего, сразу выходим
      if (newDeck.length === 0) {
        console.log(`🏁 [Store] Последний тайл ${candidate.id} нельзя поставить. Игра окончена.`);
        break;
      }

      // ❌ Тайл нельзя поставить — замешиваем обратно в случайное место
      const insertIndex = Math.floor(Math.random() * (newDeck.length + 1));
      newDeck.splice(insertIndex, 0, candidate);
      console.log(`🔄 [Store] Тайл ${candidate.id} нельзя поставить. Замешан обратно в колоду.`);
    }

    if (!drawnTile) {
      // 🏁 Колода пуста или все тайлы нельзя поставить — конец игры
      console.log('🏁 [Store] Нечего ставить! Переход к фазе gameover.');
      set({ deck: newDeck, phase: 'gameOver' });
      return;
    }

    set({ deck: newDeck, drawnTile, phase: 'placeTile' });
  },

  placeTile: (x, y, rotation) => {
    const state = get();
    if (!state.drawnTile || state.phase !== 'placeTile') {
      console.warn('⚠️ [Store] Нельзя поставить тайл');
      return false;
    }
    const cellKey = `${x},${y}`;
    if (state.board.has(cellKey)) {
      console.warn(`⚠️ [Store] Клетка ${cellKey} занята`);
      return false;
    }

    const rotatedFeatures = rotateFeatures(state.drawnTile.features, rotation);

    if (!isValidPlacement(state.board, x, y, rotatedFeatures)) {
      console.warn(`⚠️ [Store] Отказ: стороны не совпадают в (${x}, ${y})`);
      return false;
    }

    const newBoard = new Map(state.board);
    newBoard.set(cellKey, {
      templateId: state.drawnTile.id,
      x, y, rotation,
      features: rotatedFeatures,
      derivedSides: getTileSides({ ...state.drawnTile, features: rotatedFeatures }),
    });

    const rm = state.regionManager;

    // 🛡️ ШАГ 1: Инициализируем ВСЕ фичи нового тайла в DSU.
    for (const feature of rotatedFeatures) {
      const featureKey: FeatureKey = `${x},${y}:${feature.id}`;
      rm.makeSet(featureKey, feature.type, (feature as any).hasShield ?? false);
    }

    // 🛡️ ШАГ 2: Проверяем соседей и объединяем (union) регионы.
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
          const myKey: FeatureKey = `${x},${y}:${myFeat.id}`;
          const theirKey: FeatureKey = `${nx},${ny}:${theirFeat.id}`;
          rm.union(myKey, theirKey);
        }
      }
    }

    console.log(`✅ [Store] Тайл ${state.drawnTile.id} установлен в (${x}, ${y})`);
    set({ board: newBoard, drawnTile: null, phase: 'placeMeeple' }); // 🌟 Переход к фазе размещения мипла
    return true;
  },

  placeMeeple: (featureId, mx, my) => {
    set((state) => {
      const player = state.players[state.currentTurn];
      if (player.meepleCount <= 0) return console.warn('⚠️ [Store] Нет свободных миплов!'), state;

      const tiles = Array.from(state.board.values());
      const last = tiles[tiles.length - 1];
      if (!last || last.meeple) return console.warn('⚠️ [Store] Мипл уже стоит на этом тайле'), state;

      const featureKey: FeatureKey = `${last.x},${last.y}:${featureId}`;

      // 🛡️ ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Проверяем, не занят ли весь регион целиком
      const owners = state.regionManager.getFeatureOwners(featureKey);
      if (owners.length > 0) {
        return console.warn(`⚠️ [Store] Отказ: Регион фичи ${featureId} уже занят другим миплом!`), state;
      }
      //Добавляем мипла
      state.regionManager.addMeeple(featureKey, player.id);
      // 🌟 Добавляем владельца (теперь это гарантированно сработает)
      state.regionManager.addOwner(featureKey, player.id);

      const newOwners = state.regionManager.getFeatureOwners(featureKey);
      console.log(`🔶 [Store] Фича ${featureId} теперь принадлежит: ${newOwners.length > 1 ? 'НЕСКОЛЬКИМ игрокам (спорная)' : '1 игроку'}`);

      const newBoard = new Map(state.board);
      newBoard.set(`${last.x},${last.y}`, {
        ...last,
        meeple: { playerId: player.id, featureId, color: player.color, x: mx, y: my } as PlacedMeeple
      });

      const newPlayers = [...state.players];
      newPlayers[state.currentTurn] = { ...player, meepleCount: player.meepleCount - 1 };

      // 🌟 АВТОМАТИЧЕСКИЙ ПЕРЕХОД К ФАЗЕ 'endTurn' ПОСЛЕ УСТАНОВКИ МИПЛА
      console.log(`🔄 [Store] Мипл установлен. Переход к фазе 'endTurn'.`);
      return {
        board: newBoard,
        players: newPlayers,
        // currentTurn: nextTurn, // 🚫 Не меняем ход здесь
        // phase: 'draw',         // 🚫 Не меняем фазу на 'draw'
        phase: 'endTurn' // 🌟 Переходим к фазе завершения хода
      };
    });

    // 🌟 ВАЖНО: Автоматически вызываем endTurn после обновления состояния
    // Это гарантирует, что processEndTurn выполнится сразу после placeMeeple
    get().processEndTurn(); // 🌟 Вызов endTurn
  },

  endTurn: () => { // 🌟 Теперь просто вызывает processEndTurn
    console.log("🔄 [Store] Начало обработки фазы 'endTurn'.");
    get().processEndTurn(); // Вызываем логику завершения хода
  },

  processEndTurn: () => {
      const state = get();
      const nextTurn = (state.currentTurn + 1) % state.players.length;

      // --- ЛОГИКА ПРОВЕРКИ РЕГИОНОВ (из scoring.ts) ---
      // Найдём последний установленный тайл
      const tiles = Array.from(state.board.values());
      const lastTile = tiles[tiles.length - 1]; // Последний тайл в порядке вставки
      if (lastTile) {
        console.log(`🔍 [Store] processEndTurn: Проверяем регионы на тайле (${lastTile.x}, ${lastTile.y})`);
        const newPlayers = [...state.players];
        const newBoard = new Map(state.board); // Для обновления (удаления мипла из завершённого региона)

        // Проверим каждую фичу в последнем тайле
        for (const feature of lastTile.features) {
          if (feature.type === 'road') { // Проверяем только дороги
            const featureKey: FeatureKey = `${lastTile.x},${lastTile.y}:${feature.id}`;
            const rootKey = state.regionManager.find(featureKey);

            if (rootKey) {
              const meta = state.regionManager.getMetadata(rootKey);
              if (meta && !meta.isComplete) { // Проверяем только незавершённые регион
                // Проверим, завершена ли дорога
                // 🌟 ИСПОЛЬЗУЕМ ФУНКЦИЮ ИЗ НОВОГО ФАЙЛА
                if (checkRoadCompleteness(state.board, state.regionManager, rootKey)) {
                  // --- РЕГИОН ЗАВЕРШЁН ---
                  const points = meta.segments; // 1 очко за сегмент
                  state.regionManager.markComplete(rootKey, points);

                  // --- ОПРЕДЕЛЕНИЕ ПОБЕДИТЕЛЕЙ ---
                  const winners = state.regionManager.getWinnersFromCompletedRegion(rootKey);
                  console.log(`🏆 [Store] Победители в завершённой дороге: ${winners.join(', ')}`);

                  // --- НАЧИСЛЕНИЕ ОЧКОВ ---
                  for (const winnerId of winners) {
                    const playerIndex = newPlayers.findIndex(p => p.id === winnerId);
                    if (playerIndex !== -1) {
                        newPlayers[playerIndex].score += points; // Полные очки получает каждый победитель
                        console.log(`🏆 [Store] Игроку ${newPlayers[playerIndex].name} начислено ${points} очков за завершённую дорогу.`);
                    }
                  }

                  // --- ВОЗВРАТ МИПЛОВ ---
                  // Получаем список всех миплов (ID игроков), участвовавших в регионе, для возврата
                  const allMeeplesInRegion = state.regionManager.getMeeplesForReturnFromCompletedRegion(rootKey);
                  console.log(`🔄 [Store] Миплы для возврата из региона: ${allMeeplesInRegion.join(', ')}`);
                  for(const meepleOwnerId of allMeeplesInRegion) {
                      const playerIndex = newPlayers.findIndex(p => p.id === meepleOwnerId);
                      if(playerIndex !== -1) {
                          newPlayers[playerIndex].meepleCount += 1;
                          console.log(`🔄 [Store] Мипл возвращён игроку ${newPlayers[playerIndex].name}`);
                      }
                  }

                  // 🌟 ШАГ 1: Помечаем миплов как "завершающихся" (анимация +N и растворение)
                  // НЕ удаляем их сразу — пусть CSS отыграет анимацию
                  const completingTileKeys: string[] = [];
                  for (const regionFeatureKey of meta.featureKeys) {
                    const [tileCoord, featureId] = regionFeatureKey.split(':'); // 🌟 Извлекаем featureId
                    const tileKey = tileCoord;
                    const tileWithMeeple = newBoard.get(tileKey);
                    
                    if (tileWithMeeple && tileWithMeeple.meeple) {
                      // 🌟 ПРОВЕРКА: мипл должен стоять именно на этой фиче, а не на другой фиче того же тайла
                      if (tileWithMeeple.meeple.featureId === featureId) {
                        // Помечаем мипла для анимации
                        newBoard.set(tileKey, {
                          ...tileWithMeeple,
                          meeple: {
                            ...tileWithMeeple.meeple,
                            isCompleting: true,
                            points: points
                          }
                        });
                        completingTileKeys.push(tileKey);
                        console.log(`✨ [Store] Мипл на тайле ${tileKey} (фича ${featureId}) помечен для анимации завершения (+${points} очков)`);
                      }
                    }
                  }

                  // 🌟 ШАГ 2: Откладываем реальное удаление миплов на время анимации (1500мс)
                  if (completingTileKeys.length > 0) {
                    setTimeout(() => {
                      const currentState = get();
                      const currentBoard = new Map(currentState.board);
                      let changed = false;
                      
                      for (const tileKey of completingTileKeys) {
                        const tile = currentBoard.get(tileKey);
                        if (tile && tile.meeple && tile.meeple.isCompleting) {
                          currentBoard.set(tileKey, { ...tile, meeple: undefined });
                          changed = true;
                          console.log(`🧹 [Store] Мипл удалён с тайла ${tileKey} (анимация завершена)`);
                        }
                      }
                      
                      if (changed) {
                        set({ board: currentBoard });
                      }
                    }, 5000); // Длительность анимации
                  }
                }
              }
            }
          }
        }

      // Обновим состояние с новыми игроками и доской (если убрали миплов)
      set({ players: newPlayers, board: newBoard });
    }
    // ------------------------------

    // 🌟 НОВАЯ ЛОГИКА: Определяем следующую фазу
    console.log(`🔄 [Store] Ход переходит к: ${state.players[nextTurn]?.name}`);

    if (state.deck.length === 0) {
      console.log('🏁 [Store] Колода пуста! Переход к фазе gameover.');
      set({
        currentTurn: nextTurn,
        drawnTile: null,
        phase: 'gameOver'
      });
    } else {
      // 🌟 Переходим в фазу 'draw' — UI автоматически вызовет drawTile
      set({
        currentTurn: nextTurn,
        drawnTile: null,
        phase: 'startTurn'
      });
    }
  },

  toggleRegions: () => {
    set((state) => ({ showRegions: !state.showRegions }));
  },

  setDebugSelectedTile: (coords) => {
    set({ debugSelectedTile: coords });
  },
}));