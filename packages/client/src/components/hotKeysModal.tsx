// packages/client/src/components/hotKeysModal.tsx
// ⌨️ Модальное окно с подсказками по горячим клавишам.
// Переиспользует общий стиль модальных окон из game.module.css.

import { useEffect } from 'react';
import {
  HOTKEYS_BY_CATEGORY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatHotkeyKey,
  type HotkeyCategory,
  type HotkeyDefinition,
} from '@carcassonne/shared/core/hotkeys';
import styles from '@/components/modal.module.css';

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotkeysModal = ({ isOpen, onClose }: HotkeysModalProps) => {
  // ============================================
  // ⌨️ Закрытие по Escape
  // ============================================
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ============================================
  // 📋 Рендер одной категории хоткеев
  // ============================================
  const renderCategory = (category: HotkeyCategory, hotkeys: readonly HotkeyDefinition[]) => (
    <div key={category} className={styles.hotkeysSection}>
      <h3 className={styles.hotkeysSectionTitle}>
        {CATEGORY_LABELS[category]}
      </h3>
      <div className={styles.hotkeysList}>
        {hotkeys.map((def) => (
          <div key={`${category}-${def.key}`} className={styles.hotkeyRow}>
            <span className={styles.hotkeyDescription}>{def.description}</span>
            <kbd className={styles.hotkeyKey}>
              {formatHotkeyKey(def)}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    // ============================================
    // 🌑 Оверлей (клик закрывает модалку)
    // ============================================
    <div className={styles.modalOverlay} onClick={onClose}>
      {/* ============================================
          📦 Карточка модального окна
          ============================================ */}
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className={styles.modalHeader}>
          {/* Spacer слева (для симметричного центрирования) */}
          <div style={{ width: '36px' }} />

          <h2 className={styles.modalTitle}>⌨️ Горячие клавиши</h2>

          {/* Кнопка закрытия */}
          <button
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Список категорий */}
        <div className={styles.hotkeysContent}>
          {CATEGORY_ORDER.map(cat =>
            renderCategory(cat, HOTKEYS_BY_CATEGORY[cat])
          )}

          {/* Подсказка внизу */}
          <div className={styles.hotkeysHint}>
            💡 <strong>Совет:</strong>{' '}
            <kbd>Esc</kbd> — закрыть
          </div>
        </div>
      </div>
    </div>
  );
};