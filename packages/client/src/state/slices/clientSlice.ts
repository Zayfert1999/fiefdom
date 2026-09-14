import type { StateCreator } from 'zustand';
import type { PreviewTile, PlacedMeeple } from '@fiefdom/shared/core/types';
import type { RegionManager, FeatureKey } from '@fiefdom/shared/core/regionManager';
import { applyTileToBoardAndRM, getValidRotations } from '@fiefdom/shared/core/tileUtils';
import type { GameStore } from '../useGameStore';
import type { MoveSnapshot, PlacementAnimation } from '../types';

export interface ClientSlice {
    // Preview (клиентское)
    previewTile: PreviewTile | null;
    previewRegionManager: RegionManager | null;
    moveSnapshot: MoveSnapshot | null;

    // Дебаг
    debugSelectedTile: { x: number; y: number } | null;

    // 🌟 НОВОЕ: Анимация установки тайла/мипла
    placementAnimation: PlacementAnimation | null;
    setPlacementAnimation: (animation: PlacementAnimation | null) => void;

    // Действия
    startPreview: (x: number, y: number) => void;
    rotatePreview: () => void;
    cancelPreview: () => void;
    rollbackMove: () => void;
    selectMeepleSpot: (featureId: string, x: number, y: number) => void;
    removePlacedMeeple: () => void;
    setDebugSelectedTile: (coords: { x: number; y: number } | null) => void;
    debugForceEndGame: () => void;
}

export const createClientSlice: StateCreator<GameStore, [], [], ClientSlice> = (set, get) => ({
    // Начальное состояние
    previewTile: null,
    previewRegionManager: null,
    moveSnapshot: null,
    debugSelectedTile: null,
    placementAnimation: null,

    // ============================================
    // 👁️ НАЧАЛО ПРИМЕРКИ
    // Вызывается при клике на валидную ячейку
    // ============================================
    startPreview: (x, y) => {
        const state = get();

        // 🌟 НОВОЕ: валидация фазы
        if (state.phase !== 'placeTile') {
            console.warn(`⚠️ [Store] startPreview вызван не в фазе placeTile (текущая: ${state.phase})`);
            return;
        }

        if (!state.drawnTile || state.phase !== 'placeTile') {
            console.warn('⚠️ [Store] Нельзя начать примерку: нет тайла или неверная фаза');
            return;
        }

        // 🌟 Получаем все валидные повороты для этой позиции
        const validRotations = getValidRotations(state.drawnTile, state.board, x, y);
        if (validRotations.length === 0) {
            console.warn(`⚠️ [Store] Нет валидных поворотов для (${x}, ${y})`);
            return;
        }

        const rotation = validRotations[0];

        // 🌟 Используем общую утилиту
        const { newRM: previewTileRM } = applyTileToBoardAndRM(
            state.board,
            state.regionManager,
            state.drawnTile,
            x, y, rotation
        );

        set({
            previewTile: {
                tile: state.drawnTile,
                x, y,
                rotation,
                displayRotation: rotation,
                validRotations,
                currentRotationIndex: 0,
            },
            previewRegionManager: previewTileRM,
        });

        console.log(`👁️ [Store] Примерка начата: (${x}, ${y}), поворот ${rotation}°, валидных поворотов: ${validRotations.length}`);
    },

    // ============================================
    // 🔄 ПОВОРОТ ПРИМЕРКИ
    // Вызывается при клике на preview-тайл
    // ============================================
    rotatePreview: () => {
        const state = get();
        if (!state.previewTile) return;

        const { tile, x, y, rotation, displayRotation, validRotations, currentRotationIndex } = state.previewTile;

        // 🌟 Если только один валидный поворот — поворачивать некуда
        if (validRotations.length <= 1) {
            console.log(`🔄 [Store] Поворот заблокирован: только 1 валидный поворот (${validRotations[0]}°)`);
            return;
        }

        const nextIndex = (currentRotationIndex + 1) % validRotations.length;
        const newRotation = validRotations[nextIndex];
        
        // 🌟 НОВОЕ: вычисляем кратчайшую дельту
        // По часовой: 0→90 = +90, 270→0 = +90
        // Против часовой: 0→270 = -90, 90→0 = -90
        let delta = (newRotation - rotation + 360) % 360;
        if (delta > 180) {
            delta -= 360;  // Против часовой ближе
        }
        const newDisplayRotation = displayRotation + delta;

        // 🌟 Используем общую утилиту
        const { newRM: previewTileRM } = applyTileToBoardAndRM(
            state.board,
            state.regionManager,
            tile,
            x, y, newRotation
        );

        set({
            previewTile: {
                ...state.previewTile,
                rotation: newRotation,
                displayRotation: newDisplayRotation,
                currentRotationIndex: nextIndex,
            },
            previewRegionManager: previewTileRM,
        });

        console.log(`🔄 [Store] Поворот примерки: ${newRotation}° (${nextIndex + 1}/${validRotations.length})`);
    },

    // ============================================
    // ❌ НОВОЕ: ОТМЕНА ПРИМЕРКИ
    // Возвращает тайл в руку
    // ============================================
    cancelPreview: () => {
        set({
            previewTile: null,
            previewRegionManager: null,
        });
        console.log(`❌ [Store] Примерка отменена`);
    },

    // ============================================
    // ↩️ ОТКАТ УСТАНОВКИ ТАЙЛА
    // Восстанавливает состояние ДО confirmPreview,
    // ВКЛЮЧАЯ preview-тайл на той же позиции
    // ============================================
    rollbackMove: () => {
        const state = get();

        if (state.phase !== 'placeMeeple') {
            console.warn('⚠️ [Store] Откат возможен только в фазе placeMeeple');
            return;
        }

        if (!state.moveSnapshot) {
            console.warn('⚠️ [Store] Нет snapshot для отката');
            return;
        }

        const {
            board,
            regionManager,
            drawnTile,
            deck,

            previewTile,
            previewTileRegionManager
        } = state.moveSnapshot;

        set({
            board,
            regionManager,
            drawnTile,
            deck,
            previewTile,
            previewRegionManager: previewTileRegionManager,
            phase: 'placeTile',
            moveSnapshot: null,
        });

        console.log(`↩️ [Store] Ход откатён, preview восстановлен на (${previewTile.x}, ${previewTile.y})`);
    },

    // ============================================
    // 🔶 НОВОЕ: ВЫБОР СПОТА ДЛЯ ВРЕМЕННОГО МИПЛА
    // Ставит временный мипл в board с isTemporary: true
    // ============================================
    selectMeepleSpot: (featureId, mx, my) => {
        const state = get();

        // Валидация фазы
        if (state.phase !== 'placeMeeple') {
            console.warn('⚠️ [Store] Неверная фаза для выбора спота');
            return;
        }

        const player = state.players[state.currentTurn];
        if (player.meepleCount <= 0) {
            console.warn('⚠️ [Store] У игрока нет миплов');
            return;
        }

        const tiles = Array.from(state.board.values());
        const last = tiles[tiles.length - 1];
        if (!last) {
            console.warn('⚠️ [Store] Нет тайлов на доске');
            return;
        }

        const featureKey: FeatureKey = `${last.x},${last.y}:${featureId}`;


        // 🌟 Проверяем, что фича свободна
        const owners = state.regionManager.getFeatureOwners(featureKey);
        if (owners.length > 0) {
            console.warn(`⚠️ [Store] Фича ${featureId} уже занята`);
            return;
        }

        // 🌟 Если уже есть временный мипл — возвращаем мипл игроку
        const newPlayers = [...state.players];
        if (last.meeple?.isTemporary) {
            newPlayers[state.currentTurn] = { ...player, meepleCount: player.meepleCount + 1 };
            console.log(`🔄 [Store] Перемещение временного мипла`);
        } else {
            newPlayers[state.currentTurn] = { ...player, meepleCount: player.meepleCount - 1 };
        }

        // 🌟 Ставим временный мипл в board
        const newBoard = new Map(state.board);
        newBoard.set(`${last.x},${last.y}`, {
            ...last,
            meeple: {
                playerId: player.id,
                featureId,
                color: player.color,
                x: mx,
                y: my,
                isTemporary: true,  // Флаг временного мипла
            } as PlacedMeeple,
        });

        // Создаём previewMeepleRM для визуализации
        const PreviewMeepleRM = state.regionManager.clone();
        PreviewMeepleRM.addMeeple(featureKey, player.id);
        PreviewMeepleRM.addOwner(featureKey, player.id);

        set({
            board: newBoard,
            players: newPlayers,
            previewRegionManager: PreviewMeepleRM,
        });

        console.log(`🔶 [Store] Временный мипл поставлен на ${featureId} (${mx}, ${my})`);
    },

    // ============================================
    // ❌ НОВОЕ: УДАЛЕНИЕ ВРЕМЕННОГО МИПЛА
    // Убирает временный мипл из board, возвращает мипл игроку
    // ============================================
    removePlacedMeeple: () => {
        const state = get();

        // Валидация фазы
        if (state.phase !== 'placeMeeple') {
            console.warn('⚠️ [Store] Неверная фаза для удаления мипла');
            return;
        }

        const tiles = Array.from(state.board.values());
        const last = tiles[tiles.length - 1];
        if (!last?.meeple?.isTemporary) {
            console.warn('⚠️ [Store] Нет временного мипла для удаления');
            return;
        }

        const player = state.players[state.currentTurn];

        // Убираем мипла из board
        const newBoard = new Map(state.board);
        newBoard.set(`${last.x},${last.y}`, { ...last, meeple: undefined });

        // Возвращаем мипл игроку
        const newPlayers = [...state.players];
        newPlayers[state.currentTurn] = { ...player, meepleCount: player.meepleCount + 1 };

        const newPreviewRM = state.regionManager.clone();

        set({
            board: newBoard,
            players: newPlayers,
            previewRegionManager: newPreviewRM,
        });

        console.log(`❌ [Store] Временный мипл удалён, мипл возвращён игроку ${player.name}`);
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

    setDebugSelectedTile: (coords) => {
        set({ debugSelectedTile: coords });
    },

    setPlacementAnimation: (animation) => {
        set({ placementAnimation: animation });
    },
});