// packages/server/src/handlers/roomBrowserHandlers.ts
// 🌟 Браузер комнат: список публичных комнат + live-обновления.
//
// Модель:
//  - клиент шлёт lobby:subscribe-rooms → сокет входит в канал ROOM_BROWSER_CHANNEL
//    и сразу получает текущий список (lobby:room-list);
//  - при любом изменении (RoomManager.notifyRoomsChanged) список рассылается
//    всем подписчикам; рассылки склеиваются debounce-ом в RoomManager;
//  - lobby:unsubscribe-rooms / disconnect снимают подписку (disconnect — автоматически).

import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager';
import { onSafe } from '../utils/socketUtils';

/** Имя канала подписчиков. Не пересекается с кодами комнат (6 символов A-Z2-9). */
export const ROOM_BROWSER_CHANNEL = 'room-browser';

export function registerRoomBrowserHandlers(io: Server, socket: Socket, roomManager: RoomManager): void {
  const sendList = (): void => {
    socket.emit('lobby:room-list', roomManager.listPublicRooms());
  };

  onSafe(socket, 'lobby:subscribe-rooms', () => {
    socket.join(ROOM_BROWSER_CHANNEL);
    sendList();
  });

  onSafe(socket, 'lobby:unsubscribe-rooms', () => {
    socket.leave(ROOM_BROWSER_CHANNEL);
  });

  // Разовый запрос (кнопка «Обновить») — работает и без подписки
  onSafe(socket, 'lobby:list-rooms', () => {
    sendList();
  });
}

/**
 * Связывает изменения в RoomManager с рассылкой подписчикам браузера.
 * Вызывается один раз при старте сервера.
 * @returns функция отписки
 */
export function bindRoomBrowserBroadcast(io: Server, roomManager: RoomManager): () => void {
  return roomManager.onRoomsChanged(() => {
    // Никто не слушает — не тратим время на сборку списка
    const subscribers = io.sockets.adapter.rooms.get(ROOM_BROWSER_CHANNEL)?.size ?? 0;
    if (subscribers === 0) return;

    io.to(ROOM_BROWSER_CHANNEL).emit('lobby:room-list', roomManager.listPublicRooms());
  });
}
