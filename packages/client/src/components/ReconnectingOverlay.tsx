// packages/client/src/components/ReconnectingOverlay.tsx
// 🔄 Оверлей, показываемый во время попытки восстановления.
// Используется в двух случаях:
// 1. Кнопка "Продолжить игру" в MainMenu (isReconnectingToRoom)
// 2. Обрыв связи во время активной игры (isReconnecting + roomId)
// Стиль соответствует лобби (lobby.module.css).

import { useGameStore } from '@/state/useGameStore';
import styles from '@/components/styles/lobby.module.css';

export const ReconnectingOverlay = () => {
  // ============================================
  // 🎯 Селекторы
  // ============================================
  const isReconnectingToRoom = useGameStore(s => s.isReconnectingToRoom);
  const isReconnecting = useGameStore(s => s.isReconnecting);
  const roomId = useGameStore(s => s.roomId);
  const connectionError = useGameStore(s => s.connectionError);

  // ============================================
  // 👁️ Видимость оверлея
  // Показываем в двух случаях:
  // 1. Попытка восстановить комнату после кнопки "Продолжить"
  // 2. Socket.IO переподключается И у нас есть активная комната
  // ============================================
  const shouldShow = isReconnectingToRoom || (isReconnecting && roomId !== null);
  if (!shouldShow) return null;

  // ============================================
  // 📝 Текст в зависимости от ситуации
  // ============================================
  const isRecoveringRoom = isReconnectingToRoom;
  const title = isRecoveringRoom ? 'Восстановление игры...' : 'Восстановление связи...';
  const subtitle = roomId
    ? `Комната: ${roomId}`
    : connectionError
      ? connectionError
      : 'Подключение к серверу';

  return (
    // 🌟 Используем общие стили лобби: .overlay и .card
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.reconnectContent}>
          {/* Спиннер загрузки */}
          <div className={styles.reconnectSpinner} />

          {/* Заголовок */}
          <h2 className={styles.reconnectTitle}>{title}</h2>

          {/* Подзаголовок */}
          <p className={styles.reconnectSubtitle}>{subtitle}</p>
        </div>
      </div>
    </div>
  );
};