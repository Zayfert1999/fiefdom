// hooks/useHotkeys.ts
import { useEffect } from 'react';

interface HotkeyConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  enabled?: boolean;
}

/**
 * 🌟 Хук для регистрации горячих клавиш
 * Автоматически игнорирует события, когда фокус в input/textarea
 */
export const useHotkeys = (hotkeys: HotkeyConfig[]) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 🌟 Игнорируем, если фокус в поле ввода
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // 🌟 Проверяем модификаторы
      const ctrlPressed = e.ctrlKey || e.metaKey;
      const shiftPressed = e.shiftKey;
      const altPressed = e.altKey;

      for (const hotkey of hotkeys) {
        // Пропускаем отключённые хоткеи
        if (hotkey.enabled === false) continue;

        const keyMatch = e.key.toLowerCase() === hotkey.key.toLowerCase();
        const ctrlMatch = (hotkey.ctrl ?? false) === ctrlPressed;
        const shiftMatch = (hotkey.shift ?? false) === shiftPressed;
        const altMatch = (hotkey.alt ?? false) === altPressed;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault(); // Предотвращаем дефолтное поведение
          hotkey.action();
          console.log(`⌨️ [Hotkey] ${hotkey.key.toUpperCase()} → ${hotkey.description}`);
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkeys]);
};