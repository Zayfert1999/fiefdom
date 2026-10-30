// packages/server/src/utils/ipGuard.ts
// 🛡️ Ограничения по IP-адресу (rate limiting на сокет защищает от одного соединения,
// но не от десятка соединений с одного адреса):
//   • число одновременных соединений с одного IP;
//   • число создаваемых комнат с одного IP за окно времени;
//   • частота HTTP-запросов (REST /api).
//
// Всё хранится в памяти процесса. За прокси (nginx, Cloudflare) все клиенты видны
// с одного адреса — включите TRUST_PROXY=1, тогда берётся первый адрес из X-Forwarded-For.

import type { IncomingHttpHeaders } from 'http';

/** Лимиты сервера. Переопределяются переменными окружения. */
export const SERVER_LIMITS = {
  /** Всего комнат на сервере */
  maxRooms: envInt('MAX_ROOMS', 500),
  /** Одновременных соединений с одного IP */
  maxConnectionsPerIp: envInt('MAX_CONNECTIONS_PER_IP', 20),
  /** Созданных комнат с одного IP за окно (roomCreationWindowMs) */
  maxRoomsCreatedPerIp: envInt('MAX_ROOMS_CREATED_PER_IP', 20),
  roomCreationWindowMs: 10 * 60_000,
  /** HTTP-запросов с одного IP в минуту */
  maxHttpRequestsPerMinute: envInt('MAX_HTTP_REQUESTS_PER_MINUTE', 120),
} as const;

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Доверять ли заголовку X-Forwarded-For (сервер стоит за своим прокси) */
export const TRUST_PROXY = process.env.TRUST_PROXY === '1';

/** IP клиента для WebSocket-рукопожатия / HTTP-запроса */
export function getClientIp(address: string | undefined, headers: IncomingHttpHeaders): string {
  if (TRUST_PROXY) {
    const forwarded = headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return address ?? 'unknown';
}

export class IpGuard {
  private connections = new Map<string, number>();
  private roomCreations = new Map<string, number[]>();
  private httpWindows = new Map<string, { count: number; resetAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(private readonly limits: typeof SERVER_LIMITS = SERVER_LIMITS) {
    // Периодически выкидываем устаревшие записи, чтобы карты не росли бесконечно
    this.cleanupTimer = setInterval(() => this.prune(), 60_000);
    this.cleanupTimer.unref();
  }

  // ---------- Соединения ----------

  /** @returns false — лимит соединений с этого IP исчерпан, соединение нужно отклонить */
  tryAcquireConnection(ip: string): boolean {
    const current = this.connections.get(ip) ?? 0;
    if (current >= this.limits.maxConnectionsPerIp) return false;
    this.connections.set(ip, current + 1);
    return true;
  }

  releaseConnection(ip: string): void {
    const current = this.connections.get(ip) ?? 0;
    if (current <= 1) this.connections.delete(ip);
    else this.connections.set(ip, current - 1);
  }

  // ---------- Создание комнат ----------

  /** Разрешено ли создать комнату (и если да — засчитывает попытку) */
  tryCreateRoom(ip: string, now = Date.now()): boolean {
    const windowStart = now - this.limits.roomCreationWindowMs;
    const recent = (this.roomCreations.get(ip) ?? []).filter(t => t > windowStart);
    if (recent.length >= this.limits.maxRoomsCreatedPerIp) {
      this.roomCreations.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.roomCreations.set(ip, recent);
    return true;
  }

  // ---------- HTTP ----------

  /** Фиксированное окно в минуту; false — 429 Too Many Requests */
  allowHttpRequest(ip: string, now = Date.now()): boolean {
    let window = this.httpWindows.get(ip);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + 60_000 };
      this.httpWindows.set(ip, window);
    }
    window.count += 1;
    return window.count <= this.limits.maxHttpRequestsPerMinute;
  }

  private prune(now = Date.now()): void {
    const creationStart = now - this.limits.roomCreationWindowMs;
    for (const [ip, times] of this.roomCreations) {
      const recent = times.filter(t => t > creationStart);
      if (recent.length === 0) this.roomCreations.delete(ip);
      else this.roomCreations.set(ip, recent);
    }
    for (const [ip, window] of this.httpWindows) {
      if (now >= window.resetAt) this.httpWindows.delete(ip);
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
  }
}

/** Общий экземпляр сервера */
export const ipGuard = new IpGuard();
