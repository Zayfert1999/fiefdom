// packages/client/src/network/stateSync/helpers.ts
// 🌟 Общие хелперы сетевых обработчиков: имена игроков, подписи для toast-ов.

import { useGameStore } from '@/state/useGameStore';

/** Русские названия типов регионов (для сообщений) */
export const FEATURE_LABELS: Record<string, { icon: string; title: string }> = {
  city: { icon: '🏰', title: 'Город' },
  road: { icon: '🛣️', title: 'Дорога' },
  monastery: { icon: '⛪', title: 'Монастырь' },
  field: { icon: '🌾', title: 'Поле' },
};

/** Я ли это? */
export function isMe(playerId: string): boolean {
  return useGameStore.getState().playerId === playerId;
}

/**
 * Имя игрока по id: сначала из игры, затем из списка лобби.
 * Если игрока уже нет в сторе — нейтральное «Игрок».
 */
export function getPlayerName(playerId: string): string {
  const state = useGameStore.getState();
  return (
    state.players.find((p) => p.id === playerId)?.name ??
    state.networkLobbyPlayers.find((p) => p.id === playerId)?.name ??
    'Игрок'
  );
}

/** «Вы» для себя, иначе имя */
export function getDisplayName(playerId: string): string {
  return isMe(playerId) ? 'Вы' : getPlayerName(playerId);
}
