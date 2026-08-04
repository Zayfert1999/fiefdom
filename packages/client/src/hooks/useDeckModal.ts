// hooks/useDeckModal.ts
import { useState, useCallback } from 'react';

/**
 * 📦 Хук для управления модальным окном просмотра колоды.
 * Аналогичен useHotkeysModal — независимое состояние.
 */
export const useDeckModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    toggle: useCallback(() => setIsOpen(v => !v), []),
  };
};