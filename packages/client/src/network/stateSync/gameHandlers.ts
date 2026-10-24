// packages/client/src/network/stateSync/gameHandlers.ts
// 🌟 Обработчики событий игры.
// started / state-update / your-turn / move-committed / regions / timer / over / error

import type { GameSocket } from '@/network/socket';
import { useGameStore } from '@/state/useGameStore';
import { toast } from '@/state/useToastStore';
import type { FeatureType } from '@fiefdom/shared/core/types';
import { getErrorMessage } from '@fiefdom/shared/protocol/errors';
import { applyServerState } from './applyServerState';
import { FEATURE_LABELS, getDisplayName, isMe } from './helpers';

/**
 * 🌟 Мы сейчас в сетевой комнате?
 * После выхода (roomId === null) в пути могут оставаться игровые события —
 * без этой проверки state-update «выдёргивал» бы игрока из меню обратно на поле.
 */
const inRoom = (): boolean => useGameStore.getState().roomId !== null;

/** Сейчас мой ход? */
const isMyTurn = (): boolean => {
  const s = useGameStore.getState();
  return s.playerId !== null && s.players[s.currentTurn]?.id === s.playerId;
};

/** Toast-ы по завершённым регионам: «🏰 Город завершён · Аня +8» */
function toastCompletedRegions(
  regions: Array<{ type: string; points: number; winners: string[] }>
): void {
  for (const region of regions) {
    // Регион без победителей (нет миплов) очков не принёс — сообщать нечего
    if (region.winners.length === 0) continue;

    const label = FEATURE_LABELS[region.type] ?? { icon: '🏁', title: 'Регион' };
    const winners = region.winners.map(getDisplayName).join(', ');
    toast.success(`${label.icon} ${label.title} завершён · ${winners} +${region.points}`, {
      duration: 4500,
    });
  }
}

/**
 * 🌟 Регистрирует обработчики событий игры.
 *
 * Сюда входят:
 * - game:started — начало игры
 * - game:state-update — обновление состояния
 * - game:your-turn — ваш ход
 * - game:move-committed — ход принят сервером
 * - game:regions-completed — завершённые регионы
 * - game:next-turn — передача хода (сервер пока не шлёт)
 * - game:turn-skipped — ход пропущен по таймеру
 * - game:timer-update — обновление таймера
 * - game:final-scoring — финальный подсчёт
 * - game:over — конец игры
 * - error — ошибки сервера
 *
 * @param socket Типизированный socket
 */
export function registerGameHandlers(socket: GameSocket): void {
  // ============================================
  // 🎮 НАЧАЛО ИГРЫ
  // ============================================
  socket.on('game:started', ({ snapshot }) => {
    console.log(`🎮 [StateSync] Игра началась! myId=${snapshot.yourPlayerId}`);

    const store = useGameStore.getState();

    // 1. Мета-данные комнаты
    store._setRoomInfo(snapshot.roomId, snapshot.yourPlayerId);
    store._setRoomSettings(snapshot.settings);
    store._setHost(snapshot.hostId === snapshot.yourPlayerId);

    // 2. Время старта игры
    store.setGameStartTime(snapshot.gameStartTime);

    // 3. Сохраняем подключение
    store._saveConnectionInfo(snapshot.yourPlayerId, snapshot.roomId);

    // 4. Сетевой статус игроков → networkLobbyPlayers
    store._setLobbyPlayers(
      snapshot.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isReady: p.network.isReady,
        isHost: p.network.isHost,
        isDisconnected: p.network.isDisconnected,
      }))
    );

    // 5. Игровое состояние
    if (snapshot.gameState) {
      applyServerState(snapshot.gameState);
    }

    toast.success('🎮 Игра началась!');
  });

  // ============================================
  // 🔄 ОБНОВЛЕНИЕ СОСТОЯНИЯ
  // ============================================
  socket.on('game:state-update', ({ gameState }) => {
    if (!inRoom()) return;
    console.log(`🔄 [StateSync] Получено обновление состояния`);

    // Сбрасываем таймер
    useGameStore.getState().setTurnTimerRemaining(null);
    useGameStore.getState().setTurnDeadline(null);

    applyServerState(gameState, { animate: true });
  });

  // ============================================
  // 🎴 ВАШ ХОД
  // ============================================
  socket.on('game:your-turn', ({ drawnTile }) => {
    if (!inRoom()) return;
    console.log(`🎴 [StateSync] Мой ход! Тайл: ${drawnTile.id}`);

    // Сбрасываем таймер при начале хода
    useGameStore.getState().setTurnTimerRemaining(null);
    useGameStore.getState().setTurnDeadline(null);

    useGameStore.setState({
      drawnTile,
      phase: 'placeTile',
    });

    toast.info('🎴 Ваш ход', { dedupeKey: 'your-turn', duration: 2500 });
  });

  // ============================================
  // ✅ ХОД ПРИНЯТ СЕРВЕРОМ
  // ============================================
  socket.on('game:move-committed', ({ playerId, meeple }) => {
    if (!inRoom()) return;
    console.log(`🎴 [StateSync] Ход принят сервером: игрок ${playerId}`);
    // Состояние придёт через game:state-update.
    // О своём ходе сообщать не нужно — только о ходах соперников.
    if (isMe(playerId)) return;

    toast.info(
      `${getDisplayName(playerId)} поставил тайл${meeple ? ' и мипла' : ''}`,
      { duration: 2500 }
    );
  });

  // ============================================
  // 🏆 ЗАВЕРШЁННЫЕ РЕГИОНЫ
  // ============================================
  socket.on('game:regions-completed', ({ regions }) => {
    if (!inRoom()) return;
    console.log(`🏆 [StateSync] Завершено регионов: ${regions.length}`);

    // КЛЮЧЕВОЕ: используем processCompletedRegionsInStore
    // Она одновременно:
    // 1. Запускает анимации (с правильной задержкой между ними)
    // 2. Начисляет очки локально
    // 3. Возвращает миплов локально
    // 4. Помечает регионы как isComplete
    useGameStore.getState().processCompletedRegionsInStore(
      regions.map(r => ({
        rootKey: r.rootKey,
        type: r.type as FeatureType,
        points: r.points,
        winners: r.winners,
        allMeepleOwners: r.allMeepleOwners,
        featureKeys: r.featureKeys,
      }))
    );

    toastCompletedRegions(regions);
  });

  // ============================================
  // 🔁 ПЕРЕДАЧА ХОДА
  // ============================================
  socket.on('game:next-turn', ({ nextPlayerId }) => {
    if (!inRoom()) return;
    // Сбрасываем таймер при смене хода
    useGameStore.getState().setTurnTimerRemaining(null);
    useGameStore.getState().setTurnDeadline(null);

    console.log(`🔄 [StateSync] Ход передан игроку ${nextPlayerId}`);
    // Состояние придёт через game:state-update
  });

  // ============================================
  // ⏰ ХОД ПРОПУЩЕН ПО ТАЙМЕРУ
  // ============================================
  socket.on('game:turn-skipped', ({ playerId }) => {
    if (!inRoom()) return;
    if (isMe(playerId)) {
      toast.warning('⏰ Время вышло — ваш ход пропущен', { dedupeKey: 'turn-timer' });
    } else {
      toast.warning(`⏰ ${getDisplayName(playerId)} не успел — ход пропущен`);
    }
  });

  // ============================================
  // ⏱️ ОБНОВЛЕНИЕ ТАЙМЕРА
  // ============================================
  socket.on('game:timer-update', ({ remainingSeconds, deadline }) => {
    if (!inRoom()) return;
    const store = useGameStore.getState();

    // Сохраняем в store для GameHUD
    store.setTurnTimerRemaining(remainingSeconds);
    if (deadline !== undefined) {
      store.setTurnDeadline(deadline);
    }

    // Предупреждаем только того, чей сейчас ход, и только если таймер «длинный»
    // (иначе предупреждение появилось бы сразу в начале хода)
    const total = store.roomSettings?.turnTimerSeconds ?? 0;
    if (total > 10 && isMyTurn() && (remainingSeconds === 10 || remainingSeconds === 5)) {
      toast.warning(`⏱️ Осталось ${remainingSeconds} сек`, {
        dedupeKey: 'turn-timer',
        duration: 2500,
      });
    }
  });

  // ============================================
  // 🏁 ФИНАЛЬНЫЙ ПОДСЧЁТ И КОНЕЦ ИГРЫ
  // ============================================
  socket.on('game:final-scoring', ({ regions }) => {
    if (!inRoom()) return;
    console.log(`🏆 [StateSync] Финальный подсчёт: ${regions.length} регионов`);

    useGameStore.getState().processCompletedRegionsInStore(
      regions.map(r => ({
        ...r,
        type: r.type as FeatureType,
      }))
    );

    toast.info('🏁 Колода закончилась — финальный подсчёт очков');
  });

  socket.on('game:over', ({ finalScores }) => {
    if (!inRoom()) return;
    console.log(`🏁 [StateSync] Игра окончена!`);
    useGameStore.setState({
      phase: 'gameOver',
      players: finalScores,
    });
    // Фиксируем время окончания игры
    useGameStore.getState().setGameEndTime(Date.now());

    toast.success('🏁 Игра окончена!');
  });

  // ============================================
  // ⚠️ ОШИБКИ СЕРВЕРА
  // Раньше только писались в console — пользователь не видел, почему
  // «ничего не происходит» (например, ход отклонён).
  // ============================================
  socket.on('error', ({ code, message }) => {
    console.error(`🚫 [StateSync] Ошибка сервера: [${code}] ${message}`);
    toast.error(message || getErrorMessage(code), { dedupeKey: `error:${code}` });
  });
}
