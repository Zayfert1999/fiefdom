// packages/client/src/utils/color.ts
// 🌟 Утилиты для работы с цветами
// Переиспользуются в GameHUD, MeepleLayer и других компонентах

/**
 * 🎨 Затемняет HEX-цвет на заданный процент.
 * Используется для создания тёмных версий цветов игроков
 * (рамка-таймер в GameHUD, обводка миплов в MeepleLayer).
 *
 * @param hex Цвет в формате '#RRGGBB' или '#RGB'
 * @param amount Степень затемнения (0 = без изменений, 1 = чёрный)
 * @returns Затемнённый цвет в формате '#RRGGBB'
 *
 * @example
 * darkenColor('#ff5555')      // '#a53737' (35% темнее)
 * darkenColor('#ff5555', 0.5) // '#7f2a2a' (50% темнее)
 * darkenColor('#ffffff', 0.4) // '#999999'
 */
export function darkenColor(hex: string, amount = 0.35): string {
  // Поддержка короткой формы '#RGB'
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }

  // Валидация
  if (c.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(c)) {
    console.warn(`⚠️ [color] Некорректный HEX-цвет: ${hex}`);
    return hex;
  }

  const r = Math.max(0, Math.floor(parseInt(c.substring(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.floor(parseInt(c.substring(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.floor(parseInt(c.substring(4, 6), 16) * (1 - amount)));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 🎨 Добавляет прозрачность к HEX-цвету.
 * Возвращает цвет в формате rgba().
 *
 * @param hex Цвет в формате '#RRGGBB'
 * @param alpha Прозрачность (0 = полностью прозрачный, 1 = непрозрачный)
 * @returns Цвет в формате 'rgba(r, g, b, alpha)'
 *
 * @example
 * colorWithAlpha('#ff5555', 0.5) // 'rgba(255, 85, 85, 0.5)'
 */
export function colorWithAlpha(hex: string, alpha: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }

  if (c.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(c)) {
    console.warn(`⚠️ [color] Некорректный HEX-цвет: ${hex}`);
    return hex;
  }

  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}