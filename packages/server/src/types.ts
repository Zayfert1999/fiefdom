// packages/server/src/types.ts
// 🌟 Типы Socket.IO сервера. Строго типизируют и входящие (клиент → сервер),
// и исходящие (сервер → клиент) события по контракту из shared/protocol/events.
// Благодаря им опечатка в имени события или неверный payload — ошибка компиляции,
// а не «молча не работает» (раньше везде стоял `socket as any`).

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@fiefdom/shared/protocol/events';

// Межсерверных событий нет (один процесс) — интерфейс оставлен пустым намеренно
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents { }

/** Данные, привязанные к сокету (socket.data) */
export interface SocketData {
  roomId?: string;
  playerId?: string;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Имя серверного события и типы его аргументов */
export type ServerEventName = keyof ServerToClientEvents;
export type ServerEventArgs<E extends ServerEventName> = Parameters<ServerToClientEvents[E]>;
