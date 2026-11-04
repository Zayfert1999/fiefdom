// packages/client/src/core/geometry/generators/monastery.ts
// ============================================
// ⛪ ГЕНЕРАЦИЯ МОНАСТЫРЕЙ
// ============================================
// Монастырь занимает центр тайла.
// Форма: квадрат со скруглёнными углами (фиксированная, без рандомизации).
//
// Параметры (по умолчанию):
//   • Размер: 40×40 юнитов (±20 от центра)
//   • Скругление углов: 5 юнитов
//   Задаются в geometryParams.json (shapes.monastery).
//
// Метка мипла всегда в центре (0, 0) — гарантированно внутри контура.
// ============================================
import type {
  AreaGeometry,
  OutlineSegment,
  Point,
} from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { DEFAULT_SHAPE_PARAMS, type MonasteryShapeParams } from './shapeParams';

// ============================================
// ⚙️ ПАРАМЕТРЫ ФОРМЫ
// ============================================
/** @deprecated Значения по умолчанию. Используйте DEFAULT_SHAPE_PARAMS.monastery или параметры из geometryParams.json */
export const MONASTERY_PARAMS = DEFAULT_SHAPE_PARAMS.monastery;

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

  // Без скругления — обычный квадрат (иначе вырожденные кривые нулевой длины)
  if (r < 0.01) {
    return {
      kind: 'area',
      start: [-half, -half],
      outline: [
        line([half, -half]),
        line([half, half]),
        line([-half, half]),
        CLOSE,
      ],
    };
  }

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
  monastery: TileFeature,
  params: MonasteryShapeParams = DEFAULT_SHAPE_PARAMS.monastery
): MonasteryResult | null {
  if (monastery.type !== 'monastery') return null;
  
  const P = params;
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