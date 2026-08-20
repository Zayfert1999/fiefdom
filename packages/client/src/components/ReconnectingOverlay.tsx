import { useGameStore } from '@/state/useGameStore';
import styles from '@/components/styles/modal.module.css';

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
    <div className={styles.reconnectOverlay}>
      <div className={styles.reconnectCard}>
        {/* Спиннер загрузки */}
        <div className={styles.reconnectSpinner} />

        {/* Заголовок */}
        <h2 className={styles.reconnectTitle}>{title}</h2>

        {/* Подзаголовок */}
        <p className={styles.reconnectSubtitle}>{subtitle}</p>
      </div>
    </div>
  );
};