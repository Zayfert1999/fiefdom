// packages/client/src/network/stateSync/applyServerState.ts
// 🌟 Применение сериализованного состояния сервера к клиентскому store.
// Используется в gameHandlers при получении game:started / game:state-update.

import { useGameStore } from '@/state/useGameStore';
import { RegionManager } from '@carcassonne/shared/core/regionManager';
import type { PlacedTile } from '@carcassonne/shared/core/types';
import type { SerializedGameState } from '@carcassonne/shared/core/serialization';

/**
 * 🌟 Применяет состояние сервера к клиентскому store.
 *
 * Особенности:
 * - Десериализует board (Record → Map) и regionManager
 * - Сохраняет миплов с isCompleting, если есть активные анимации
 * - Сбрасывает клиентское preview-состояние
 *
 * @param gameState Сериализованное состояние от сервера
 */
export function applyServerState(gameState: SerializedGameState): void {
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
  // 🛡️ СОХРАНЕНИЕ МИПЛОВ С АНИМАЦИЕЙ ЗАВЕРШЕНИЯ
  // Если есть активные анимации — переносим isCompleting миплов
  // на серверные тайлы, чтобы анимация не прервалась
  // ============================================
  const currentState = useGameStore.getState();
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