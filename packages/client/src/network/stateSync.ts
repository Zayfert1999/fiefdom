// packages/client/src/network/stateSync.ts
// 🌟 Синхронизация состояния сервер → клиент.

import type { GameSocket } from './socket';
import { useGameStore } from '@/state/useGameStore';
import { RegionManager } from '@carcassonne/shared/core/regionManager';
import type { PlacedTile, FeatureType } from '@carcassonne/shared/core/types';
import type { SerializedGameState } from '@carcassonne/shared/core/serialization';
import { clearConnectionInfo } from '@/network/persistence';

/**
 * Регистрирует все обработчики серверных событий.
 * Вызывается один раз при первом подключении.
 */

// 🌟 Флаг защиты от повторной регистрации
let handlersRegistered = false;

export function registerStateSync(socket: GameSocket): void {
  // 🌟 ЗАЩИТА: если обработчики уже зарегистрированы — не регистрируем повторно
  if (handlersRegistered) {
    console.log(`🔄 [StateSync] Обработчики уже зарегистрированы — пропускаем`);
    // Всё равно проверяем текущее состояние подключения
    if (socket.connected) {
      useGameStore.getState()._setConnected(true);
      useGameStore.getState()._setConnectionError(null);
    }
    return;
  }
  handlersRegistered = true;

  console.log(`🔄 [StateSync] Регистрация обработчиков серверных событий`);

  // 🌟 Race condition fix
  if (socket.connected) {
    console.log(`🔌 [StateSync] Сокет уже подключён — синхронизируем состояние`);
    useGameStore.getState()._setConnected(true);
    useGameStore.getState()._setConnectionError(null);
    useGameStore.getState()._setReconnecting(false);
  }

  // ============================================
  // 🔌 СОБЫТИЯ ПОДКЛЮЧЕНИЯ
  // ============================================

  socket.on('connect', () => {
    useGameStore.getState()._setConnected(true);
    useGameStore.getState()._setConnectionError(null);
  });

  socket.on('disconnect', () => {
    useGameStore.getState()._setConnected(false);
  });

  socket.io.on('reconnect_attempt', () => {
    useGameStore.getState()._setReconnecting(true);
  });

  socket.io.on('reconnect', () => {
    useGameStore.getState()._setReconnecting(false);
  });

  socket.io.on('reconnect_failed', () => {
    useGameStore.getState()._setReconnecting(false);
    useGameStore.getState()._setConnectionError('Не удалось переподключиться к серверу');
  });

  socket.on('connect_error', (error) => {
    useGameStore.getState()._setConnectionError(error.message);
  });

  socket.on('session:active-games', ({ game }) => {
    console.log(`🔍 [StateSync] Активная игра: ${game ? game.roomId : 'нет'}`);
    const store = useGameStore.getState();
    store.setActiveGame(game);
  });

  // ============================================
  // 🏠 СОБЫТИЯ ЛОББИ
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
  });

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
// 🔌 ОТКЛЮЧЕНИЕ/ПЕРЕПОДКЛЮЧЕНИЕ ДРУГИХ ИГРОКОВ
// ============================================

socket.on('lobby:player-disconnected', ({ playerId }) => {
  console.log(`⚠️ [StateSync] Игрок отключился: ${playerId}`);
  const store = useGameStore.getState();
  // 🌟 Помечаем игрока как отключённого в списке лобби
  store._setLobbyPlayers(
    store.networkLobbyPlayers.map(p =>
      p.id === playerId ? { ...p, isDisconnected: true } : p
    )
  );
});

socket.on('lobby:player-reconnected', ({ playerId }) => {
  console.log(`✅ [StateSync] Игрок переподключился: ${playerId}`);
  const store = useGameStore.getState();
  // 🌟 Снимаем флаг отключения
  store._setLobbyPlayers(
    store.networkLobbyPlayers.map(p =>
      p.id === playerId ? { ...p, isDisconnected: false } : p
    )
  );
});

  // ============================================
  // 🏠 СОБЫТИЯ ВОССТАНОВЛЕНИЯ
  // ============================================

  socket.on('lobby:reconnect-success', ({ roomId, playerId, players, settings, isHost, gameState }) => {
    console.log(`✅ [StateSync] Успешное восстановление в комнате ${roomId}`);
    const store = useGameStore.getState();

    store._setRoomInfo(roomId, playerId);
    store._setLobbyPlayers(players);
    store._setRoomSettings(settings);
    store._setHost(isHost);

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

    // Можно показать toast/alert пользователю
    alert(`Не удалось восстановить игру: ${reason}`);
  });

  // ============================================
  // 🎮 СОБЫТИЯ ИГРЫ
  // ============================================

  socket.on('game:started', ({ gameState, seed, yourPlayerId }) => {
    console.log(`🎮 [StateSync] Игра началась! seed=${seed}, myId=${yourPlayerId}`);
    applyServerState(gameState);
  });

  socket.on('game:state-update', ({ gameState }) => {
    console.log(`🔄 [StateSync] Получено обновление состояния`);
    applyServerState(gameState);
  });

  socket.on('game:your-turn', ({ drawnTile }) => {
    console.log(`🎴 [StateSync] Мой ход! Тайл: ${drawnTile.id}`);
    useGameStore.setState({
      drawnTile,
      phase: 'placeTile',
    });
  });

  // 🌟 Ход принят сервером
  socket.on('game:move-committed', ({ playerId }) => {
    console.log(`🎴 [StateSync] Ход принят сервером: игрок ${playerId}`);
    // Состояние придёт через game:state-update
  });

  // 🌟 Завершённый регион — запускаем анимацию
  socket.on('game:regions-completed', ({ regions }) => {
    console.log(`🏆 [StateSync] Завершено регионов: ${regions.length}`);

    // 🌟 КЛЮЧЕВОЕ: используем processCompletedRegionsInStore
    // Она одновременно:
    // 1. Запускает анимации (с правильной задержкой между ними)
    // 2. Начисляет очки локально
    // 3. Возвращает миплов локально
    // 4. Помечает регионы как isComplete
    useGameStore.getState().processCompletedRegionsInStore(
      regions.map(r => ({
        rootKey: r.rootKey,
        type: r.type as any,
        points: r.points,
        winners: r.winners,
        allMeepleOwners: r.allMeepleOwners,
        featureKeys: r.featureKeys,
      }))
    );
  });

  // 🌟 Передача хода
  socket.on('game:next-turn', ({ nextPlayerId }) => {
    console.log(`🔄 [StateSync] Ход передан игроку ${nextPlayerId}`);
    // Состояние придёт через game:state-update
  });

  socket.on('game:timer-update', ({ remainingSeconds }) => {
    if (remainingSeconds <= 5) {
      console.log(`⏰ [StateSync] Осталось ${remainingSeconds} сек`);
    }
  });

  socket.on('game:final-scoring', ({ regions }) => {
    console.log(`🏆 [StateSync] Финальный подсчёт: ${regions.length} регионов`);
    useGameStore.getState().processCompletedRegionsInStore(
      regions.map(r => ({
        ...r,
        type: r.type as FeatureType,
      }))
    );
  });

  socket.on('game:over', ({ finalScores }) => {
    console.log(`🏁 [StateSync] Игра окончена!`);
    useGameStore.setState({
      phase: 'gameOver',
      players: finalScores,
    });
  });

  // ============================================
  // ⚠️ ОШИБКИ
  // ============================================

  socket.on('error', ({ code, message }) => {
    console.error(`🚫 [StateSync] Ошибка сервера: [${code}] ${message}`);
  });
}

// 🌟 Функция сброса флага (для полного отключения)
export function unregisterStateSync(): void {
  handlersRegistered = false;
  console.log(`🔄 [StateSync] Флаг регистрации сброшен`);
}

// ============================================
// 🌟 ПРИМЕНЕНИЕ СОСТОЯНИЯ СЕРВЕРА К STORE
// ============================================

function applyServerState(gameState: SerializedGameState): void {
  console.log(`📥 [StateSync] Применение состояния сервера к store`);

  const board = new Map<string, PlacedTile>(
    Object.entries(gameState.board)
  );

  const regionManager = RegionManager.deserialize(gameState.regionManager);

  const lastPlacedTiles = new Map<string, { x: number; y: number; color: string }>(
    Object.entries(gameState.lastPlacedTiles)
  );

  const currentState = useGameStore.getState();
  const hasActiveAnimations = currentState.completionAnimations.length > 0;

  if (hasActiveAnimations) {
    console.log(`📥 [StateSync] Есть активные анимации — сохраняем isCompleting миплы`);
    for (const [key, currentTile] of currentState.board) {
      if (currentTile.meeple?.isCompleting) {
        const serverTile = board.get(key);
        if (serverTile) {
          // Переносим мипла с isCompleting на серверный тайл
          board.set(key, {
            ...serverTile,
            meeple: currentTile.meeple,
          });
        }
      }
    }
  }

  useGameStore.setState({
    board,
    regionManager,
    players: gameState.players,
    currentTurn: gameState.currentTurn,
    phase: gameState.phase as any,
    drawnTile: gameState.drawnTile,
    totalTiles: gameState.totalTiles,
    lastPlacedTiles,
    // Сбрасываем клиентское preview-состояние
    previewTile: null,
    previewRegionManager: null,
    moveSnapshot: null,
  });

  console.log(
    `📥 [StateSync] Состояние применено: ` +
    `board=${board.size} тайлов, ` +
    `players=${gameState.players.length}, ` +
    `phase=${gameState.phase}, ` +
    `drawnTile=${gameState.drawnTile?.id ?? 'null'}`
  );
}