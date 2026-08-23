// packages/client/src/network/stateSync/connectionHandlers.ts
// 🌟 Обработчики событий подключения и сессии.
// connect / disconnect / reconnect / session:active-games

import type { GameSocket } from '@/network/socket';
import { useGameStore } from '@/state/useGameStore';

/**
 * 🌟 Регистрирует обработчики событий подключения.
 *
 * Сюда входят:
 * - connect / disconnect — базовые события socket.io
 * - reconnect_attempt / reconnect / reconnect_failed — авто-reconnect
 * - connect_error — ошибки подключения
 * - session:active-games — проверка активных игр (кнопка "Продолжить")
 *
 * @param socket Типизированный socket
 */
export function registerConnectionHandlers(socket: GameSocket): void {
  // ============================================
  // 🔌 БАЗОВЫЕ СОБЫТИЯ ПОДКЛЮЧЕНИЯ
  // ============================================
  socket.on('connect', () => {
    useGameStore.getState()._setConnected(true);
    useGameStore.getState()._setConnectionError(null);
  });

  socket.on('disconnect', () => {
    useGameStore.getState()._setConnected(false);
  });

  // ============================================
  // 🔄 АВТО-ПЕРЕПОДКЛЮЧЕНИЕ (socket.io manager)
  // ============================================
  socket.io.on('reconnect_attempt', () => {
    useGameStore.getState()._setReconnecting(true);
  });

  socket.io.on('reconnect', () => {
    useGameStore.getState()._setReconnecting(false);
  });

  socket.io.on('reconnect_failed', () => {
    useGameStore.getState()._setReconnecting(false);
    useGameStore.getState()._setConnectionError('Не удалось переподключиться к серверу');
  });

  // ============================================
  // ⚠️ ОШИБКИ ПОДКЛЮЧЕНИЯ
  // ============================================
  socket.on('connect_error', (error) => {
    useGameStore.getState()._setConnectionError(error.message);
  });

  // ============================================
  // 🔍 ПРОВЕРКА АКТИВНЫХ ИГР (кнопка "Продолжить")
  // ============================================
  socket.on('session:active-games', ({ game }) => {
    console.log(`🔍 [StateSync] Активная игра: ${game ? game.roomId : 'нет'}`);
    const store = useGameStore.getState();
    store.setActiveGame(game);
  });
}