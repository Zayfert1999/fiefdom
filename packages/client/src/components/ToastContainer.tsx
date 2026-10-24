// packages/client/src/components/ToastContainer.tsx
// 🍞 Контейнер toast-уведомлений. Рендерится один раз в корне App
// (поверх лобби, игры и модалок).
//
// Время жизни toast-а задаёт CSS-анимация полоски прогресса: по её окончанию
// toast плавно закрывается. Благодаря этому «пауза при наведении» работает
// без JS-таймеров (animation-play-state: paused).

import { useEffect, useState } from 'react';
import { useToastStore, type Toast, type ToastType } from '@/state/useToastStore';
import styles from '@/components/styles/toast.module.css';

/** Должна совпадать с длительностью toastOut в toast.module.css */
const EXIT_DURATION_MS = 200;

const ICONS: Record<ToastType, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '⛔',
};

const TYPE_CLASS: Record<ToastType, string> = {
  info: styles.info,
  success: styles.success,
  warning: styles.warning,
  error: styles.error,
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: number) => void;
}

const ToastItem = ({ toast, onDismiss }: ToastItemProps) => {
  const [leaving, setLeaving] = useState(false);

  // После начала анимации выхода убираем toast из store
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, onDismiss, toast.id]);

  return (
    <div
      className={`${styles.toast} ${TYPE_CLASS[toast.type]} ${leaving ? styles.leaving : ''}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      onClick={() => setLeaving(true)}
      title="Нажмите, чтобы закрыть"
    >
      <span className={styles.icon} aria-hidden="true">{ICONS[toast.type]}</span>
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.close}
        aria-label="Закрыть уведомление"
        onClick={(e) => {
          e.stopPropagation();
          setLeaving(true);
        }}
      >
        ✕
      </button>

      {/* Полоска прогресса = таймер жизни. duration 0 → toast не закрывается сам */}
      {toast.duration > 0 && (
        <div
          className={styles.progress}
          style={{ animationDuration: `${toast.duration}ms` }}
          onAnimationEnd={() => setLeaving(true)}
        />
      )}
    </div>
  );
};

export const ToastContainer = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className={styles.container} role="region" aria-label="Уведомления">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
};
