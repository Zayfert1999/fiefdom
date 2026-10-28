// packages/server/src/rooms/RoomBroadcaster.ts
// 🌟 Рассылка событий и состояния игры.
// Отделён от Room для чёткого разделения ответственности.

import type { PlayerConnection } from '../state/PlayerConnection';
import type { ServerGameState } from '../state/ServerGameState';
import type { ServerEventName, ServerEventArgs } from '../types';

/**
 * 🌟 Инкапсулирует логику рассылки событий игрокам.
 * Учитывает приватность drawnTile и статус отключения.
 */
export class RoomBroadcaster {
    constructor(
        private players: Map<string, PlayerConnection>,
        private gameState: ServerGameState
    ) { }

    // ============================================
    // 📡 РАССЫЛКА СОБЫТИЙ
    // ============================================

    /**
     * Отправить событие ВСЕМ подключённым игрокам.
     * Отключённые игроки пропускаются.
     */
    broadcast<E extends ServerEventName>(event: E, ...args: ServerEventArgs<E>): void {
        for (const conn of this.players.values()) {
            if (!conn.isDisconnected) {
                conn.emit(event, ...args);
            }
        }
    }

    /**
     * Отправить событие всем подключённым игрокам, КРОМЕ одного
     * (например, «игрок вернулся» не нужно слать самому вернувшемуся).
     */
    broadcastExcept<E extends ServerEventName>(excludePlayerId: string, event: E, ...args: ServerEventArgs<E>): void {
        for (const conn of this.players.values()) {
            if (conn.id !== excludePlayerId && !conn.isDisconnected) {
                conn.emit(event, ...args);
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

            conn.emit('game:state-update', { gameState });
        }
    }
}
