// packages/client/src/state/slices/lobbySlice.ts
// 🌟 Состояние локального лобби: список игроков, старт игры, выход.
// НЕ содержит игровую логику — только управление лобби.

import type { StateCreator } from 'zustand';
import type { GameStore } from '../useGameStore';
import type { Player } from '@fiefdom/shared/core/types';
import { AVAILABLE_COLORS } from '@fiefdom/shared/core/constants';
import { RegionManager } from '@fiefdom/shared/core/regionManager';

export interface LobbySlice {
    // === Состояние локального лобби ===
    lobbyPlayers: Omit<Player, 'score' | 'meepleCount' | 'pointsByCategory'>[];

    // === Действия ===
    initLocalLobby: (profileName: string, profileColor: string) => void;
    addPlayer: () => void;
    removePlayer: (id: string) => void;
    renamePlayer: (id: string, newName: string) => void;
    startGame: () => void;
    exitToLobby: () => void;
}

export const createLobbySlice: StateCreator<GameStore, [], [], LobbySlice> = (set, get) => ({
    // Начальное состояние
    lobbyPlayers: [],

    // ============================================
    // 🎮 ИНИЦИАЛИЗАЦИЯ ЛОКАЛЬНОГО ЛОББИ
    // ============================================
    initLocalLobby: (profileName, profileColor) => {
        console.log(`🎮 [GameSlice] Инициализация локального лобби: ${profileName} (${profileColor})`);

        set({
            lobbyPlayers: [
                // 🌟 Первый игрок — из профиля (главное меню)
                { id: 'p1', name: profileName, color: profileColor },
                // 🌟 Второй игрок — по умолчанию, первый свободный цвет
                { id: 'p2', name: 'Игрок 2', color: AVAILABLE_COLORS.find(c => c !== profileColor) || '#5555ff' },
            ],
        });
    },

    // ============================================
    // ➕ ДОБАВЛЕНИЕ ИГРОКА
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

    // ============================================
    // ➖ УДАЛЕНИЕ ИГРОКА
    // ============================================
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

    // ============================================
    // ✏️ ПЕРЕИМЕНОВАНИЕ ИГРОКА
    // ============================================
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

    // ============================================
    // 🚀 СТАРТ ИГРЫ
    // ============================================
    startGame: () => {
        const state = get();
        if (state.lobbyPlayers.length < 2) {
            console.warn('⚠️ [Store] Нужно минимум 2 игрока');
            return;
        }

        // Инициализируем игру с игроками из лобби
        get().initGame(state.lobbyPlayers);
        set({ phase: 'startTurn', gameStartTime: Date.now() });
        console.log(`🎮 [Store] Игра начата с ${state.lobbyPlayers.length} игроками`);
    },

    // ============================================
    // 🚪 ВЫХОД В ЛОББИ
    // ============================================
    exitToLobby: () => {
        console.log('🚪 [Store] Выход в лобби');

        // Сбрасываем всё игровое состояние
        set({
            lobbyPlayers: [],
            deck: [],
            totalTiles: 0,
            board: new Map(),
            players: [],
            currentTurn: 0,
            drawnTile: null,
            phase: 'lobby',
            regionManager: new RegionManager(),
            debugSelectedTile: null,
            completionAnimations: [],
            lastPlacedTiles: new Map(),
            gameStartTime: null,
            gameEndTime: null,
        });
        // Возвращаемся в главное меню
        get().setLobbyScreen('modeSelect');
    },
});