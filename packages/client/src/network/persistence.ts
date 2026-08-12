// packages/client/src/network/persistence.ts
// 🌟 Отдельный модуль для работы с localStorage.
// Используется и в networkSlice, и в stateSync.

const STORAGE_KEYS = {
  PLAYER_ID: 'carcassonne_player_id',
  ROOM_ID: 'carcassonne_room_id',
  PLAYER_NAME: 'carcassonne_player_name',
} as const;

export function saveConnectionInfo(playerId: string, roomId: string, playerName: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId);
    localStorage.setItem(STORAGE_KEYS.ROOM_ID, roomId);
    localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, playerName);
  } catch (e) {
    console.warn('⚠️ [Persistence] Не удалось сохранить:', e);
  }
}

export function loadConnectionInfo(): { playerId: string; roomId: string; playerName: string } | null {
  try {
    const playerId = localStorage.getItem(STORAGE_KEYS.PLAYER_ID);
    const roomId = localStorage.getItem(STORAGE_KEYS.ROOM_ID);
    const playerName = localStorage.getItem(STORAGE_KEYS.PLAYER_NAME);
    if (playerId && roomId && playerName) {
      return { playerId, roomId, playerName };
    }
  } catch (e) {
    console.warn('⚠️ [Persistence] Не удалось прочитать:', e);
  }
  return null;
}

export function clearConnectionInfo(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    localStorage.removeItem(STORAGE_KEYS.ROOM_ID);
    localStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
  } catch (e) {
    console.warn('⚠️ [Persistence] Не удалось очистить:', e);
  }
}

export function savePlayerName(playerName: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, playerName);
  } catch (e) {
    console.warn('⚠️ [Persistence] Не удалось сохранить имя:', e);
  }
}

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.PLAYER_NAME) || '';
  } catch {
    return '';
  }
}