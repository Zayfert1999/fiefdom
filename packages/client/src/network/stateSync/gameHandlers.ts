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
import { netLog } from '@/network/netLog';

/**
 * 🌟 Мы сейчас в сетевой комнате?
 * После выхода (roomId === null) в пути могут оставаться игровые события —
 * без этой проверки state-update «выдёргивал» бы игрока из меню обратно на поле.
 */
const inRoom = (): boolean => useGameStore.getState().roomId !== null;

/** Пороги предупреждений «на часах осталось…» (секунды, по убыванию) */
const CLOCK_WARNING_THRESHOLDS_SEC = [60, 30, 10];

/** Мой банк при прошлом timer-update (для обнаружения пересечения порога) */
let lastWarnedBankMs: number | null = null;

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
 * - game:turn-skipped — ход пропущен сервером (таймер / игрок отключён)
 * - game:player-abandoned — игрок выбыл из игры (вышел / 3 пропуска подряд)
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
    netLog(`🎮 [StateSync] Игра началась! myId=${snapshot.yourPlayerId}`);

    const store = useGameStore.getState();

    // 1. Мета-данные комнаты
    store._setRoomInfo(snapshot.roomId, snapshot.yourPlayerId);
    store._setRoomSettings(snapshot.settings);
    store._setHost(snapshot.hostId === snapshot.yourPlayerId);

    // 2. Время старта игры
    store.setGameStartTime(snapshot.gameStartTime);

    // 3. Сохраняем подключение
    store._saveConnectionInfo(snapshot.yourPlayerId, snapshot.roomId, snapshot.yourSessionToken);

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
    netLog(`🔄 [StateSync] Получено обновление состояния`);

    applyServerState(gameState, { animate: true });
  });

  // ============================================
  // 🎴 ВАШ ХОД
  // ============================================
  socket.on('game:your-turn', ({ drawnTile }) => {
    if (!inRoom()) return;
    netLog(`🎴 [StateSync] Мой ход! Тайл: ${drawnTile.id}`);

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
    netLog(`🎴 [StateSync] Ход принят сервером: игрок ${playerId}`);
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
    netLog(`🏆 [StateSync] Завершено регионов: ${regions.length}`);

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
  // ⏰ ХОД ПРОПУЩЕН СЕРВЕРОМ
  // ============================================
  socket.on('game:turn-skipped', ({ playerId, reason, missedTurns, maxMissedTurns }) => {
    if (!inRoom()) return;

    // Тайл из руки выброшен; missedTurns — сколько ходов подряд пропущено (maxMissedTurns → выбывает)
    const counter = `(${missedTurns}/${maxMissedTurns})`;
    const me = isMe(playerId);
    const name = getDisplayName(playerId);

    if (reason === 'absent') {
      // Своё отключение игрок и так видит (связь потеряна) — сообщаем только остальным
      if (!me) toast.warning(`📴 ${name} не в сети — ход пропущен ${counter}`);
    } else if (reason === 'afk') {
      toast.warning(
        me ? `💤 Вы бездействовали — ход пропущен ${counter}` : `💤 ${name} бездействует — ход пропущен ${counter}`,
        { dedupeKey: me ? 'turn-timer' : undefined }
      );
    }
  });

  // Предупреждение лично мне: бездействую, ход скоро пропустят
  socket.on('game:afk-warning', ({ secondsLeft }) => {
    if (!inRoom()) return;
    toast.warning(`💤 Вы на месте? Ход пропустят через ${secondsLeft} с — пошевелите мышью`, {
      dedupeKey: 'afk-warning',
      duration: 5000,
    });
  });

  // ============================================
  // 🚪 ИГРОК ВЫБЫЛ ИЗ ИГРЫ
  // ============================================
  socket.on('game:player-abandoned', ({ playerId, reason }) => {
    if (!inRoom()) return;

    // ⏰ У игрока закончился банк на часах: ходить он больше не может, но наблюдает за партией
    if (reason === 'timeout') {
      useGameStore.getState().markPlayerTimedOut(playerId);
      if (isMe(playerId)) {
        toast.warning('⏰ Время на часах вышло — дальше вы наблюдаете за игрой', {
          dedupeKey: 'abandoned-self',
          duration: 10000,
        });
      } else {
        toast.warning(`⏰ У ${getDisplayName(playerId)} вышло время — он наблюдает за игрой`, { duration: 7000 });
      }
      return;
    }

    if (isMe(playerId)) {
      // Выбыли, оставаясь на связи (например, 3 пропуска по бездействию): партию можно досматривать
      if (reason === 'missed-turns') {
        toast.error('🚫 Вы выбыли из игры: 3 хода подряд пропущено. Можно досмотреть партию.', {
          dedupeKey: 'abandoned-self',
          duration: 10000,
        });
      }
      return;
    }

    const name = getDisplayName(playerId);
    toast.warning(
      reason === 'left'
        ? `🚪 ${name} покинул игру`
        : `🚫 ${name} пропустил слишком много ходов и выбыл из игры`,
      { duration: 6000 }
    );
  });

  // ============================================
  // ⏱️ ОБНОВЛЕНИЕ ТАЙМЕРА
  // ============================================
  socket.on('game:timer-update', ({ banksMs, activePlayerId }) => {
    if (!inRoom()) return;
    const store = useGameStore.getState();

    // Снимок часов для GameHUD. Остаток у активного игрока интерфейс досчитывает сам
    // от receivedAt — часы клиента и сервера синхронизировать не нужно.
    store.setClockSnapshot({ banksMs, activePlayerId, receivedAt: Date.now() });

    // Предупреждения «на часах осталось…» — только мне и только в мой ход
    if (activePlayerId === null || !isMe(activePlayerId)) {
      lastWarnedBankMs = null;
      return;
    }
    const bank = banksMs[activePlayerId] ?? 0;
    const prev = lastWarnedBankMs;
    lastWarnedBankMs = bank;
    if (prev === null) return;

    for (const thresholdSec of CLOCK_WARNING_THRESHOLDS_SEC) {
      const t = thresholdSec * 1000;
      if (prev > t && bank <= t) {
        toast.warning(
          thresholdSec >= 60
            ? `⏱️ На часах осталась ${thresholdSec / 60} мин`
            : `⏱️ На часах осталось ${thresholdSec} сек`,
          { dedupeKey: 'clock-warning', duration: 3000 }
        );
        break;
      }
    }
  });

  // ============================================
  // 🏁 ФИНАЛЬНЫЙ ПОДСЧЁТ И КОНЕЦ ИГРЫ
  // ============================================
  socket.on('game:final-scoring', ({ regions }) => {
    if (!inRoom()) return;
    netLog(`🏆 [StateSync] Финальный подсчёт: ${regions.length} регионов`);

    useGameStore.getState().processCompletedRegionsInStore(
      regions.map(r => ({
        ...r,
        type: r.type as FeatureType,
      }))
    );

    toast.info('🏁 Колода закончилась — финальный подсчёт очков');
  });

  socket.on('game:over', ({ finalScores, reason }) => {
    if (!inRoom()) return;
    netLog(`🏁 [StateSync] Игра окончена!`);
    useGameStore.setState({
      phase: 'gameOver',
      players: finalScores,
    });
    // Фиксируем время окончания игры
    useGameStore.getState().setGameEndTime(Date.now());

    if (reason === 'forfeit') {
      toast.warning('🏳️ Остальные игроки покинули игру — партия завершена', { duration: 8000 });
    } else if (reason === 'abandoned') {
      toast.warning('🏳️ Игра завершена досрочно: игроки перестали ходить', { duration: 8000 });
    } else {
      toast.success('🏁 Игра окончена!');
    }
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
