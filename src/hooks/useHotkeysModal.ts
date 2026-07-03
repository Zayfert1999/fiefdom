// hooks/useHotkeysModal.ts
import { useState, useCallback } from 'react';

export const useHotkeysModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    toggle: useCallback(() => setIsOpen(v => !v), []),
  };
};