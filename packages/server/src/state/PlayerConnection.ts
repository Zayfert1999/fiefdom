// packages/server/src/state/PlayerConnection.ts
// 🌟 Представление игрока на сервере: игровой профиль + сетевое соединение

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { GameSocket, ServerEventName, ServerEventArgs } from '../types';
import type { Player } from '@fiefdom/shared/core/types';
import type { LobbyPlayer } from '@fiefdom/shared/protocol/events';

/** Сколько после ротации ещё принимается прежний токен */
export const SESSION_TOKEN_GRACE_MS = 60_000;

const generateToken = (): string => randomBytes(32).toString('base64url');

/** Сравнение строк за постоянное время (timingSafeEqual требует буферы одинаковой длины) */
function safeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Нетипизированный emit — только для внутренней реализации PlayerConnection.emit */
interface RawEmitter {
  emit(event: string, ...args: unknown[]): boolean;
}

export class PlayerConnection {
  /** Игровой профиль (id, name, color, score, meeples) */
  public readonly player: Player;
  /**
   * 🔐 Секрет сессии (256 бит). Знает только сам игрок: сервер отдаёт его
   * единственный раз — в его собственном снапшоте. playerId, напротив, публичен
   * (его видят все в комнате), поэтому сам по себе для reconnect не годится.
   * НИКОГДА не логировать и не включать в рассылки.
   *
   * Токен меняется при каждом успешном reconnect (rotateSessionToken): украденный
   * или устаревший токен перестаёт работать. Прежний токен ещё SESSION_TOKEN_GRACE_MS
   * принимается — на случай, если ответ с новым токеном потерялся по дороге.
   */
  private currentToken: string = generateToken();
  private previousToken: { value: string; expiresAt: number } | null = null;

  get sessionToken(): string {
    return this.currentToken;
  }
  /** Текущий socket (может меняться при reconnect) */
  public socket: GameSocket | null;
  /** Готовность в лобби */
  public isReady: boolean = false;
  /** Флаг отключения (для ожидания reconnect) */
  public isDisconnected: boolean = false;
  /** Отметка о последнем disconnect (для cleanup) */
  public disconnectedAt: number | null = null;

  constructor(player: Player, socket: GameSocket) {
    this.player = player;
    this.socket = socket;
  }

  /**
   * Проверка токена за постоянное время (без утечки по времени ответа).
   * Принимается текущий токен, а также прежний — в течение SESSION_TOKEN_GRACE_MS после ротации.
   */
  verifySessionToken(candidate: string, now = Date.now()): boolean {
    // Оба сравнения выполняются всегда (без раннего выхода)
    const matchesCurrent = safeEqual(this.currentToken, candidate);
    const matchesPrevious =
      this.previousToken !== null &&
      now < this.previousToken.expiresAt &&
      safeEqual(this.previousToken.value, candidate);
    return matchesCurrent || matchesPrevious;
  }

  /** Выдать новый токен (после успешного reconnect). Прежний действует ещё короткое время. */
  rotateSessionToken(now = Date.now()): string {
    this.previousToken = { value: this.currentToken, expiresAt: now + SESSION_TOKEN_GRACE_MS };
    this.currentToken = generateToken();
    return this.currentToken;
  }

  get id(): string {
    return this.player.id;
  }

  get name(): string {
    return this.player.name;
  }

  /**
   * Отправить событие лично этому игроку.
   * Имя события и payload проверяются по контракту ServerToClientEvents.
   */
  emit<E extends ServerEventName>(event: E, ...args: ServerEventArgs<E>): void {
    if (!this.socket) return;
    // Внутри — нетипизированный emit: дженерик-вариант socket.io не умеет
    // сопоставлять E с его аргументами, а снаружи контракт уже проверен.
    (this.socket as unknown as RawEmitter).emit(event, ...args);
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

  markReconnected(socket: GameSocket): void {
    this.isDisconnected = false;
    this.disconnectedAt = null;
    this.socket = socket;
  }
}
