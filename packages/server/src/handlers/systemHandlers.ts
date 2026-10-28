// packages/server/src/handlers/systemHandlers.ts
// 🌟 Служебные события: замер задержки (ping) для индикатора в меню.

import type { GameServer, GameSocket } from '../types';
import { onSafe } from '../utils/socketUtils';

export function registerSystemHandlers(_io: GameServer, socket: GameSocket): void {
  // Клиент засекает время до вызова ack — это и есть RTT
  onSafe(socket, 'net:ping', (ack) => {
    if (typeof ack === 'function') ack();
  });
}
