// packages/client/src/components/lobby/RoomBrowser.tsx
// 🔎 Браузер комнат: список публичных комнат с live-обновлением.
//
// Пока компонент смонтирован, клиент подписан на lobby:room-list:
// сервер присылает список сразу и затем при каждом изменении
// (создание/удаление комнаты, вход/выход игроков, старт игры).

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/state/useGameStore';
import type { RoomInfo } from '@fiefdom/shared/protocol/events';
import { formatTimeControl } from '@fiefdom/shared/core/fischerClock';

import lobbyStyles from '@/components/styles/lobby.module.css';
import styles from '@/components/styles/roomBrowser.module.css';

/** Защита от двойного клика: столько кнопки «Войти» остаются заблокированными */
const JOIN_COOLDOWN_MS = 2000;

interface RoomBrowserProps {
  onBack: () => void;
}

type RoomStatus = 'open' | 'full' | 'playing';

const getStatus = (room: RoomInfo): RoomStatus => {
  if (room.isPlaying) return 'playing';
  if (room.playerCount >= room.maxPlayers) return 'full';
  return 'open';
};

const STATUS_LABEL: Record<RoomStatus, string> = {
  open: 'Набор игроков',
  full: 'Заполнена',
  playing: 'Идёт игра',
};


export const RoomBrowser = ({ onBack }: RoomBrowserProps) => {
  const roomList = useGameStore(s => s.roomList);
  const profileName = useGameStore(s => s.playerName);
  const profileColor = useGameStore(s => s.playerColor);

  const startRoomBrowsing = useGameStore(s => s.startRoomBrowsing);
  const stopRoomBrowsing = useGameStore(s => s.stopRoomBrowsing);
  const refreshRoomList = useGameStore(s => s.refreshRoomList);
  const joinRoom = useGameStore(s => s.joinRoom);

  const [joiningId, setJoiningId] = useState<string | null>(null);
  const cooldownTimer = useRef<number | null>(null);

  // 🌟 Подписка на время жизни экрана (StrictMode: subscribe → unsubscribe → subscribe — корректно)
  useEffect(() => {
    startRoomBrowsing();
    return () => stopRoomBrowsing();
  }, [startRoomBrowsing, stopRoomBrowsing]);

  // Таймер блокировки кнопки не должен пережить компонент
  useEffect(() => {
    return () => {
      if (cooldownTimer.current !== null) window.clearTimeout(cooldownTimer.current);
    };
  }, []);

  const canJoin = profileName.trim().length > 0;

  const handleJoin = (room: RoomInfo) => {
    if (joiningId || !canJoin) return;

    setJoiningId(room.id);
    joinRoom(room.id, profileName.trim(), profileColor);

    // При успехе экран сменится на «ожидание» (компонент размонтируется).
    // При отказе сервера придёт toast с причиной — кнопка разблокируется.
    cooldownTimer.current = window.setTimeout(() => setJoiningId(null), JOIN_COOLDOWN_MS);
  };

  return (
    <div className={lobbyStyles.overlay}>
      <div className={lobbyStyles.card}>
        <h2 className={lobbyStyles.title}>🔎 Список комнат</h2>

        <div className={styles.toolbar}>
          <span className={styles.counter}>
            {roomList === null ? 'Загрузка…' : `Публичных комнат: ${roomList.length}`}
          </span>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={refreshRoomList}
            title="Обновить список"
          >
            ⟳ Обновить
          </button>
        </div>

        {roomList === null && (
          <div className={styles.placeholder}>⏳ Загружаем список комнат…</div>
        )}

        {roomList !== null && roomList.length === 0 && (
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>🏰</div>
            Публичных комнат пока нет.
            <br />
            Создайте свою — она появится здесь, если не отмечена как приватная.
          </div>
        )}

        {roomList !== null && roomList.length > 0 && (
          <ul className={styles.list}>
            {roomList.map(room => {
              const status = getStatus(room);
              const joinable = status === 'open';
              const isJoining = joiningId === room.id;

              return (
                <li key={room.id} className={`${styles.row} ${joinable ? '' : styles.rowDisabled}`}>
                  <div className={styles.info}>
                    <div className={styles.host}>👑 {room.hostName}</div>
                    <div className={styles.meta}>
                      <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                      <span>⏱️ {formatTimeControl(room.timeControl)}</span>
                      <span className={styles.code}>#{room.id}</span>
                    </div>
                  </div>

                  <div className={styles.slots} title="Игроков в комнате">
                    👥 {room.playerCount}/{room.maxPlayers}
                  </div>

                  <button
                    type="button"
                    className={styles.joinButton}
                    disabled={!joinable || !canJoin || joiningId !== null}
                    onClick={() => handleJoin(room)}
                  >
                    {isJoining ? '⏳' : joinable ? 'Войти' : '—'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button onClick={onBack} className={lobbyStyles.buttonSecondary}>
          ← Назад
        </button>
      </div>
    </div>
  );
};
