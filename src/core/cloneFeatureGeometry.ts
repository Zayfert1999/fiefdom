// utils/cloneFeatureGeometry.ts
import { TILE_SIZE } from '@/core/constants';

export interface FeatureGeometry {
  tileX: number;
  tileY: number;
  rotation: number;
  featureId: string;
}

/**
 * 🌟 Клонирует ТОЛЬКО геометрию SVG-элементов фич.
 * Стили применяются через CSS на родителе или через CSS-классы.
 * 
 * @param containerEl Контейнер для клонированных элементов
 * @param features Массив фич с координатами и ID
 */
export function cloneFeatureGeometry(
  containerEl: SVGClipPathElement | SVGGElement,
  features: FeatureGeometry[]
): { cloned: number; failed: number } {
  containerEl.innerHTML = '';
  let cloned = 0;
  let failed = 0;

  for (const { tileX, tileY, rotation, featureId } of features) {
    const tileSelector = `g[transform*="translate(${tileX * TILE_SIZE}, ${tileY * TILE_SIZE})"]`;
    const tileEl = document.querySelector(tileSelector);

    if (!tileEl) {
      console.warn(`⚠️ [Clone] Тайл не найден: (${tileX}, ${tileY})`);
      failed++;
      continue;
    }

    const featureEl = tileEl.querySelector(`[data-name="${featureId}"]`);
    if (!featureEl) {
      console.warn(`⚠️ [Clone] Фича не найдена: [data-name="${featureId}"] в тайле (${tileX}, ${tileY})`);
      failed++;
      continue;
    }

    const clone = featureEl.cloneNode(true) as SVGElement;

    // 🌟 Оставляем ТОЛЬКО геометрические атрибуты
    const allowedAttrs = new Set([
      'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points',
      'x1', 'y1', 'x2', 'y2',
    ]);

    const attrsToRemove: string[] = [];
    for (const attr of Array.from(clone.attributes)) {
      if (!allowedAttrs.has(attr.name)) {
        attrsToRemove.push(attr.name);
      }
    }
    for (const attr of attrsToRemove) {
      clone.removeAttribute(attr);
    }

    // 🌟 Устанавливаем ТОЛЬКО transform
    clone.setAttribute(
      'transform',
      `translate(${tileX * TILE_SIZE}, ${tileY * TILE_SIZE}) rotate(${rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`
    );

    containerEl.appendChild(clone);
    cloned++;
  }

  return { cloned, failed };
}

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
    minX, minY, maxX, maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}
