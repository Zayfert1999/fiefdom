// packages/client/src/core/gameSaveManager.ts
// 🌟 Универсальный менеджер сохранений игры.
// Инкапсулирует сериализацию/десериализацию состояния
// и работу с localStorage по ключам.

import type { PlacedTile, Tile, Player } from '@fiefdom/shared/core/types';
import type { RegionManager } from '@fiefdom/shared/core/regionManager';
import type { SerializedRegionManager } from '@fiefdom/shared/core/serialization';
import type { GamePhase, LastPlacedTile } from '@/state/types';

// ============================================
// 🔑 КЛЮЧИ СОХРАНЕНИЙ
// ============================================
export const SAVE_KEYS = {
    /** Дебаг-сохранение (ручное, через DebugPanel) */
    DEBUG: 'Fiefdom_debug_save',
    /** Автосохранение для игроков (конец каждого хода) */
    LOCAL: 'Fiefdom_local_save',
} as const;

export type SaveKey = typeof SAVE_KEYS[keyof typeof SAVE_KEYS];

// ============================================
// 📦 СТРУКТУРА СОХРАНЕНИЯ
// ============================================
export interface SerializedLocalGame {
    // Игровое состояние
    board: Record<string, PlacedTile>;
    regionManager: SerializedRegionManager;
    players: Player[];
    deck: Tile[];
    currentTurn: number;
    phase: GamePhase;
    drawnTile: Tile | null;
    totalTiles: number;
    lastPlacedTiles: Record<string, LastPlacedTile>;
    // Настройки сессии
    showRegions: boolean;
    showDeadCells: boolean;
    enabledDeckView: boolean;
    // Время игры
    gameStartTime: number | null;
    // Лобби (для восстановления)
    lobbyPlayers: Omit<Player, 'score' | 'meepleCount' | 'pointsByCategory'>[];
    // Мета-данные
    savedAt: number;
}

// ============================================
// 📥 ДАННЫЕ ДЛЯ СЕРИАЛИЗАЦИИ
// ============================================
export interface GameStateForSave {
    board: Map<string, PlacedTile>;
    regionManager: RegionManager;
    players: Player[];
    deck: Tile[];
    currentTurn: number;
    phase: GamePhase;
    drawnTile: Tile | null;
    totalTiles: number;
    lastPlacedTiles: Map<string, LastPlacedTile>;
    showRegions: boolean;
    showDeadCells: boolean;
    enabledDeckView: boolean;
    gameStartTime: number | null;
    lobbyPlayers: Omit<Player, 'score' | 'meepleCount' | 'pointsByCategory'>[];
}

// ============================================
// 📤 ДАННЫЕ ПОСЛЕ ДЕСЕРИАЛИЗАЦИИ
// ============================================
export interface DeserializedGameState {
    board: Map<string, PlacedTile>;
    regionManager: SerializedRegionManager;  // Десериализуется в RegionManager на месте
    players: Player[];
    deck: Tile[];
    currentTurn: number;
    phase: GamePhase;
    drawnTile: Tile | null;
    totalTiles: number;
    lastPlacedTiles: Map<string, LastPlacedTile>;
    showRegions: boolean;
    showDeadCells: boolean;
    enabledDeckView: boolean;
    gameStartTime: number | null;
    lobbyPlayers: Omit<Player, 'score' | 'meepleCount' | 'pointsByCategory'>[];
    savedAt: number;
}

// ============================================
// 🔧 СЕРИАЛИЗАЦИЯ
// ============================================

/**
 * 🌟 Сериализует состояние игры в объект для сохранения.
 */
export function serializeGameState(state: GameStateForSave): SerializedLocalGame {
    return {
        board: Object.fromEntries(state.board),
        regionManager: state.regionManager.serialize(),
        players: state.players,
        deck: state.deck,
        currentTurn: state.currentTurn,
        phase: state.phase,
        drawnTile: state.drawnTile,
        totalTiles: state.totalTiles,
        lastPlacedTiles: Object.fromEntries(state.lastPlacedTiles),
        showRegions: state.showRegions,
        showDeadCells: state.showDeadCells,
        enabledDeckView: state.enabledDeckView,
        gameStartTime: state.gameStartTime,
        lobbyPlayers: state.lobbyPlayers,
        savedAt: Date.now(),
    };
}

// ============================================
// 🔧 ДЕСЕРИАЛИЗАЦИЯ
// ============================================

/**
 * 🌟 Десериализует объект из сохранения.
 * Возвращает данные в формате, готовом для применения к store.
 * RegionManager десериализуется отдельно (нужен импорт класса).
 */
export function deserializeGameState(data: SerializedLocalGame): Omit<DeserializedGameState, 'regionManager'> & { regionManagerData: SerializedRegionManager } {
    return {
        board: new Map<string, PlacedTile>(Object.entries(data.board)),
        regionManagerData: data.regionManager,
        players: data.players,
        deck: data.deck || [],
        currentTurn: data.currentTurn,
        phase: data.phase as GamePhase,
        drawnTile: data.drawnTile ?? null,
        totalTiles: data.totalTiles,
        lastPlacedTiles: new Map<string, LastPlacedTile>(
            Object.entries(data.lastPlacedTiles || {})
        ),
        showRegions: data.showRegions ?? true,
        showDeadCells: data.showDeadCells ?? true,
        enabledDeckView: data.enabledDeckView ?? true,
        gameStartTime: data.gameStartTime ?? null,
        lobbyPlayers: data.lobbyPlayers || [],
        savedAt: data.savedAt || 0,
    };
}

// ============================================
// 💾 СОХРАНЕНИЕ / ЗАГРУЗКА / УДАЛЕНИЕ
// ============================================

/**
 * 🌟 Сохраняет состояние игры по ключу.
 */
export function saveGameState(key: SaveKey, state: GameStateForSave): void {
    try {
        const serialized = serializeGameState(state);
        localStorage.setItem(key, JSON.stringify(serialized));
        console.log(`💾 [SaveManager] Сохранено: ${key}`);
    } catch (e) {
        console.error(`❌ [SaveManager] Ошибка сохранения (${key}):`, e);
    }
}

/**
 * 🌟 Загружает состояние игры по ключу.
 * Возвращает десериализованные данные или null.
 */
export function loadGameState(key: SaveKey): Omit<DeserializedGameState, 'regionManager'> & { regionManagerData: SerializedRegionManager } | null {
    try {
        const json = localStorage.getItem(key);
        if (!json) {
            console.warn(`⚠️ [SaveManager] Нет сохранения: ${key}`);
            return null;
        }
        const data: SerializedLocalGame = JSON.parse(json);
        return deserializeGameState(data);
    } catch (e) {
        console.error(`❌ [SaveManager] Ошибка загрузки (${key}):`, e);
        localStorage.removeItem(key);
        return null;
    }
}

/**
 * 🌟 Удаляет сохранение по ключу.
 */
export function clearGameState(key: SaveKey): void {
    try {
        localStorage.removeItem(key);
        console.log(`🗑️ [SaveManager] Удалено: ${key}`);
    } catch (e) {
        console.warn(`⚠️ [SaveManager] Ошибка удаления (${key}):`, e);
    }
}

/**
 * 🌟 Возвращает мета-данные сохранения (без полной загрузки).
 * Полезно для отображения в кнопке "Продолжить".
 */
export function getSaveMeta(key: SaveKey): {
    playerCount: number;
    boardSize: number;
    deckRemaining: number;
    totalTiles: number;
    phase: string;
    savedAt: number;
    gameStartTime: number | null;
} | null {
    try {
        const json = localStorage.getItem(key);
        if (!json) return null;

        const data = JSON.parse(json);
        if (data.phase === 'gameOver' || data.phase === 'lobby') return null;

        const boardSize = Object.keys(data.board || {}).length;
        const totalTiles = data.totalTiles ?? 0;
        // 🌟 НОВОЕ: считаем сколько осталось в колоде
        // Если drawnTile в руке — он уже "взят из колоды"
        const hasDrawnTile = data.drawnTile !== null && data.drawnTile !== undefined;
        const deckRemaining = Math.max(0, totalTiles - boardSize - (hasDrawnTile ? 1 : 0));

        return {
            playerCount: data.players?.length ?? 0,
            boardSize,
            deckRemaining,
            totalTiles,
            phase: data.phase ?? 'unknown',
            savedAt: data.savedAt ?? 0,
            gameStartTime: data.gameStartTime ?? null,
        };

    } catch {
        return null;
    }
}