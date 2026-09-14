// packages/client/src/network/stateSync/applyServerState.ts
// 🌟 Применение сериализованного состояния сервера к клиентскому store.
// Используется в gameHandlers при получении game:started / game:state-update.

import { useGameStore } from '@/state/useGameStore';
import { RegionManager } from '@fiefdom/shared/core/regionManager';
import type { PlacedTile, PlacedMeeple } from '@fiefdom/shared/core/types';
import type { SerializedGameState } from '@fiefdom/shared/core/serialization';
import type { PlacementAnimation } from '@/state/types';

/**
 * 🌟 Применяет состояние сервера к клиентскому store.
 *
 * Особенности:
 * - Десериализует board (Record → Map) и regionManager
 * - Сохраняет миплов с isCompleting, если есть активные анимации
 * - Сбрасывает клиентское preview-состояние
 *
 * @param gameState Сериализованное состояние от сервера
 * @param options.animate Запускать ли анимацию для нового тайла/мипла
 */
export function applyServerState(
  gameState: SerializedGameState,
  options?: { animate?: boolean }
): void {
  const animate = options?.animate ?? false;

  console.log(`📥 [StateSync] Применение состояния сервера к store`);

  // ============================================
  // 🗺️ ДЕСЕРИАЛИЗАЦИЯ ДОСКИ
  // ============================================
  const board = new Map<string, PlacedTile>(
    Object.entries(gameState.board)
  );

  // ============================================
  // 🌐 ДЕСЕРИАЛИЗАЦИЯ REGION MANAGER
  // ============================================
  const regionManager = RegionManager.deserialize(gameState.regionManager);

  // ============================================
  // 🎨 ДЕСЕРИАЛИЗАЦИЯ ПОДСВЕТКИ ПОСЛЕДНИХ ТАЙЛОВ
  // ============================================
  const lastPlacedTiles = new Map<string, { x: number; y: number; color: string }>(
    Object.entries(gameState.lastPlacedTiles)
  );

  // ============================================
  // 🎬 ПОИСК НОВОГО ТАЙЛА/МИПЛА ЧЕРЕЗ lastPlacedTiles
  // ============================================
  const currentState = useGameStore.getState();

  if (animate) {
    let animatedTile: PlacedTile | null = null;
    let animatedMeeple: PlacedMeeple | null = null;

    // Сравниваем старый и новый lastPlacedTiles
    for (const [playerId, newLast] of Object.entries(gameState.lastPlacedTiles)) {
      const oldLast = currentState.lastPlacedTiles.get(playerId);

      // Проверяем, изменились ли координаты
      if (!oldLast || oldLast.x !== newLast.x || oldLast.y !== newLast.y) {
        const tileKey = `${newLast.x},${newLast.y}`;
        const oldTile = currentState.board.get(tileKey);
        const newTile = board.get(tileKey);

        if (newTile) {
          if (!oldTile) {
            // Тайл НОВЫЙ — анимировать тайл (и мипла если есть)
            animatedTile = newTile;
            animatedMeeple = newTile.meeple ?? null;
            console.log(`🎬 [StateSync] Новый тайл найден: (${newLast.x}, ${newLast.y})`);
          } else if (!oldTile.meeple && newTile.meeple) {
            // Тайл уже есть, но мипл новый (я поставил тайл, сервер подтвердил мипла)
            animatedMeeple = newTile.meeple;
            console.log(`🎬 [StateSync] Новый мипл найден на тайле (${newLast.x}, ${newLast.y})`);
          }
        }
        break;  // За один ход только один игрок делает ход
      }
    }

    if (animatedTile || animatedMeeple) {
      currentState.setPlacementAnimation({
        tile: animatedTile,
        meeple: animatedMeeple,
        startTime: Date.now(),
      });
      console.log(`🎬 [StateSync] Анимация установки запущена`);
    }
  }

  // ============================================
  // 🛡️ СОХРАНЕНИЕ МИПЛОВ С АНИМАЦИЕЙ ЗАВЕРШЕНИЯ
  // Если есть активные анимации — переносим isCompleting миплов
  // на серверные тайлы, чтобы анимация не прервалась
  // ============================================
  const hasActiveAnimations = currentState.completionAnimations.length > 0;

  if (hasActiveAnimations) {
    console.log(`📥 [StateSync] Есть активные анимации — сохраняем isCompleting миплы`);
    for (const [key, currentTile] of currentState.board) {
      if (currentTile.meeple?.isCompleting) {
        const serverTile = board.get(key);
        if (serverTile) {
          // Переносим мипла с isCompleting на серверный тайл
          board.set(key, {
            ...serverTile,
            meeple: currentTile.meeple,
          });
        }
      }
    }
  }

  // ============================================
  // 💾 ПРИМЕНЕНИЕ К STORE
  // ============================================
  useGameStore.setState({
    board,
    regionManager,
    players: gameState.players,
    currentTurn: gameState.currentTurn,
    phase: gameState.phase as any,
    drawnTile: gameState.drawnTile,
    totalTiles: gameState.totalTiles,
    lastPlacedTiles,
    // Сбрасываем клиентское preview-состояние
    previewTile: null,
    previewRegionManager: null,
    moveSnapshot: null,
  });

  // ============================================
  // 📋 ЛОГ ИТОГА
  // ============================================
  console.log(
    `📥 [StateSync] Состояние применено: ` +
    `board=${board.size} тайлов, ` +
    `players=${gameState.players.length}, ` +
    `phase=${gameState.phase}, ` +
    `drawnTile=${gameState.drawnTile?.id ?? 'null'}`
  );
}