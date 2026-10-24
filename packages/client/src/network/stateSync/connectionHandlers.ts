// packages/client/src/network/stateSync/connectionHandlers.ts
// 🌟 Обработчики событий подключения и сессии.
// connect / disconnect / reconnect / session:active-games

import type { GameSocket } from '@/network/socket';
import { useGameStore } from '@/state/useGameStore';
import { loadConnectionInfo } from '@/network/persistence';
import { toast } from '@/state/useToastStore';

/** Ключ дедупликации для toast-ов статуса соединения (один toast, а не стопка) */
const CONNECTION_TOAST = 'connection';

/**
 * 🌟 Регистрирует обработчики событий подключения.
 *
 * Сюда входят:
 * - connect / disconnect — базовые события socket.io
 * - reconnect_attempt / reconnect / reconnect_failed — авто-reconnect
 * - connect_error — ошибки подключения
 * - session:active-games — проверка активных игр (кнопка "Продолжить")
 *
 * ВАЖНО: socket.io при обрыве создаёт на сервере НОВЫЙ сокет — он не состоит
 * в комнате игры. Поэтому в обработчике connect клиент сам возвращается в комнату
 * (lobby:reconnect) и возобновляет подписку на список комнат.
 *
 * @param socket Типизированный socket
 */
export function registerConnectionHandlers(socket: GameSocket): void {
  // Было ли хотя бы одно успешное подключение (чтобы отличить первое connect от повторного)
  let hasConnectedBefore = false;

  // ============================================
  // 🔌 БАЗОВЫЕ СОБЫТИЯ ПОДКЛЮЧЕНИЯ
  // ============================================
  socket.on('connect', () => {
    const store = useGameStore.getState();
    store._setConnected(true);
    store._setConnectionError(null);

    // Повторное подключение → сообщаем, что связь вернулась
    if (hasConnectedBefore) {
      toast.success('Связь с сервером восстановлена', { dedupeKey: CONNECTION_TOAST });
    }
    hasConnectedBefore = true;

    if (store.roomId && store.playerId) {
      // 🌟 Мы были в комнате → просим сервер вернуть нас на место.
      // Ответ: lobby:reconnect-success (снапшот) или lobby:reconnect-failed.
      console.log(`🔄 [StateSync] Связь восстановлена — возвращаемся в комнату ${store.roomId}`);
      socket.emit('lobby:reconnect', { playerId: store.playerId, roomId: store.roomId });
    } else {
      // Не в комнате — проверяем, нет ли незавершённой игры (кнопка «Продолжить»)
      const saved = loadConnectionInfo();
      if (saved) {
        socket.emit('session:check-active', { playerId: saved.playerId });
      }
    }

    // 🌟 Браузер комнат был открыт → у нового сокета подписки нет, подписываемся заново
    if (store.isBrowsingRooms) {
      socket.emit('lobby:subscribe-rooms');
    }
  });

  socket.on('disconnect', (reason) => {
    useGameStore.getState()._setConnected(false);

    // Намеренное отключение (destroySocket) — не повод для тревоги
    if (reason === 'io client disconnect') return;

    toast.warning('Связь с сервером потеряна. Переподключение…', {
      dedupeKey: CONNECTION_TOAST,
      duration: 0, // висит, пока связь не вернётся (заменится toast-ом «восстановлена»)
    });

    // Сервер сам закрыл соединение — автоматического reconnect у socket.io в этом случае нет
    if (reason === 'io server disconnect') {
      socket.connect();
    }
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
    toast.error('Не удалось переподключиться к серверу. Обновите страницу.', {
      dedupeKey: CONNECTION_TOAST,
      duration: 0,
    });
  });

  // ============================================
  // ⚠️ ОШИБКИ ПОДКЛЮЧЕНИЯ
  // (без toast-а: во время переподключения они приходят пачкой,
  //  а состояние уже отображает toast «связь потеряна»)
  // ============================================
  socket.on('connect_error', (error) => {
    useGameStore.getState()._setConnectionError(error.message);
  });

  // ============================================
  // 🔍 ПРОВЕРКА АКТИВНЫХ ИГР (кнопка "Продолжить")
  // ============================================
  socket.on('session:active-games', ({ game }) => {
    console.log(`🔍 [StateSync] Активная игра: ${game ? game.roomId : 'нет'}`);
    useGameStore.getState().setActiveGame(game);
  });
}
