// packages/server/src/rooms/Room.ts
// 🌟 Комната: фасад для лобби и игры.
// Делегирует работу специализированным модулям.

import type { GameSocket, ServerEventName, ServerEventArgs } from '../types';
import type { RoomSettings, RoomInfo, LobbyPlayer } from '@fiefdom/shared/protocol/events';
import type { SerializedGameState } from '@fiefdom/shared/core/serialization';
import type { PlayerConnection } from '../state/PlayerConnection';
import { ServerGameState } from '../state/ServerGameState';
import { RoomPlayerManager } from './RoomPlayerManager';
import { RoomBroadcaster } from './RoomBroadcaster';
import { RoomGameLoop } from './RoomGameLoop';
import type { RoomSnapshot, SnapshotPlayer } from '@fiefdom/shared/protocol/events';
import type { ErrorCode } from '@fiefdom/shared/protocol/errors';
import { logger } from '../utils/logger';

/**
 * Сколько ждём игрока, потерявшего соединение в ЛОББИ (хоста и остальных одинаково).
 * Не вернулся — исключается из комнаты; если это был хост, роль переходит другому.
 */
const LOBBY_DISCONNECT_GRACE_MS = 15_000;

/**
 * 🌟 Комната — фасад для управления лобби и игрой.
 * Делегирует работу специализированным модулям:
 * - RoomPlayerManager — управление игроками
 * - RoomBroadcaster — рассылка событий
 * - RoomGameLoop — игровой цикл
 */
export class Room {
  public readonly id: string;
  public readonly settings: RoomSettings;
  public players = new Map<string, PlayerConnection>();
  public hostId: string;
  public gameState = new ServerGameState();

  // 🌟 Специализированные модули
  private broadcaster: RoomBroadcaster;
  private playerManager: RoomPlayerManager;
  private gameLoop: RoomGameLoop;
  /** Таймеры исключения из лобби: playerId → таймер (идёт, пока игрок офлайн) */
  private lobbyEvictionTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Вызывается после исключения игрока по таймауту (комната могла опустеть,
   * список комнат — измениться). Подключает RoomManager.
   */
  public onLobbyEviction: (() => void) | null = null;

  constructor(id: string, settings: RoomSettings, host: PlayerConnection, preferredColor?: string) {
    this.id = id;
    this.settings = settings;
    this.hostId = host.id;

    // Инициализируем модули
    this.broadcaster = new RoomBroadcaster(this.players, this.gameState);
    this.playerManager = new RoomPlayerManager(
      this.id,
      this.players,
      this.settings,
      this.gameState,
      this.broadcaster
    );
    this.gameLoop = new RoomGameLoop(
      this.players,
      this.gameState,
      this.broadcaster,
      this.settings
    );

    // Добавляем хоста в комнату (цвет назначается с учётом предпочтения)
    this.playerManager.addPlayer(host, preferredColor);
  }

  // ============================================
  // 📡 ДЕЛЕГИРОВАНИЕ: РАССЫЛКА
  // ============================================

  /** Отправить событие ВСЕМ подключённым игрокам */
  broadcast<E extends ServerEventName>(event: E, ...args: ServerEventArgs<E>): void {
    this.broadcaster.broadcast(event, ...args);
  }

  /** Разослать состояние игры */
  broadcastState(): void {
    this.broadcaster.broadcastState();
  }

  // ============================================
  // 👥 ДЕЛЕГИРОВАНИЕ: ИГРОКИ
  // ============================================

  /** Добавить игрока в комнату */
  addPlayer(conn: PlayerConnection, preferredColor?: string): void {
    this.playerManager.addPlayer(conn, preferredColor);
  }

  /** Удалить игрока из комнаты */
  removePlayer(playerId: string): void {
    this.clearLobbyEviction(playerId);
    this.hostId = this.playerManager.removePlayer(playerId, this.hostId);
  }

  /** Пометить игрока как отключённого */
  markPlayerDisconnected(playerId: string): void {
    this.playerManager.markPlayerDisconnected(playerId);
    // В игре — запускаем отсчёт до автопропуска хода (если ходит этот игрок)
    this.gameLoop.onConnectionChanged();
    // В лобби — даём LOBBY_DISCONNECT_GRACE_MS на возвращение, затем исключаем
    this.scheduleLobbyEviction(playerId);
  }

  /**
   * 🚪 Игрок явно вышел из ИДУЩЕЙ игры: помечаем отключённым и выбывшим.
   * Если сейчас его ход — он пропускается сразу, без таймера.
   */
  handlePlayerLeftGame(playerId: string): void {
    this.markPlayerDisconnected(playerId);
    this.gameLoop.onPlayerLeft(playerId);
  }

  /** Игрок подал признак жизни в свой ход (сбрасывает отсчёт бездействия) */
  handleActivity(playerId: string): void {
    this.gameLoop.noteActivity(playerId);
  }

  /** Выбыл ли игрок из партии (вышел или пропустил слишком много ходов) */
  isPlayerAbandoned(playerId: string): boolean {
    return this.gameLoop.isPlayerAbandoned(playerId);
  }

  // ============================================
  // ⏳ ИСКЛЮЧЕНИЕ ОТКЛЮЧИВШИХСЯ ИЗ ЛОББИ
  // ============================================

  /**
   * Игрок потерял соединение в лобби: через LOBBY_DISCONNECT_GRACE_MS исключаем его
   * (с передачей хоста, если он был хостом). Короткий обрыв или перезагрузка
   * страницы ничего не отнимают. Только для лобби: в игре действует другая политика.
   */
  private scheduleLobbyEviction(playerId: string): void {
    if (this.gameState.isGameStarted) return;
    if (this.lobbyEvictionTimers.has(playerId)) return;

    const conn = this.players.get(playerId);
    if (!conn || !conn.isDisconnected) return;

    logger.info('[Room]', `⏳ ${conn.name} отключился в лобби ${this.id}: ждём ${LOBBY_DISCONNECT_GRACE_MS / 1000}с`);
    const timer = setTimeout(() => this.evictFromLobby(playerId), LOBBY_DISCONNECT_GRACE_MS);
    this.lobbyEvictionTimers.set(playerId, timer);
  }

  private clearLobbyEviction(playerId: string): void {
    const timer = this.lobbyEvictionTimers.get(playerId);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.lobbyEvictionTimers.delete(playerId);
  }

  private evictFromLobby(playerId: string): void {
    this.lobbyEvictionTimers.delete(playerId);

    // Состояние могло измениться за время ожидания
    if (this.gameState.isGameStarted) return;
    const conn = this.players.get(playerId);
    if (!conn || !conn.isDisconnected) return;

    logger.warn('[Room]', `🚪 ${conn.name} не вернулся за ${LOBBY_DISCONNECT_GRACE_MS / 1000}с → исключён из лобби ${this.id}`);

    // removePlayer сам выберет нового хоста (предпочитая игрока онлайн), если уходит хост
    this.removePlayer(playerId);
    this.broadcast('lobby:player-left', {
      playerId,
      newHostId: this.hostId,
      reason: 'timeout',
    });

    this.onLobbyEviction?.();
  }

  /**
   * 🌟 Повторно отправить игроку актуальное состояние (state-update + your-turn).
   * Используется, когда сервер отклонил ход: клиент к этому моменту уже перевёл
   * себя в фазу endTurn, и без ресинка он остался бы в ней навсегда.
   */
  resyncPlayer(playerId: string): void {
    const conn = this.players.get(playerId);
    if (!conn || conn.isDisconnected || !this.gameState.isGameStarted) return;

    conn.emit('game:state-update', {
      gameState: this.gameState.serializeForPlayer(playerId),
    });

    if (this.gameState.currentPlayer?.id === playerId && this.gameState.drawnTile) {
      conn.emit('game:your-turn', { drawnTile: this.gameState.drawnTile });
    }
  }

  /** Восстановить игрока в комнате */
  reconnectPlayer(oldPlayerId: string, newSocket: GameSocket, sessionToken: string): {
    success: boolean;
    reason?: string;
    snapshot?: RoomSnapshot;
  } {
    // 🚪 Выбывший из партии игрок (вышел / пропустил 3 хода подряд) вернуться не может
    if (this.gameState.isGameStarted && this.isPlayerAbandoned(oldPlayerId)) {
      return {
        success: false,
        reason: 'Вы выбыли из этой игры (выход или 3 пропущенных хода подряд)',
      };
    }

    const result = this.playerManager.reconnectPlayer(
      oldPlayerId,
      newSocket,
      sessionToken,
      this.hostId,
      (viewerId) => this.getSnapshot(viewerId)
    );

    if (result.success) {
      // Вернулся ходивший игрок — отменяем автопропуск; вернулся из лобби — отменяем исключение
      this.gameLoop.onConnectionChanged();
      this.clearLobbyEviction(oldPlayerId);
    }
    return result;
  }

  // ============================================
  // 🎮 ДЕЛЕГИРОВАНИЕ: ИГРОВОЙ ЦИКЛ
  // ============================================

  /** Инициализация игры БЕЗ начала хода */
  initializeGame(): void {
    // Игра стартует — ожидание возвращения игроков лобби больше не нужно
    for (const timer of this.lobbyEvictionTimers.values()) {
      clearTimeout(timer);
    }
    this.lobbyEvictionTimers.clear();
    this.gameLoop.initializeGame();
  }

  /** Начало первого хода */
  startFirstTurn(): void {
    this.gameLoop.startFirstTurn();
  }

  /** Начать игру (полный цикл) */
  startGame(): void {
    this.gameLoop.startGame();
  }

  /** Обработка хода игрока */
  handleCommitMove(
    playerId: string,
    tileData: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
    meepleData: { featureId: string; x: number; y: number } | null
  ): { success: boolean; error?: string } {
    return this.gameLoop.handleCommitMove(playerId, tileData, meepleData);
  }

  // ============================================
  // 📋 ИНФОРМАЦИЯ О КОМНАТЕ
  // ============================================

  /** Информация для списка комнат */
  toRoomInfo(): RoomInfo {
    const host = this.players.get(this.hostId);
    return {
      id: this.id,
      hostName: host?.name ?? 'Unknown',
      playerCount: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      timeControl: this.settings.timeControl,
      isPrivate: this.settings.isPrivate,
      isPlaying: this.gameState.isGameStarted,
    };
  }

  // ============================================
  // 📦 SNAPSHOT — единый снимок состояния
  // ============================================

  /**
   * 🌟 Создаёт полный снимок состояния комнаты для конкретного игрока.
   * Используется для reconnect и первоначальной синхронизации.
   *
   * @param viewerId ID игрока, для которого создаётся snapshot
   *                 (нужно для приватности drawnTile)
   */
  getSnapshot(viewerId: string): RoomSnapshot {
    // Собираем игроков с сетевым статусом
    const players: SnapshotPlayer[] = Array.from(this.players.values()).map(conn => ({
      // Профиль
      id: conn.player.id,
      name: conn.player.name,
      color: conn.player.color,
      // Игровое состояние (если игра началась)
      ...(this.gameState.isGameStarted ? {
        score: conn.player.score,
        meepleCount: conn.player.meepleCount,
        pointsByCategory: conn.player.pointsByCategory,
      } : {}),
      // Сетевой статус
      network: {
        isReady: conn.isReady,
        isHost: conn.id === this.hostId,
        isDisconnected: conn.isDisconnected,
      },
    }));

    // Игровое состояние (если игра началась)
    const gameState = this.gameState.isGameStarted
      ? this.gameState.serializeForPlayer(viewerId)
      : undefined;

    // Приватный drawnTile (только если сейчас ход этого игрока)
    const drawnTile = this.gameState.isGameStarted && this.gameState.currentPlayer?.id === viewerId
      ? this.gameState.drawnTile
      : null;

    return {
      roomId: this.id,
      hostId: this.hostId,
      settings: this.settings,
      gameStartTime: this.gameState.gameStartTime ?? null,
      players,
      gameState,
      yourPlayerId: viewerId,
      // 🔐 Токен виден только владельцу снапшота
      yourSessionToken: this.players.get(viewerId)?.sessionToken ?? '',
      timedOutPlayerIds: this.gameState.timedOutIds,
      drawnTile,
    };
  }

  // ============================================
  // 🧹 ЖИЗНЕННЫЙ ЦИКЛ
  // ============================================

  /** Освободить ресурсы */
  dispose(): void {
    for (const timer of this.lobbyEvictionTimers.values()) {
      clearTimeout(timer);
    }
    this.lobbyEvictionTimers.clear();
    this.gameLoop.dispose();
  }

  // ============================================
  // 📊 СВОЙСТВА
  // ============================================

  get isFull(): boolean {
    return this.players.size >= this.settings.maxPlayers;
  }

  /** Сколько игроков сейчас онлайн */
  get connectedCount(): number {
    let count = 0;
    for (const conn of this.players.values()) {
      if (!conn.isDisconnected) count++;
    }
    return count;
  }

  /** Есть ли в комнате хотя бы один подключённый игрок */
  get hasConnectedPlayers(): boolean {
    return this.connectedCount > 0;
  }

  /**
   * 🌟 Что мешает стартовать игру (null — можно стартовать).
   * Серверная проверка зеркалит условия кнопки «Начать игру» на клиенте:
   * кнопку можно обойти, поэтому сервер обязан проверять сам.
   */
  getStartBlocker(): ErrorCode | null {
    if (this.gameState.isGameStarted) return 'GAME_ALREADY_STARTED';

    const all = Array.from(this.players.values());
    if (all.length < 2) return 'NOT_ENOUGH_PLAYERS';
    if (all.some(p => p.isDisconnected || !p.isReady)) return 'NOT_ALL_READY';

    return null;
  }

  get canStart(): boolean {
    return this.getStartBlocker() === null;
  }

  get isGameStarted(): boolean {
    return this.gameState.isGameStarted;
  }
}
