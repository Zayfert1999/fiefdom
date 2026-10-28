// packages/server/src/rooms/RoomManager.ts
// 🌟 Реестр всех активных комнат. Создание, поиск, удаление.
// Также отвечает за список публичных комнат (браузер комнат) и уведомление
// подписчиков об изменениях.

import type { RoomInfo } from '@fiefdom/shared/protocol/events';
import type { Room } from './Room';
import { logger } from '../utils/logger';

/** Максимум комнат в одном ответе браузера */
const MAX_LISTED_ROOMS = 50;

/** Окно склейки уведомлений: серия изменений → одна рассылка */
const NOTIFY_DEBOUNCE_MS = 300;

/** Можно ли сейчас войти в комнату из списка */
const isJoinable = (info: RoomInfo): boolean =>
  !info.isPlaying && info.playerCount < info.maxPlayers;

export class RoomManager {
  private rooms = new Map<string, Room>();

  // 🌟 Интервал очистки (каждые 60 секунд)
  private cleanupInterval: ReturnType<typeof setInterval>;

  // Таймаут: если все игроки отключены более 5 минут — удаляем комнату
  private readonly DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000;

  // 🌟 Подписчики на изменение списка комнат + debounce-таймер
  private changeListeners = new Set<() => void>();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupZombieRooms(), 60_000);
    logger.info('[RoomManager]', `🧹 Cleanup запущен (интервал: 60с, таймаут: ${this.DISCONNECT_TIMEOUT_MS / 1000}с)`);
  }

  /** Генерация уникального 6-значного кода комнаты */
  generateRoomId(): string {
    // Исключаем похожие символы (0/O, 1/I) для удобства ввода
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    do {
      id = '';
      for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(id)); // гарантируем уникальность
    return id;
  }

  addRoom(room: Room): void {
    this.rooms.set(room.id, room);

    // 🌟 Игрок исключён из лобби по таймауту (потерял соединение > 15 с):
    // пустую комнату удаляем, иначе просто обновляем список комнат
    room.onLobbyEviction = () => {
      if (room.players.size === 0) {
        room.dispose();
        this.removeRoom(room.id);
        logger.info('[RoomManager]', `🗑️ Комната ${room.id} удалена (все игроки исключены по таймауту)`);
      } else {
        this.notifyRoomsChanged();
      }
    };

    logger.info('[RoomManager]', `Комната ${room.id} создана (всего: ${this.rooms.size})`);
    this.notifyRoomsChanged();
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  removeRoom(roomId: string): void {
    this.rooms.delete(roomId);
    logger.info('[RoomManager]', `Комната ${roomId} удалена (осталось: ${this.rooms.size})`);
    this.notifyRoomsChanged();
  }

  // ============================================
  // 🔎 БРАУЗЕР КОМНАТ
  // ============================================

  /**
   * Список публичных комнат для браузера лобби.
   * - приватные и «пустые» (все игроки отключены) комнаты скрыты
   * - сначала комнаты, в которые можно войти, затем — по числу игроков
   * - не больше MAX_LISTED_ROOMS записей
   */
  listPublicRooms(): RoomInfo[] {
    return Array.from(this.rooms.values())
      .filter(r => !r.settings.isPrivate && r.hasConnectedPlayers)
      .map(r => r.toRoomInfo())
      .sort((a, b) =>
        Number(isJoinable(b)) - Number(isJoinable(a)) ||
        b.playerCount - a.playerCount
      )
      .slice(0, MAX_LISTED_ROOMS);
  }

  /**
   * Подписаться на изменения списка комнат.
   * @returns функция отписки
   */
  onRoomsChanged(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Сообщить, что список комнат мог измениться
   * (создание/удаление, вход/выход, старт игры, disconnect/reconnect).
   * Уведомления склеиваются: серия вызовов за NOTIFY_DEBOUNCE_MS → один вызов слушателей.
   */
  notifyRoomsChanged(): void {
    if (this.notifyTimer) return;

    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      for (const listener of this.changeListeners) {
        try {
          listener();
        } catch (err) {
          logger.error('[RoomManager]', 'Ошибка в слушателе изменения списка комнат', err);
        }
      }
    }, NOTIFY_DEBOUNCE_MS);
  }

  // ============================================
  // 🧹 ОЧИСТКА
  // ============================================

  private cleanupZombieRooms(): void {
    const now = Date.now();
    const roomsToRemove: string[] = [];

    for (const [roomId, room] of this.rooms) {
      // Комната "зомби" если все игроки отключены
      const allDisconnected = Array.from(room.players.values())
        .every(p => p.isDisconnected);

      if (!allDisconnected) continue;

      // Находим самое раннее время disconnect
      const earliestDisconnect = Math.min(
        ...Array.from(room.players.values())
          .map(p => p.disconnectedAt ?? now)
      );

      const timeSinceDisconnect = now - earliestDisconnect;

      if (timeSinceDisconnect >= this.DISCONNECT_TIMEOUT_MS) {
        roomsToRemove.push(roomId);
        logger.warn('[RoomManager]', `🧹 Удаление зомби-комнаты ${roomId} (все отключены ${Math.round(timeSinceDisconnect / 1000)}с)`);
      }
    }

    for (const roomId of roomsToRemove) {
      this.rooms.get(roomId)?.dispose();
      // 🌟 removeRoom (а не rooms.delete) — чтобы подписчики браузера получили обновление
      this.removeRoom(roomId);
    }

    if (roomsToRemove.length > 0) {
      logger.info('[RoomManager]', `Удалено зомби-комнат: ${roomsToRemove.length}`);
    }
  }

  // 🌟 Вызывается при остановке сервера
  dispose(): void {
    clearInterval(this.cleanupInterval);
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.changeListeners.clear();
    for (const room of this.rooms.values()) {
      room.dispose();
    }
  }

  /**
   * Находим последнюю активную игру игрока.
   * Возвращаем имя и цвет из данных сервера.
   */
  findLastActiveGameForPlayer(playerId: string, sessionToken: string): {
    roomId: string;
    playerName: string;
    playerColor: string;
    isHost: boolean;
    gameStarted: boolean;
    playerCount: number;
  } | null {
    let lastGame: {
      roomId: string;
      playerName: string;
      playerColor: string;
      isHost: boolean;
      gameStarted: boolean;
      playerCount: number;
      disconnectedAt: number;
    } | null = null;

    for (const [roomId, room] of this.rooms) {
      const conn = room.players.get(playerId);
      // 🔐 Чужие игры не раскрываем: нужен и playerId, и токен сессии
      if (!conn || !conn.verifySessionToken(sessionToken)) continue;
      // 🚪 Из этой партии игрок выбыл — «Продолжить» предлагать нечего
      if (room.isGameStarted && room.isPlayerAbandoned(playerId)) continue;

      const disconnectedAt = conn.disconnectedAt ?? 0;

      if (!lastGame || disconnectedAt > lastGame.disconnectedAt) {
        lastGame = {
          roomId,
          playerName: conn.player.name,
          playerColor: conn.player.color,
          isHost: room.hostId === playerId,
          gameStarted: room.isGameStarted,
          playerCount: Array.from(room.players.values())
            .filter(p => !p.isDisconnected).length,
          disconnectedAt,
        };
      }
    }

    if (lastGame) {
      const { disconnectedAt, ...result } = lastGame;
      return result;
    }

    return null;
  }

}
