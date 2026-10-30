// packages/client/src/network/stateSync/lobbyHandlers.ts
// 🌟 Обработчики событий лобби.
// create / join / leave / ready / kick / disconnect / reconnect / room-list

import type { GameSocket } from '@/network/socket';
import { useGameStore } from '@/state/useGameStore';
import { clearConnectionInfo } from '@/network/persistence';
import { toast } from '@/state/useToastStore';
import { applyServerState } from './applyServerState';
import { getPlayerName, isMe } from './helpers';
import type { RoomSnapshot, LobbyPlayer } from '@fiefdom/shared/protocol/events';
import { netLog } from '@/network/netLog';

/**
 * 🌟 Применяет RoomSnapshot к клиентскому store.
 * Единая точка применения для всех сценариев:
 * - reconnect
 * - join-room
 * - game:started
 */
function applySnapshot(snapshot: RoomSnapshot): void {
  const store = useGameStore.getState();

  // 1. Мета-данные комнаты
  store._setRoomInfo(snapshot.roomId, snapshot.yourPlayerId);
  store._setRoomSettings(snapshot.settings);
  store._setHost(snapshot.hostId === snapshot.yourPlayerId);

  // 2. Время старта игры
  store.setGameStartTime(snapshot.gameStartTime);

  // 3. Сохраняем подключение (для надёжности)
  store._saveConnectionInfo(snapshot.yourPlayerId, snapshot.roomId, snapshot.yourSessionToken);

  // 4. Сетевой статус игроков → networkLobbyPlayers
  const lobbyPlayers: LobbyPlayer[] = snapshot.players.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isReady: p.network.isReady,
    isHost: p.network.isHost,
    isDisconnected: p.network.isDisconnected,
  }));
  store._setLobbyPlayers(lobbyPlayers);

  // 5. Применяем настройки сессии
  useGameStore.setState({
    showRegions: snapshot.settings.showRegions,
    showDeadCells: snapshot.settings.showDeadCells,
    enabledDeckView: snapshot.settings.enabledDeckView,
  });

  // 6. Игровое состояние (если игра началась)
  if (snapshot.gameState) {
    netLog(`🎮 [StateSync] Игра уже началась — восстанавливаем состояние`);
    applyServerState(snapshot.gameState);
    // Кто остался без времени (зрители) — иначе вернувшийся клиент не знал бы об этом
    useGameStore.setState({ timedOutPlayerIds: snapshot.timedOutPlayerIds ?? [] });

    // 🌟 Сейчас мой ход и тайл выдан → сразу переводим в фазу размещения.
    // (Раньше сервер досылал отдельный game:your-turn через setTimeout(100) — гонка.)
    if (snapshot.drawnTile) {
      useGameStore.setState({ drawnTile: snapshot.drawnTile, phase: 'placeTile' });
    }
  } else {
    // В лобби — переключаемся на waiting
    store.setLobbyScreen('networkLobby');
  }

  useGameStore.setState({ isReconnectingToRoom: false });
}

/**
 * 🌟 Регистрирует обработчики событий лобби.
 *
 * Сюда входят:
 * - room-created / room-joined — создание и присоединение
 * - room-list — список публичных комнат (браузер комнат)
 * - player-joined / player-left — изменения списка игроков
 * - player-ready — готовность
 * - player-kicked / kicked — кик игроков
 * - player-disconnected / player-reconnected — статус подключения
 * - reconnect-success / reconnect-failed — восстановление после перезагрузки/обрыва
 *
 * @param socket Типизированный socket
 */
export function registerLobbyHandlers(socket: GameSocket): void {
  // ============================================
  // 🏠 СОЗДАНИЕ И ПРИСОЕДИНЕНИЕ К КОМНАТЕ
  // ============================================
  socket.on('lobby:room-created', ({ roomId, playerId }) => {
    netLog(`🏠 [StateSync] Комната создана: ${roomId}`);
    useGameStore.getState()._setRoomInfo(roomId, playerId);
    useGameStore.getState()._setHost(true);
  });

  socket.on('lobby:room-joined', ({ snapshot }) => {
    netLog(`🚪 [StateSync] Присоединились к комнате ${snapshot.roomId}`);
    applySnapshot(snapshot);
  });

  // ============================================
  // 🔎 БРАУЗЕР КОМНАТ
  // ============================================
  socket.on('lobby:room-list', (rooms) => {
    useGameStore.getState()._setRoomList(rooms);
  });

  // ============================================
  // 👥 ИЗМЕНЕНИЯ СПИСКА ИГРОКОВ
  // ============================================
  socket.on('lobby:player-joined', (player) => {
    netLog(`➕ [StateSync] Игрок присоединился: ${player.name}`);
    const store = useGameStore.getState();

    // Защита от дублей (например, повторная доставка события)
    const withoutDuplicate = store.networkLobbyPlayers.filter(p => p.id !== player.id);
    store._setLobbyPlayers([...withoutDuplicate, player]);

    toast.info(`👋 ${player.name} присоединился`);
  });

  socket.on('lobby:player-left', ({ playerId, newHostId, reason }) => {
    netLog(`➖ [StateSync] Игрок вышел: ${playerId}`);
    const store = useGameStore.getState();

    // Имя нужно взять ДО удаления игрока из списка
    const name = getPlayerName(playerId);

    store._setLobbyPlayers(
      store.networkLobbyPlayers.filter(p => p.id !== playerId)
    );
    // timeout — игрок потерял соединение и не вернулся за 15 секунд
    toast.info(
      reason === 'timeout'
        ? `📴 ${name} потерял соединение и исключён из комнаты`
        : `🚪 ${name} вышел из комнаты`
    );

    if (newHostId) {
      // Хост мог смениться (ушёл прежний): обновляем флаги в списке игроков
      useGameStore.getState()._setLobbyPlayers(
        useGameStore.getState().networkLobbyPlayers.map(p => ({ ...p, isHost: p.id === newHostId }))
      );
      const iAmHost = store.playerId === newHostId;
      store._setHost(iAmHost);
      if (iAmHost) {
        toast.info('👑 Вы стали хостом комнаты');
      } else if (!isMe(playerId)) {
        const hostChanged = store.networkLobbyPlayers.find(p => p.id === playerId)?.isHost;
        if (hostChanged) toast.info(`👑 ${getPlayerName(newHostId)} — новый хост`);
      }
    }
  });

  // ============================================
  // ✅ ГОТОВНОСТЬ И ХОСТ
  // ============================================
  socket.on('lobby:player-ready', ({ playerId, isReady }) => {
    const store = useGameStore.getState();
    store._setLobbyPlayers(
      store.networkLobbyPlayers.map(p =>
        p.id === playerId ? { ...p, isReady } : p
      )
    );
  });

  // ============================================
  // 👢 КИК ИГРОКОВ
  // ============================================
  socket.on('lobby:player-kicked', ({ playerId }) => {
    netLog(`👢 [StateSync] Игрок кикнут: ${playerId}`);
    const store = useGameStore.getState();
    const name = getPlayerName(playerId);

    store._setLobbyPlayers(
      store.networkLobbyPlayers.filter(p => p.id !== playerId)
    );
    toast.info(`👢 ${name} исключён из комнаты`);
  });

  socket.on('lobby:kicked', () => {
    netLog(`👢 [StateSync] Вас кикнули из комнаты`);
    const store = useGameStore.getState();
    store.leaveRoom();
    useGameStore.setState({ isReconnectingToRoom: false });
    toast.error('Вас исключили из комнаты', { duration: 8000 });
  });

  // ============================================
  // 🔌 ОТКЛЮЧЕНИЕ ДРУГИХ ИГРОКОВ (лобби + игра)
  // ============================================
  socket.on('lobby:player-disconnected', ({ playerId }) => {
    netLog(`⚠️ [StateSync] Игрок отключился: ${playerId}`);
    const store = useGameStore.getState();

    // Обновляем список лобби (для экрана ожидания и карточек игроков в HUD)
    store._setLobbyPlayers(
      store.networkLobbyPlayers.map(p =>
        p.id === playerId ? { ...p, isDisconnected: true } : p
      )
    );

    if (!isMe(playerId)) {
      // В лобби у отключившегося есть 15 секунд, чтобы вернуться, — потом его исключат
      const inLobby = useGameStore.getState().phase === 'lobby';
      toast.warning(
        inLobby
          ? `⚠️ ${getPlayerName(playerId)} отключился — исключим через 15 с, если не вернётся`
          : `⚠️ ${getPlayerName(playerId)} отключился`
      );
    }
  });

  socket.on('lobby:player-reconnected', ({ playerId }) => {
    netLog(`✅ [StateSync] Игрок переподключился: ${playerId}`);
    const store = useGameStore.getState();

    // Обновляем список лобби
    store._setLobbyPlayers(
      store.networkLobbyPlayers.map(p =>
        p.id === playerId ? { ...p, isDisconnected: false } : p
      )
    );

    if (!isMe(playerId)) {
      toast.success(`✅ ${getPlayerName(playerId)} вернулся в игру`);
    }
  });

  // ============================================
  // 🔄 ВОССТАНОВЛЕНИЕ ПОСЛЕ ПЕРЕЗАГРУЗКИ / ОБРЫВА СВЯЗИ
  // ============================================
  socket.on('lobby:reconnect-success', ({ snapshot }) => {
    netLog(`✅ [StateSync] Успешное восстановление в комнате ${snapshot.roomId}`);
    applySnapshot(snapshot);
    toast.success('Вы снова в комнате', { dedupeKey: 'session' });
  });

  // 🌟 Раньше это событие на клиенте не обрабатывалось вообще: при отказе сервера
  // (комната удалена, игрок не найден) пользователь молча оставался ни с чем
  // — кнопка «Продолжить» просто переставала реагировать.
  socket.on('lobby:reconnect-failed', ({ reason }) => {
    console.warn(`❌ [StateSync] Не удалось восстановиться: ${reason}`);
    const store = useGameStore.getState();
    const wasInRoom = store.roomId !== null;

    // Сессия недействительна — забываем её, иначе будем пытаться вечно
    clearConnectionInfo();
    store.setActiveGame(null);
    useGameStore.setState({ isReconnectingToRoom: false });

    if (wasInRoom) {
      // Обрыв связи посреди игры/лобби, а вернуться некуда → в главное меню
      store.exitToLobby();
    }
    store.setReconnectError(reason);
    toast.error(`Не удалось вернуться в игру: ${reason}`, { duration: 8000 });
  });
}
