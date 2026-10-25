// packages/server/src/state/PlayerConnection.ts
// 🌟 Представление игрока на сервере: игровой профиль + сетевое соединение

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Socket } from 'socket.io';
import type { Player } from '@fiefdom/shared/core/types';
import type { LobbyPlayer } from '@fiefdom/shared/protocol/events';

export class PlayerConnection {
  /** Игровой профиль (id, name, color, score, meeples) */
  public readonly player: Player;
  /**
   * 🔐 Секрет сессии (256 бит). Знает только сам игрок: сервер отдаёт его
   * единственный раз — в его собственном снапшоте. playerId, напротив, публичен
   * (его видят все в комнате), поэтому сам по себе для reconnect не годится.
   * НИКОГДА не логировать и не включать в рассылки.
   */
  public readonly sessionToken: string = randomBytes(32).toString('base64url');
  /** Текущий socket (может меняться при reconnect) */
  public socket: Socket | null;
  /** Готовность в лобби */
  public isReady: boolean = false;
  /** Флаг отключения (для ожидания reconnect) */
  public isDisconnected: boolean = false;
  /** Отметка о последнем disconnect (для cleanup) */
  public disconnectedAt: number | null = null;

  constructor(player: Player, socket: Socket) {
    this.player = player;
    this.socket = socket;
  }

  /** Проверка токена за постоянное время (без утечки по времени ответа) */
  verifySessionToken(candidate: string): boolean {
    const expected = Buffer.from(this.sessionToken);
    const actual = Buffer.from(candidate);
    // timingSafeEqual требует буферы одинаковой длины
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  get id(): string {
    return this.player.id;
  }

  get name(): string {
    return this.player.name;
  }

  /** Отправить событие лично этому игроку */
  emit(event: string, data?: unknown): void {
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
      isDisconnected: this.isDisconnected,
    };
  }

  markDisconnected(): void {
    this.isDisconnected = true;
    this.disconnectedAt = Date.now();
    this.socket = null;
  }

  markReconnected(socket: Socket): void {
    this.isDisconnected = false;
    this.disconnectedAt = null;
    this.socket = socket;
  }
}
