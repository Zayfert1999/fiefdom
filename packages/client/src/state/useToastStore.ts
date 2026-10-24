// packages/client/src/state/useToastStore.ts
// 🌟 Хранилище toast-уведомлений.
// Отдельный store (а не слайс useGameStore): уведомления — UI-слой, не связанный
// с игровым состоянием, а вызывать их нужно и из React, и из сетевых обработчиков.
//
// Использование вне React:   toast.success('Готово');
// Использование в React:     const toasts = useToastStore(s => s.toasts);

import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  /** Время показа, мс. 0 — не закрывается сам (только крестиком) */
  duration: number;
}

export interface ToastOptions {
  /** Время показа, мс (0 — «залипающий» toast). По умолчанию зависит от типа */
  duration?: number;
  /**
   * Ключ дедупликации: новый toast с тем же ключом ЗАМЕНЯЕТ старый
   * (и перезапускает таймер). Для статусов вроде «связь потеряна / восстановлена»
   * и повторяющихся событий («Осталось 10 сек»).
   */
  dedupeKey?: string;
}

/** Максимум одновременно видимых toast-ов (старые вытесняются) */
const MAX_VISIBLE = 4;

const DEFAULT_DURATION: Record<ToastType, number> = {
  info: 3500,
  success: 3500,
  warning: 5000,
  error: 6000,
};

interface InternalToast extends Toast {
  dedupeKey?: string;
}

interface ToastState {
  toasts: InternalToast[];
  push: (type: ToastType, message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: (type, message, options) => {
    const id = nextId++;
    const toast: InternalToast = {
      id,
      type,
      message,
      duration: options?.duration ?? DEFAULT_DURATION[type],
      dedupeKey: options?.dedupeKey,
    };

    set((state) => {
      // Дедупликация: убираем прежний toast с тем же ключом
      const rest = toast.dedupeKey
        ? state.toasts.filter((t) => t.dedupeKey !== toast.dedupeKey)
        : state.toasts;
      // Ограничение по количеству: вытесняем самые старые
      return { toasts: [...rest, toast].slice(-MAX_VISIBLE) };
    });

    return id;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

// ============================================
// 🍞 Фасад для вызова из любого места (в том числе вне React)
// ============================================
export const toast = {
  info: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('info', message, options),
  success: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('success', message, options),
  warning: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('warning', message, options),
  error: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('error', message, options),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};
