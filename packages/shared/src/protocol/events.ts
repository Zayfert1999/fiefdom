// packages/shared/src/protocol/events.ts
// 🌟 Определения всех сетевых событий Client ↔ Server
// Единый источник истины для обоих сторон

import type { Player, Tile } from '../core/types';
import type { SerializedGameState } from '../core/serialization';
import type { CompletedRegion } from '../core/scoring'
import type { TimeControl } from '../core/fischerClock';

// ============================================
// 📦 ТИПЫ ДАННЫХ
// ============================================

/** Настройки комнаты (задаются при создании) */
export interface RoomSettings {
  isPrivate: boolean;       // Приватная (по коду) или публичная
  /** Часы Фишера: основное время + инкремент за ход. Отключить нельзя (онлайн-игра). */
  timeControl: TimeControl;
  maxPlayers: number;       // Максимум игроков (2-5)
  showRegions: boolean;
  showDeadCells: boolean;
  enabledDeckView: boolean;
}

/** Информация об игроке в лобби */
export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
  isDisconnected?: boolean;
}

/** Информация о комнате для списка лобби */
export interface RoomInfo {
  id: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  timeControl: TimeControl;
  isPrivate: boolean;
  isPlaying: boolean;
}

// ============================================
// 📦 ROOM SNAPSHOT — единый снимок состояния комнаты
// Используется для reconnect и первоначальной синхронизации
// ============================================

/** Сетевой статус игрока (инфраструктура, не игровая логика) */
export interface PlayerNetworkStatus {
  isReady: boolean;
  isHost: boolean;
  isDisconnected: boolean;
}

/** Игрок в snapshot: профиль + игровой статус + сетевой статус */
export interface SnapshotPlayer {
  // Профиль (мета-данные)
  id: string;
  name: string;
  color: string;
  // Игровое состояние (если игра началась)
  score?: number;
  meepleCount?: number;
  pointsByCategory?: {
    road: number;
    city: number;
    field: number;
    monastery: number;
  };
  // Сетевой статус
  network: PlayerNetworkStatus;
}

/** Единый снимок состояния комнаты */
export interface RoomSnapshot {
  // === Мета-данные комнаты ===
  roomId: string;
  hostId: string;
  settings: RoomSettings;
  gameStartTime: number | null;

  // === Игроки (профиль + сеть) ===
  players: SnapshotPlayer[];

  // === Игровое состояние (если игра началась) ===
  gameState?: SerializedGameState;

  // === Для текущего игрока (приватные данные) ===
  yourPlayerId: string;
  /**
   * 🔐 Секрет сессии. Отправляется ТОЛЬКО владельцу (снапшот всегда формируется
   * под конкретного viewerId) и никогда не попадает в публичные структуры
   * (LobbyPlayer, SnapshotPlayer, рассылки комнате). Нужен для lobby:reconnect.
   */
  yourSessionToken: string;
  drawnTile?: Tile | null;  // Только если сейчас его ход
}

// ============================================
// ✅ ACK ХОДА
// ============================================

/**
 * Ответ сервера на game:commit-move (socket.io acknowledgement).
 * ok: true — ход принят (новое состояние придёт отдельным game:state-update);
 * ok: false — ход отклонён, состояние игры не изменилось.
 */
export type MoveAck =
  | { ok: true }
  | { ok: false; code: string; message: string };

// ============================================
// 📤 CLIENT → SERVER (исходящие события)
// ============================================

export interface ClientToServerEvents {
  // --- Лобби ---
  'lobby:create-room': (data: {
    playerName: string;
    settings: RoomSettings;
    preferredColor?: string;
  }) => void;

  'lobby:join-room': (data: {
    roomId: string;
    playerName: string;
    preferredColor?: string;
  }) => void;

  'lobby:reconnect': (data: {
    playerId: string;
    roomId: string;
    sessionToken: string;
  }) => void;

  'lobby:leave-room': () => void;

  // --- Браузер комнат ---
  /** Подписаться на live-обновления списка публичных комнат (сервер сразу пришлёт текущий список) */
  'lobby:subscribe-rooms': () => void;
  /** Отписаться от обновлений списка */
  'lobby:unsubscribe-rooms': () => void;
  /** Разовый запрос списка (кнопка «Обновить») */
  'lobby:list-rooms': () => void;

  'lobby:set-ready': (ready: boolean) => void;
  'lobby:kick-player': (data: { playerId: string }) => void;
  'lobby:start-game': () => void;  // Только хост

  // --- Игра ---
  'game:commit-move': (data: {
    tile: {
      x: number;
      y: number;
      rotation: 0 | 90 | 180 | 270;
    };
    meeple: {
      featureId: string;
      x: number;
      y: number;
    } | null;  // null = пропуск мипла
  }, ack?: (result: MoveAck) => void) => void;

  /** Запросить актуальное состояние игры (если клиент подозревает рассинхрон) */
  'game:request-sync': () => void;

  /**
   * «Я на месте»: клиент шлёт при любом действии игрока (движение мыши, клавиши, касания)
   * во время своего хода, не чаще раза в пару секунд. Без активности ход пропускается (AFK).
   */
  'game:activity': () => void;

  // --- Служебное ---
  /** Замер задержки: сервер сразу вызывает ack */
  'net:ping': (ack: () => void) => void;


  'session:check-active': (data: {
    playerId: string;
    sessionToken: string;
  }) => void;

}

// ============================================
// 📥 SERVER → CLIENT (входящие события)
// ============================================

export interface ServerToClientEvents {
  // --- Лобби ---
  'lobby:room-created': (data: {
    roomId: string;
    playerId: string;
  }) => void;

  'lobby:room-joined': (data: {
    // 🌟 Единый снапшот вместо фрагментарных полей
    snapshot: RoomSnapshot;
  }) => void;

  'lobby:reconnect-success': (data: {
    // единый snapshot вместо фрагментарных полей
    snapshot: RoomSnapshot;
  }) => void;

  'lobby:reconnect-failed': (data: {
    reason: string;
  }) => void;

  'lobby:player-joined': (player: LobbyPlayer) => void;
  /**
   * Игрок покинул лобби. newHostId — если вместе с ним сменился хост.
   * reason: timeout — игрок потерял соединение и не вернулся за 15 секунд.
   */
  'lobby:player-left': (data: { playerId: string; newHostId?: string; reason?: 'timeout' }) => void;
  'lobby:player-ready': (data: { playerId: string; isReady: boolean }) => void;
  'lobby:room-list': (rooms: RoomInfo[]) => void;
  'lobby:player-disconnected': (data: { playerId: string }) => void;
  'lobby:player-reconnected': (data: { playerId: string }) => void;
  'lobby:player-kicked': (data: { playerId: string }) => void;
  'lobby:kicked': () => void;

  // --- Игра ---
  'game:started': (data: {
    // 🌟 Единый снапшот вместо фрагментарных полей
    snapshot: RoomSnapshot;
  }) => void;

  'game:state-update': (data: {
    gameState: SerializedGameState;
  }) => void;

  'game:your-turn': (data: {
    drawnTile: Tile;
  }) => void;

  'game:move-committed': (data: {
    playerId: string;
    tile: { x: number; y: number; rotation: number; tileId: string };
    meeple: { featureId: string; x: number; y: number } | null;
  }) => void;

  'game:regions-completed': (data: {
    regions: Array<{
      rootKey: string;
      type: string;
      points: number;
      winners: string[];
      allMeepleOwners: string[];
      featureKeys: string[];
    }>;
  }) => void;

  'game:final-scoring': (data: {
    regions: CompletedRegion[];
  }) => void;

  'game:over': (data: {
    finalScores: Player[];
    /**
     * completed — колода закончилась; abandoned — игроки перестали отвечать;
     * forfeit — остальные игроки покинули игру (остался один).
     */
    reason?: 'completed' | 'abandoned' | 'forfeit';
  }) => void;

  /**
   * Ход пропущен сервером (тайл из руки выбрасывается).
   * timeout — закончилось время на часах, absent — игрок отключён,
   * afk — игрок на связи, но бездействует.
   * missedTurns / maxMissedTurns — сколько ходов подряд пропущено игроком
   * (по достижении максимума он считается покинувшим игру).
   */
  'game:turn-skipped': (data: {
    playerId: string;
    reason: 'timeout' | 'absent' | 'afk';
    missedTurns: number;
    maxMissedTurns: number;
  }) => void;

  /**
   * Игрок выбыл из игры: left — вышел сам, missed-turns — пропустил слишком много ходов
   * подряд (офлайн, по бездействию или по времени). Его ходы больше не ждут.
   */
  'game:player-abandoned': (data: {
    playerId: string;
    reason: 'left' | 'missed-turns';
  }) => void;

  /**
   * Состояние шахматных часов (шлётся раз в секунду во время хода, а также в начале
   * и в конце хода). banksMs — остаток банка каждого игрока в миллисекундах НА МОМЕНТ
   * отправки; у активного игрока банк продолжает тикать — клиент досчитывает сам
   * от момента получения (не полагаясь на синхронность часов клиента и сервера).
   */
  'game:timer-update': (data: {
    banksMs: Record<string, number>;
    /** Чьи часы идут сейчас; null — часы остановлены (пауза между ходами) */
    activePlayerId: string | null;
  }) => void;

  /** Предупреждение лично игроку: бездействует, ход скоро будет пропущен */
  'game:afk-warning': (data: {
    secondsLeft: number;
  }) => void;

  // --- Ошибки ---
  // code — один из ErrorCode (см. errors.ts), message — текст на русском
  'error': (data: {
    code: string;
    message: string;
  }) => void;

  'session:active-games': (data: {
    game: {
      roomId: string;
      playerName: string;
      playerColor: string;
      isHost: boolean;
      gameStarted: boolean;
      playerCount: number;
    } | null;
  }) => void;
}
