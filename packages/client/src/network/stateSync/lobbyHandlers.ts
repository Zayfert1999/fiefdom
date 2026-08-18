// packages/client/src/network/stateSync/lobbyHandlers.ts
// 🌟 Обработчики событий лобби.
// create / join / leave / ready / kick / disconnect / reconnect

import type { GameSocket } from '@/network/socket';
import { useGameStore } from '@/state/useGameStore';
import { clearConnectionInfo } from '@/network/persistence';
import { applyServerState } from './applyServerState';

/**
 * 🌟 Регистрирует обработчики событий лобби.
 *
 * Сюда входят:
 * - room-created / room-joined — создание и присоединение
 * - player-joined / player-left — изменения списка игроков
 * - player-ready / settings-changed — готовность и настройки
 * - player-kicked / kicked — кик игроков
 * - player-disconnected / player-reconnected — статус подключения
 * - reconnect-success / reconnect-failed — восстановление после перезагрузки
 *
 * @param socket Типизированный socket
 */
export function registerLobbyHandlers(socket: GameSocket): void {
  // ============================================
  // 🏠 СОЗДАНИЕ И ПРИСОЕДИНЕНИЕ К КОМНАТЕ
  // ============================================
  socket.on('lobby:room-created', ({ roomId, playerId }) => {
    console.log(`🏠 [StateSync] Комната создана: ${roomId}`);
    useGameStore.getState()._setRoomInfo(roomId, playerId);
    useGameStore.getState()._setHost(true);
  });

  socket.on('lobby:room-joined', ({ roomId, playerId, players, settings }) => {
    console.log(`🚪 [StateSync] Присоединились к комнате ${roomId}`);
    const store = useGameStore.getState();
    store._setRoomInfo(roomId, playerId);
    store._setLobbyPlayers(players);
    store._setRoomSettings(settings);
    store._setHost(players.find(p => p.id === playerId)?.isHost ?? false);

    // Применяем настройки сессии
    useGameStore.setState({
      showRegions: settings.showRegions,
      showDeadCells: settings.showDeadCells,
      enabledDeckView: settings.enabledDeckView,
    });
  });

  // ============================================
  // 👥 ИЗМЕНЕНИЯ СПИСКА ИГРОКОВ
  // ============================================
  socket.on('lobby:player-joined', (player) => {
    console.log(`➕ [StateSync] Игрок присоединился: ${player.name}`);
    const store = useGameStore.getState();
    store._setLobbyPlayers([...store.networkLobbyPlayers, player]);
  });

  socket.on('lobby:player-left', ({ playerId, newHostId }) => {
    console.log(`➖ [StateSync] Игрок вышел: ${playerId}`);
    const store = useGameStore.getState();
    store._setLobbyPlayers(
      store.networkLobbyPlayers.filter(p => p.id !== playerId)
    );
    if (newHostId) {
      const myId = store.playerId;
      store._setHost(myId === newHostId);
    }
  });

  // ============================================
  // ✅ ГОТОВНОСТЬ И НАСТРОЙКИ
  // ============================================
  socket.on('lobby:player-ready', ({ playerId, isReady }) => {
    const store = useGameStore.getState();
    store._setLobbyPlayers(
      store.networkLobbyPlayers.map(p =>
        p.id === playerId ? { ...p, isReady } : p
      )
    );
  });

  socket.on('lobby:settings-changed', (settings) => {
    useGameStore.getState()._setRoomSettings(settings);
  });

  // ============================================
  // 👢 КИК ИГРОКОВ
  // ============================================
  socket.on('lobby:player-kicked', ({ playerId }) => {
    console.log(`👢 [StateSync] Игрок кикнут: ${playerId}`);
    const store = useGameStore.getState();
    store._setLobbyPlayers(
      store.networkLobbyPlayers.filter(p => p.id !== playerId)
    );
  });

  socket.on('lobby:kicked', () => {
    console.log(`👢 [StateSync] Вас кикнули из комнаты`);
    const store = useGameStore.getState();
    store.setReconnectError('Вас кикнули из комнаты');
    store.leaveRoom();
    useGameStore.setState({ isReconnectingToRoom: false });
  });

  // ============================================
  // 🔌 ОТКЛЮЧЕНИЕ ДРУГИХ ИГРОКОВ (лобби + игра)
  // ============================================
  socket.on('lobby:player-disconnected', ({ playerId }) => {
    console.log(`⚠️ [StateSync] Игрок отключился: ${playerId}`);
    const store = useGameStore.getState();

    // Обновляем список лобби (для экрана ожидания)
    store._setLobbyPlayers(
      store.networkLobbyPlayers.map(p =>
        p.id === playerId ? { ...p, isDisconnected: true } : p
      )
    );

    // Сразу обновляем players для GameHUD (быстрая реакция)
    // Серверный state-update тоже содержит isDisconnected: true,
    // поэтому флаг не потеряется при следующих обновлениях
    if (store.players.length > 0) {
      const players = store.players.map(p =>
        p.id === playerId ? { ...p, isDisconnected: true } : p
      );
      useGameStore.setState({ players });
    }
  });

  socket.on('lobby:player-reconnected', ({ playerId }) => {
    console.log(`✅ [StateSync] Игрок переподключился: ${playerId}`);
    const store = useGameStore.getState();

    // Обновляем список лобби
    store._setLobbyPlayers(
      store.networkLobbyPlayers.map(p =>
        p.id === playerId ? { ...p, isDisconnected: false } : p
      )
    );

    // Сразу обновляем players для GameHUD
    if (store.players.length > 0) {
      const players = store.players.map(p =>
        p.id === playerId ? { ...p, isDisconnected: false } : p
      );
      useGameStore.setState({ players });
    }
  });

  // ============================================
  // 🔄 ВОССТАНОВЛЕНИЕ ПОСЛЕ ПЕРЕЗАГРУЗКИ
  // ============================================
  socket.on('lobby:reconnect-success', ({ roomId, playerId, players, settings, isHost, gameState, gameStartTime }) => {
    console.log(`✅ [StateSync] Успешное восстановление в комнате ${roomId}`);
    const store = useGameStore.getState();

    store._setRoomInfo(roomId, playerId);
    store._setLobbyPlayers(players);
    store._setRoomSettings(settings);
    store._setHost(isHost);

    // Сохраняем время старта игры
    store.setGameStartTime(gameStartTime ?? null);

    // Применяем настройки сессии
    useGameStore.setState({
      showRegions: settings.showRegions,
      showDeadCells: settings.showDeadCells,
      enabledDeckView: settings.enabledDeckView,
    });

    // Сохраняем снова (для надёжности)
    store._saveConnectionInfo(playerId, roomId);

    // Если игра уже началась — восстанавливаем состояние
    if (gameState) {
      console.log(`🎮 [StateSync] Игра уже началась — восстанавливаем состояние`);
      applyServerState(gameState);
      // Переходим сразу в игровой экран
      // (lobbyScreen остаётся 'networkLobby', но phase='playing' переопределяет рендер)
    } else {
      // В лобби — переключаемся на waiting
      store.setLobbyScreen('networkLobby');
    }

    useGameStore.setState({ isReconnectingToRoom: false });
  });

  socket.on('lobby:reconnect-failed', ({ reason }) => {
    console.warn(`❌ [StateSync] Восстановление не удалось: ${reason}`);
    const store = useGameStore.getState();

    // Очищаем невалидные данные
    clearConnectionInfo();
    store.leaveRoom();
    useGameStore.setState({ isReconnectingToRoom: false });

    store.setReconnectError(`Не удалось восстановить игру: ${reason}`);
  });
}