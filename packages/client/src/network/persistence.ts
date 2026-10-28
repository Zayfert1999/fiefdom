// packages/client/src/network/persistence.ts
// 🌟 Отдельный модуль для работы с localStorage.
// Используется и в networkSlice, и в stateSync.

import { DEFAULT_TIME_CONTROL, normalizeTimeControl, type TimeControl } from '@fiefdom/shared/core/fischerClock';

const STORAGE_KEYS = {
  PLAYER_ID: 'Fiefdom_player_id',
  SESSION_TOKEN: 'Fiefdom_session_token',
  ROOM_ID: 'Fiefdom_room_id',
  PLAYER_NAME: 'Fiefdom_player_name',
  PLAYER_COLOR: 'Fiefdom_player_color',
} as const;

export function saveConnectionInfo(
  playerId: string,
  roomId: string,
  playerName: string,
  sessionToken: string
): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId);
    // 🔐 Секрет сессии: без него сервер не позволит вернуться в комнату.
    // localStorage доступен скрипту страницы, поэтому токен живёт только пока
    // активна комната и стирается при выходе (clearConnectionInfo).
    localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, sessionToken);
    localStorage.setItem(STORAGE_KEYS.ROOM_ID, roomId);
    localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, playerName);
  } catch (e) {
    console.warn('⚠️ [Persistence] Не удалось сохранить:', e);
  }
}

export function loadConnectionInfo(): {
  playerId: string;
  roomId: string;
  playerName: string;
  sessionToken: string;
} | null {
  try {
    const playerId = localStorage.getItem(STORAGE_KEYS.PLAYER_ID);
    const sessionToken = localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
    const roomId = localStorage.getItem(STORAGE_KEYS.ROOM_ID);
    const playerName = localStorage.getItem(STORAGE_KEYS.PLAYER_NAME);
    // Сессии, сохранённые до введения токена, недействительны (токена у них нет)
    if (playerId && roomId && playerName && sessionToken) {
      return { playerId, roomId, playerName, sessionToken };
    }
  } catch (e) {
    console.warn('⚠️ [Persistence] Не удалось прочитать:', e);
  }
  return null;
}

export function clearConnectionInfo(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
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

export function savePlayerColor(color: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYER_COLOR, color);
  } catch (e) {
    console.warn('⚠️ [Persistence] Не удалось сохранить цвет:', e);
  }
}

export function loadPlayerColor(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.PLAYER_COLOR) || '#ff5555';
  } catch {
    return '#ff5555';
  }
}

// ============================================
// 🕐 Настройка таймера ЛОКАЛЬНОЙ игры
// ============================================
const LOCAL_TIME_CONTROL_KEY = 'Fiefdom_local_time_control';

/** null — таймер выключен. Без сохранённого значения — стандартные 10 мин + 5 с. */
export function loadLocalTimeControl(): TimeControl | null {
  try {
    const raw = localStorage.getItem(LOCAL_TIME_CONTROL_KEY);
    if (raw === null) return DEFAULT_TIME_CONTROL;
    if (raw === 'off') return null;
    return normalizeTimeControl(JSON.parse(raw) as Partial<TimeControl>);
  } catch {
    return DEFAULT_TIME_CONTROL;
  }
}

export function saveLocalTimeControl(timeControl: TimeControl | null): void {
  try {
    localStorage.setItem(
      LOCAL_TIME_CONTROL_KEY,
      timeControl === null ? 'off' : JSON.stringify(timeControl)
    );
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — настройка просто не сохранится
  }
}
