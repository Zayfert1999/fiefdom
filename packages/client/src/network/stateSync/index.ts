// packages/client/src/network/stateSync/index.ts
// 🌟 Точка входа модуля синхронизации состояния.
// Регистрирует все обработчики серверных событий.

import type { GameSocket } from '@/network/socket';
import { useGameStore } from '@/state/useGameStore';
import { registerConnectionHandlers } from './connectionHandlers';
import { registerLobbyHandlers } from './lobbyHandlers';
import { registerGameHandlers } from './gameHandlers';

// Реэкспортируем applyServerState для внешнего использования (если нужно)
export { applyServerState } from './applyServerState';

// ============================================
// 🛡️ ФЛАГ ЗАЩИТЫ ОТ ПОВТОРНОЙ РЕГИСТРАЦИИ
// ============================================
let handlersRegistered = false;

/**
 * 🌟 Регистрирует ВСЕ обработчики серверных событий.
 * Вызывается один раз при первом подключении.
 *
 * Защита от повторной регистрации:
 * - В StrictMode React эффекты вызываются дважды
 * - Флаг handlersRegistered предотвращает дублирование
 *
 * @param socket Типизированный socket
 */
export function registerStateSync(socket: GameSocket): void {
  // ============================================
  // 🛡️ ЗАЩИТА: если уже зарегистрированы — пропускаем
  // ============================================
  if (handlersRegistered) {
    console.log(`🔄 [StateSync] Обработчики уже зарегистрированы — пропускаем`);

    // Всё равно проверяем текущее состояние подключения
    if (socket.connected) {
      useGameStore.getState()._setConnected(true);
      useGameStore.getState()._setConnectionError(null);
    }
    return;
  }
  handlersRegistered = true;

  console.log(`🔄 [StateSync] Регистрация обработчиков серверных событий`);

  // ============================================
  // 🔌 RACE CONDITION FIX
  // Если сокет уже подключён к моменту регистрации —
  // синхронизируем состояние сразу
  // ============================================
  if (socket.connected) {
    console.log(`🔌 [StateSync] Сокет уже подключён — синхронизируем состояние`);
    useGameStore.getState()._setConnected(true);
    useGameStore.getState()._setConnectionError(null);
    useGameStore.getState()._setReconnecting(false);
  }

  // ============================================
  // 📋 РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ ПО МОДУЛЯМ
  // ============================================
  registerConnectionHandlers(socket);
  registerLobbyHandlers(socket);
  registerGameHandlers(socket);

  console.log(`✅ [StateSync] Все обработчики зарегистрированы`);
}

/**
 * 🌟 Сбрасывает флаг регистрации.
 * Вызывается при полном отключении (destroySocket).
 */
export function unregisterStateSync(): void {
  handlersRegistered = false;
  console.log(`🔄 [StateSync] Флаг регистрации сброшен`);
}