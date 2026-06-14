// state/useGameStore.ts
import { create } from 'zustand';
import type { Player, PlacedTile, PlacedMeeple, Tile } from '@/core/types';
import { TILE_DEFINITIONS } from '@/core/tileData';
import { rotateFeatures, getTileSides, isValidPlacement, BOUNDARY_MATCHES } from '@/core/tileUtils';
import { RegionManager, type FeatureKey } from '@/core/regionManager';

export type GamePhase = 'draw' | 'placeTile' | 'placeMeeple';

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
  placeTile: (x: number, y: number, rotation: 0 | 90 | 180 | 270) => boolean;
  placeMeeple: (featureId: string, x: number, y: number) => void;
  endTurn: () => void;
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
  phase: 'placeTile', // 🌟 Игра начинается сразу с фазы размещения
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

    // 🌟 АВТОВЫДАЧА ПЕРВОГО ТАЙЛА
    const firstTile = fullDeck.pop() || null;
    console.log(`🎴 [Store] Автоматически выдан первый тайл: ${firstTile?.id || 'Колода пуста!'}`);

    set({
      players: newPlayers.map(p => ({ ...p, score: 0, meepleCount: 8 })),
      deck: fullDeck,
      board: gameBoard,
      currentTurn: 0,
      drawnTile: firstTile,
      phase: firstTile ? 'placeTile' : 'draw',
      regionManager: rm,
      showRegions: true,
      debugSelectedTile: null,
    });
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

    const neighborChecks = [
      { nx: x, ny: y - 1, matchKey: 'N-S' },
      { nx: x + 1, ny: y, matchKey: 'E-W' },
      { nx: x, ny: y + 1, matchKey: 'S-N' },
      { nx: x - 1, ny: y, matchKey: 'W-E' },
    ];

    for (const check of neighborChecks) {
      const neighborTile = newBoard.get(`${check.nx},${check.ny}`);
      if (!neighborTile) continue;

      const matches = BOUNDARY_MATCHES[check.matchKey];
      for (const { my: myDir, their: theirDir } of matches) {
        const myFeat = rotatedFeatures.find(f => f.directions.includes(myDir));
        const theirFeat = neighborTile.features.find(f => f.directions.includes(theirDir));

        if (myFeat && theirFeat && myFeat.type === theirFeat.type) {
          const myKey: FeatureKey = `${x},${y}:${myFeat.id}`;
          const theirKey: FeatureKey = `${check.nx},${check.ny}:${theirFeat.id}`;
          rm.union(myKey, theirKey);
        }
      }
    }

    console.log(`✅ [Store] Тайл ${state.drawnTile.id} установлен в (${x}, ${y})`);
    set({ board: newBoard, drawnTile: null, phase: 'placeMeeple' });
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
      
      const owners = state.regionManager.getFeatureOwners(featureKey);
      if (owners.length > 0) {
        return console.warn(`⚠️ [Store] Отказ: Регион фичи ${featureId} уже занят другим миплом!`), state;
      }

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
      
      // 🌟 АВТОПЕРЕХОД ХОДА + АВТОВЫДАЧА СЛЕДУЮЩЕГО ТАЙЛА
      const nextTurn = (state.currentTurn + 1) % state.players.length;
      const nextTile = state.deck.length > 0 ? state.deck.pop() : null;
      
      if (nextTile) console.log(`🎴 [Store] Следующий игрок автоматически берет тайл: ${nextTile.id}`);
      else console.warn('⚠️ [Store] Колода пуста! Игра завершается.');

      console.log(`🔄 [Store] Мипл установлен. Ход переходит к: ${newPlayers[nextTurn]?.name}`);
      
      return { 
        board: newBoard, 
        players: newPlayers, 
        currentTurn: nextTurn, 
        drawnTile: nextTile,
        phase: nextTile ? 'placeTile' : 'draw' 
      };
    });
  },

  endTurn: () => {
    const state = get();
    const nextTurn = (state.currentTurn + 1) % state.players.length;
    
    // 🌟 АВТОВЫДАЧА ТАЙЛА ПРИ ПРОПУСКЕ МИПЛА
    const nextTile = state.deck.length > 0 ? state.deck.pop() : null;
    if (nextTile) console.log(`🎴 [Store] Следующий игровой автоматически берет тайл: ${nextTile.id}`);
    else console.warn('⚠️ [Store] Колода пуста! Игра завершается.');

    console.log(`🔄 [Store] Ход пропущен. Переход к: ${state.players[nextTurn]?.name}`);
    set({ 
      currentTurn: nextTurn, 
      drawnTile: nextTile,
      phase: nextTile ? 'placeTile' : 'draw' 
    });
  },

  toggleRegions: () => {
    set((state) => ({ showRegions: !state.showRegions }));
  },

  setDebugSelectedTile: (coords) => {
    set({ debugSelectedTile: coords });
  },
}));