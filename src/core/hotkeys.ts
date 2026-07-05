// core/hotkeys.ts

export type HotkeyCategory = 'game' | 'camera' | 'system';

/**
 * 🌟 Базовое определение хоткея (без action и enabled)
 * Action и enabled добавляются в компоненте, где есть нужный контекст
 */
export interface HotkeyDefinition {
  key: string;
  description: string;
  category: HotkeyCategory;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

// ============================================
// 📖 ОПРЕДЕЛЕНИЯ — ЕДИНСТВЕННЫЙ ИСТОЧНИК ИСТИНЫ
// Меняешь key/description только здесь
// ============================================
export const HOTKEY_DEFINITIONS = {
  // 🎮 Игровые
  ROTATE_TILE: {
    key: 'R',
    description: 'Повернуть тайл',
    category: 'game',
  },
  CONFIRM: {
    key: 'Enter',
    description: 'Подтвердить действие',
    category: 'game',
  },
  CONFIRM_ALT: {
    key: ' ',  // Space
    description: 'Подтвердить действие',
    category: 'game',
  },
  CANCEL: {
    key: 'Z',
    description: 'Отменить / Откатить ход',
    category: 'game',
  },

  // 📷 Камера
  ZOOM_IN: {
    key: '+',
    description: 'Приблизить камеру',
    category: 'camera',
  },
  ZOOM_IN_ALT: {
    key: '=',
    description: 'Приблизить камеру',
    category: 'camera',
  },
  ZOOM_OUT: {
    key: '-',
    description: 'Отдалить камеру',
    category: 'camera',
  },
  RESET_CAMERA: {
    key: '0',
    description: 'Сбросить камеру и центрировать',
    category: 'camera',
  },
  PAN_UP: {
    key: 'ArrowUp',
    description: 'Камера вверх',
    category: 'camera',
  },
  PAN_DOWN: {
    key: 'ArrowDown',
    description: 'Камера вниз',
    category: 'camera',
  },
  PAN_LEFT: {
    key: 'ArrowLeft',
    description: 'Камера влево',
    category: 'camera',
  },
  PAN_RIGHT: {
    key: 'ArrowRight',
    description: 'Камера вправо',
    category: 'camera',
  },

  // ⚙️ Системные
  SHOW_HOTKEYS: {
    key: 'F1',
    description: 'Показать подсказку по хоткеям',
    category: 'system',
  },
    SHOW_DECK: {
    key: 'D',
    description: 'Показать/скрыть содержимое колоды',
    category: 'system',
  },
} as const satisfies Record<string, HotkeyDefinition>;

// ============================================
// 🌟 ПОРЯДОК КАТЕГОРИЙ (для UI)
// ============================================
export const CATEGORY_ORDER: HotkeyCategory[] = ['game', 'camera', 'system'];

export const CATEGORY_LABELS: Record<HotkeyCategory, string> = {
  game:   '🎮 Игровые действия',
  camera: '📷 Управление камерой',
  system: '⚙️ Системные',
};

// ============================================
// 🌟 АВТОГЕНЕРАЦИЯ ГРУППИРОВКИ ПО КАТЕГОРИЯМ
// ============================================
/**
 * Автоматически группирует хоткеи по полю `category`.
 * Порядок хоткеев внутри категории = порядок объявления в HOTKEY_DEFINITIONS.
 * Порядок категорий = CATEGORY_ORDER.
 * 
 * При добавлении нового хоткея — правка ТОЛЬКО в HOTKEY_DEFINITIONS.
 */
export const HOTKEYS_BY_CATEGORY = CATEGORY_ORDER.reduce(
  (acc, category) => {
    acc[category] = Object.values(HOTKEY_DEFINITIONS).filter(
      (def) => def.category === category
    );
    return acc;
  },
  {} as Record<HotkeyCategory, HotkeyDefinition[]>
);

// ============================================
// 🔤 Форматирование ключа для отображения в UI
// ============================================
const KEY_DISPLAY_MAP: Record<string, string> = {
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  ' ': 'Пробел',
  'Enter': '↵',
};

export const formatHotkeyKey = (def: HotkeyDefinition): string => {
  const parts: string[] = [];
  if (def.ctrl) parts.push('Ctrl');
  if (def.shift) parts.push('Shift');
  if (def.alt) parts.push('Alt');
  parts.push(KEY_DISPLAY_MAP[def.key] ?? def.key);
  return parts.join(' + ');
};