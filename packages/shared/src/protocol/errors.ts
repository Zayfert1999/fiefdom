// packages/shared/src/protocol/errors.ts
// 🌟 Единый справочник кодов ошибок протокола.
// Сервер отправляет { code, message }, клиент может показать message
// напрямую либо подставить собственный текст по code.

export const ERROR_MESSAGES = {
  // --- Общие ---
  INVALID_DATA: 'Неверные данные запроса',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера',
  NOT_IN_ROOM: 'Вы не находитесь в комнате',
  INVALID_ACTION: 'Недопустимое действие',

  // --- Лобби ---
  ROOM_NOT_FOUND: 'Комната не найдена',
  ROOM_FULL: 'Комната заполнена',
  GAME_ALREADY_STARTED: 'Игра в этой комнате уже началась',
  NOT_HOST: 'Это действие доступно только хосту',
  NOT_ENOUGH_PLAYERS: 'Для старта нужно минимум 2 игрока',
  NOT_ALL_READY: 'Не все игроки готовы или подключены',

  // --- Игра ---
  GAME_NOT_STARTED: 'Игра ещё не началась',
  NOT_YOUR_TURN: 'Сейчас не ваш ход',
  NO_TILE_DRAWN: 'Тайл ещё не выдан',
  CELL_OCCUPIED: 'Эта клетка уже занята',
  INVALID_PLACEMENT: 'Сюда нельзя поставить тайл',
  NO_MEEPLES: 'У вас не осталось миплов',
  FEATURE_NOT_FOUND: 'На тайле нет такой области',
  FEATURE_OCCUPIED: 'Эта область уже занята миплом',
} as const satisfies Record<string, string>;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

/** Человекочитаемое сообщение по коду (с запасным вариантом для неизвестных кодов) */
export function getErrorMessage(code: string, fallback = 'Произошла ошибка'): string {
  return (ERROR_MESSAGES as Record<string, string>)[code] ?? fallback;
}
