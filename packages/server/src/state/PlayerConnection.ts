// packages/server/src/state/PlayerConnection.ts
// 🌟 Представление игрока на сервере: игровой профиль + сетевое соединение

import type { Socket } from 'socket.io';
import type { Player } from '@carcassonne/shared/core/types';
import type { LobbyPlayer } from '@carcassonne/shared/protocol/events';

export class PlayerConnection {
  /** Игровой профиль (id, name, color, score, meeples) */
  public readonly player: Player;
  /** Текущий socket (может меняться при reconnect) */
  public socket: Socket | null;
  /** Готовность в лобби */
  public isReady: boolean = false;
  /** Флаг отключения (для ожидания reconnect) */
  public isDisconnected: boolean = false;

  constructor(player: Player, socket: Socket) {
    this.player = player;
    this.socket = socket;
  }

  get id(): string {
    return this.player.id;
  }

  get name(): string {
    return this.player.name;
  }

  /** Отправить событие лично этому игроку */
  emit(event: string, data: unknown): void {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  /** Представление для лобби */
  toLobbyPlayer(isHost: boolean): LobbyPlayer {
    return {
      id: this.player.id,
      name: this.player.name,
      color: this.player.color,
      isReady: this.isReady,
      isHost,
    };
  }
}