// packages/client/src/network/stateSync/gameHandlers.ts
// 🌟 Обработчики событий игры.
// started / state-update / your-turn / move-committed / regions / timer / over

import type { GameSocket } from '@/network/socket';
import { useGameStore } from '@/state/useGameStore';
import type { FeatureType } from '@carcassonne/shared/core/types';
import { applyServerState } from './applyServerState';

/**
 * 🌟 Регистрирует обработчики событий игры.
 *
 * Сюда входят:
 * - game:started — начало игры
 * - game:state-update — обновление состояния
 * - game:your-turn — ваш ход
 * - game:move-committed — ход принят сервером
 * - game:regions-completed — завершённые регионы
 * - game:next-turn — передача хода
 * - game:timer-update — обновление таймера
 * - game:final-scoring — финальный подсчёт
 * - game:over — конец игры
 *
 * @param socket Типизированный socket
 */
export function registerGameHandlers(socket: GameSocket): void {
  // ============================================
  // 🎮 НАЧАЛО ИГРЫ
  // ============================================
  socket.on('game:started', ({ gameState, seed, yourPlayerId, gameStartTime }) => {
    console.log(`🎮 [StateSync] Игра началась! seed=${seed}, myId=${yourPlayerId}`);

    // Сохраняем время старта игры
    useGameStore.getState().setGameStartTime(gameStartTime);

    applyServerState(gameState);
  });

  // ============================================
  // 🔄 ОБНОВЛЕНИЕ СОСТОЯНИЯ
  // ============================================
  socket.on('game:state-update', ({ gameState }) => {
    console.log(`🔄 [StateSync] Получено обновление состояния`);

    // Сбрасываем таймер
    useGameStore.getState().setTurnTimerRemaining(null);
    useGameStore.getState().setTurnDeadline(null);

    applyServerState(gameState);
  });

  // ============================================
  // 🎴 ВАШ ХОД
  // ============================================
  socket.on('game:your-turn', ({ drawnTile }) => {
    console.log(`🎴 [StateSync] Мой ход! Тайл: ${drawnTile.id}`);

    // Сбрасываем таймер при начале хода
    useGameStore.getState().setTurnTimerRemaining(null);
    useGameStore.getState().setTurnDeadline(null);

    useGameStore.setState({
      drawnTile,
      phase: 'placeTile',
    });
  });

  // ============================================
  // ✅ ХОД ПРИНЯТ СЕРВЕРОМ
  // ============================================
  socket.on('game:move-committed', ({ playerId }) => {
    console.log(`🎴 [StateSync] Ход принят сервером: игрок ${playerId}`);
    // Состояние придёт через game:state-update
  });

  // ============================================
  // 🏆 ЗАВЕРШЁННЫЕ РЕГИОНЫ
  // ============================================
  socket.on('game:regions-completed', ({ regions }) => {
    console.log(`🏆 [StateSync] Завершено регионов: ${regions.length}`);

    // КЛЮЧЕВОЕ: используем processCompletedRegionsInStore
    // Она одновременно:
    // 1. Запускает анимации (с правильной задержкой между ними)
    // 2. Начисляет очки локально
    // 3. Возвращает миплов локально
    // 4. Помечает регионы как isComplete
    useGameStore.getState().processCompletedRegionsInStore(
      regions.map(r => ({
        rootKey: r.rootKey,
        type: r.type as any,
        points: r.points,
        winners: r.winners,
        allMeepleOwners: r.allMeepleOwners,
        featureKeys: r.featureKeys,
      }))
    );
  });

  // ============================================
  // 🔁 ПЕРЕДАЧА ХОДА
  // ============================================
  socket.on('game:next-turn', ({ nextPlayerId }) => {
    // Сбрасываем таймер при смене хода
    useGameStore.getState().setTurnTimerRemaining(null);
    useGameStore.getState().setTurnDeadline(null);

    console.log(`🔄 [StateSync] Ход передан игроку ${nextPlayerId}`);
    // Состояние придёт через game:state-update
  });

  // ============================================
  // ⏱️ ОБНОВЛЕНИЕ ТАЙМЕРА
  // ============================================
  socket.on('game:timer-update', ({ remainingSeconds, deadline }) => {
    // Сохраняем в store для GameHUD
    useGameStore.getState().setTurnTimerRemaining(remainingSeconds);
    if (deadline !== undefined) {
      useGameStore.getState().setTurnDeadline(deadline);
    }

    if (remainingSeconds <= 5) {
      console.log(`⏰ [StateSync] Осталось ${remainingSeconds} сек`);
    }
  });

  // ============================================
  // 🏁 ФИНАЛЬНЫЙ ПОДСЧЁТ И КОНЕЦ ИГРЫ
  // ============================================
  socket.on('game:final-scoring', ({ regions }) => {
    console.log(`🏆 [StateSync] Финальный подсчёт: ${regions.length} регионов`);

    useGameStore.getState().processCompletedRegionsInStore(
      regions.map(r => ({
        ...r,
        type: r.type as FeatureType,
      }))
    );
  });

  socket.on('game:over', ({ finalScores }) => {
    console.log(`🏁 [StateSync] Игра окончена!`);
    useGameStore.setState({
      phase: 'gameOver',
      players: finalScores,
    });
    // Фиксируем время окончания игры
    useGameStore.getState().setGameEndTime(Date.now());
  });

  // ============================================
  // ⚠️ ОШИБКИ СЕРВЕРА
  // ============================================
  socket.on('error', ({ code, message }) => {
    console.error(`🚫 [StateSync] Ошибка сервера: [${code}] ${message}`);
  });
}