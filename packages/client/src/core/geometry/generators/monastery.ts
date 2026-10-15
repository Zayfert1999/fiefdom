// packages/client/src/core/geometry/generators/monastery.ts
// ============================================
// ⛪ ГЕНЕРАЦИЯ МОНАСТЫРЕЙ
// ============================================
// Монастырь занимает центр тайла.
// Форма: квадрат со скруглёнными углами (фиксированная, без рандомизации).
//
// Параметры:
//   • Размер: 40×40 юнитов (±20 от центра)
//   • Скругление углов: 2 юнита
//
// Метка мипла всегда в центре (0, 0) — гарантированно внутри контура.
// ============================================
import type {
  AreaGeometry,
  OutlineSegment,
  Point,
} from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';

// ============================================
// ⚙️ ПАРАМЕТРЫ ФОРМЫ (фиксированные)
// ============================================
export const MONASTERY_PARAMS = {
  /** Половина стороны монастыря (размер 40×40) */
  halfExtent: 20,
  
  /** Радиус скругления углов */
  cornerRadius: 5,
} as const;

export interface MonasteryResult {
  readonly geometry: AreaGeometry;
  /** Половина стороны (для контекста дорог) */
  readonly halfExtent: number;
}

// ============================================
// 🛠️ ХЕЛПЕРЫ
// ============================================
const line = (to: Point): OutlineSegment => ({ type: 'line', to });
const quad = (cp: Point, to: Point): OutlineSegment => ({ type: 'quadratic', cp, to });
const CLOSE: OutlineSegment = { type: 'close' };

/**
 * Строит квадрат со скруглёнными углами.
 * 
 * @param half Половина стороны квадрата
 * @param cornerRadius Радиус скругления углов
 * @returns AreaGeometry монастыря
 */
function buildSquareWithCorners(
  half: number,
  cornerRadius: number
): AreaGeometry {
  const r = cornerRadius;
  
  return {
    kind: 'area',
    start: [-half, -half + r],
    outline: [
      // Левый верхний угол (скругление)
      quad([-half, -half], [-half + r, -half]),
      // Верхняя сторона
      line([half - r, -half]),
      // Правый верхний угол
      quad([half, -half], [half, -half + r]),
      // Правая сторона
      line([half, half - r]),
      // Правый нижний угол
      quad([half, half], [half - r, half]),
      // Нижняя сторона
      line([-half + r, half]),
      // Левый нижний угол
      quad([-half, half], [-half, half - r]),
      // Левая сторона
      line([-half, -half + r]),
      CLOSE,
    ],
  };
}

// ============================================
// 📤 PUBLIC API
// ============================================
/**
 * Генерирует форму монастыря (фиксированная, без рандомизации).
 * 
 * @param monastery Фича монастыря из base.json
 * @returns Результат генерации или null если фича не монастырь
 */
export function generateMonastery(
  monastery: TileFeature
): MonasteryResult | null {
  if (monastery.type !== 'monastery') return null;
  
  const P = MONASTERY_PARAMS;
  const geometry = buildSquareWithCorners(P.halfExtent, P.cornerRadius);
  
  console.log(
    `⛪ [MonasteryGenerator] Монастырь сгенерирован: ` +
    `размер=${P.halfExtent * 2}×${P.halfExtent * 2}, ` +
    `скругление=${P.cornerRadius}`
  );
  
  return {
    geometry,
    halfExtent: P.halfExtent,
  };
}