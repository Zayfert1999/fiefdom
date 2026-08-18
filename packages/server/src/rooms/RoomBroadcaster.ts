// packages/server/src/rooms/RoomBroadcaster.ts
// 🌟 Рассылка событий и состояния игры.
// Отделён от Room для чёткого разделения ответственности.

import type { PlayerConnection } from '../state/PlayerConnection';
import type { ServerGameState } from '../state/ServerGameState';

/**
 * 🌟 Инкапсулирует логику рассылки событий игрокам.
 * Учитывает приватность drawnTile и статус отключения.
 */
export class RoomBroadcaster {
  constructor(
    private players: Map<string, PlayerConnection>,
    private gameState: ServerGameState
  ) {}

  // ============================================
  // 📡 РАССЫЛКА СОБЫТИЙ
  // ============================================

  /**
   * Отправить событие ВСЕМ подключённым игрокам.
   * Отключённые игроки пропускаются.
   */
  broadcast(event: string, data: unknown): void {
    for (const conn of this.players.values()) {
      if (!conn.isDisconnected) {
        conn.emit(event, data);
      }
    }
  }

  // ============================================
  // 🔄 РАССЫЛКА СОСТОЯНИЯ ИГРЫ
  // ============================================

  /**
   * 🌟 Разослать состояние игры с учётом:
   * - Приватности drawnTile (каждый видит только свой тайл)
   * - Флага isDisconnected (обогащение из PlayerConnection)
   *
   * Вызывается при каждом изменении состояния игры.
   */
  broadcastState(): void {
    for (const conn of this.players.values()) {
      // Пропускаем отключённых игроков
      if (conn.isDisconnected) continue;

      // Сериализуем базовое состояние для конкретного игрока
      const gameState = this.gameState.serializeForPlayer(conn.id);

      // 🌟 Обогащаем игроков флагом isDisconnected из PlayerConnection
      // В ServerGameState нет isDisconnected — оно только в PlayerConnection
      gameState.players = gameState.players.map(p => ({
        ...p,
        isDisconnected: this.players.get(p.id)?.isDisconnected ?? false,
      }));

      conn.emit('game:state-update', { gameState });
    }
  }
}