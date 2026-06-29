// utils/cloneFeatureGeometry.ts
import {TILE_SIZE} from '@/core/constants'

export interface FeatureGeometry {
  tileX: number;
  tileY: number;
  rotation: number;
  featureId: string;
}

/**
 * 🌟 Клонирует геометрию SVG-элемента фичи в указанный clipPath.
 * Используется в RegionOverlay и CompletionOverlay.
 * 
 * @param clipPathEl Элемент <clipPath>, в который клонируется геометрия
 * @param features Массив фич с координатами и ID
 * @param options Настройки клонирования
 */
export function cloneFeatureGeometry(
  clipPathEl: SVGClipPathElement,
  features: FeatureGeometry[],
  options: {
    fill?: string;        // Цвет заливки (по умолчанию 'white')
    stroke?: string;      // Цвет обводки (по умолчанию 'none')
    strokeWidth?: number; // Толщина обводки (по умолчанию 0)
    keepFill?: boolean;   // Сохранить исходный fill (по умолчанию false)
    keepStroke?: boolean; // Сохранить исходный stroke (по умолчанию false)
  } = {}
): { cloned: number; failed: number } {
  const {
    fill = 'white',
    stroke = 'none',
    strokeWidth = 0,
    keepFill = false,
    keepStroke = false,
  } = options;

  clipPathEl.innerHTML = '';
  let cloned = 0;
  let failed = 0;

  for (const { tileX, tileY, rotation, featureId } of features) {
    // 🌟 Ищем тайл в DOM по transform
    const tileSelector = `g[transform*="translate(${tileX * TILE_SIZE}, ${tileY * TILE_SIZE})"]`;
    const tileEl = document.querySelector(tileSelector);
    
    if (!tileEl) {
      console.warn(`⚠️ [Clone] Тайл не найден: (${tileX}, ${tileY})`);
      failed++;
      continue;
    }

    // 🌟 Ищем фичу по data-name
    const featureEl = tileEl.querySelector(`[data-name="${featureId}"]`);
    if (!featureEl) {
      console.warn(`⚠️ [Clone] Фича не найдена: [data-name="${featureId}"] в тайле (${tileX}, ${tileY})`);
      failed++;
      continue;
    }

    const clone = featureEl.cloneNode(true) as SVGElement;

    // 🌟 Оставляем только геометрические атрибуты + опционально fill/stroke
    const allowedAttrs = new Set([
      'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points',
      'x1', 'y1', 'x2', 'y2',
    ]);
    
    if (keepFill) allowedAttrs.add('fill');
    if (keepStroke) {
      allowedAttrs.add('stroke');
      allowedAttrs.add('stroke-width');
      allowedAttrs.add('stroke-linecap');
      allowedAttrs.add('stroke-linejoin');
    }

    const attrsToRemove: string[] = [];
    for (const attr of Array.from(clone.attributes)) {
      if (!allowedAttrs.has(attr.name)) {
        attrsToRemove.push(attr.name);
      }
    }
    for (const attr of attrsToRemove) {
      clone.removeAttribute(attr);
    }

    // 🌟 Применяем стили из options
    if (!keepFill) clone.setAttribute('fill', fill);
    if (!keepStroke) {
      clone.setAttribute('stroke', stroke);
      if (strokeWidth > 0) {
        clone.setAttribute('stroke-width', String(strokeWidth));
      }
    }

    clone.removeAttribute('class');
    clone.removeAttribute('data-name');
    clone.removeAttribute('opacity');

    clone.setAttribute(
      'transform',
      `translate(${tileX * TILE_SIZE}, ${tileY * TILE_SIZE}) rotate(${rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`
    );

    clipPathEl.appendChild(clone);
    cloned++;
  }

  return { cloned, failed };
}

/**
 * 🌟 Вычисляет bounding box для массива фич
 */
export function calculateBoundingBox(features: FeatureGeometry[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
} {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const { tileX, tileY } of features) {
    const x = tileX * TILE_SIZE;
    const y = tileY * TILE_SIZE;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + TILE_SIZE > maxX) maxX = x + TILE_SIZE;
    if (y + TILE_SIZE > maxY) maxY = y + TILE_SIZE;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export { TILE_SIZE };