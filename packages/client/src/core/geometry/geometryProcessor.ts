// packages/client/src/core/geometry/geometryProcessor.ts
// ============================================
// 🏭 ГЕОМЕТРИЧЕСКИЙ ПРОЦЕССОР ТАЙЛОВ
// ============================================
// Пайплайн (5 этапов):
//   1. Тесселяция всех фич (area → Ring, line → TessellatedLine)
//   2. Генерация декораций (площади на перекрёстках)
//   3. Обрезка дорог (вычитание препятствий)
//   4. Вычисление полей (квадрат тайла − всё остальное)
//   5. Привязка полигонов к полевым фичам по споту
//
// 🌟 СТЕН УДАЛЕНЫ — пайплайн упростился.
// ============================================
import type { TileFeature, Spot } from '@fiefdom/shared/core/types';
import type { Point, Ring, Polygon, MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import { tessellateArea, tessellateLine, type TessellatedLine } from './tessellate';
import { subtractPolygons, TILE_SQUARE } from './booleanOps';
import { pointInPolygon } from './geometryPointInPolygon';
import { generatePlazas } from './proceduralGeometry';

// ============================================
// 📦 ИНТЕРФЕЙСЫ РЕЗУЛЬТАТОВ ЭТАПОВ
// ============================================

/** Результат этапа 1: тесселяция всех фич */
export interface TessellationResult {
  /** Области (города, монастыри): featureId → MultiPolygon */
  readonly areas: ReadonlyMap<string, MultiPolygon>;
  /** Дороги: featureId → TessellatedLine */
  readonly lines: ReadonlyMap<string, TessellatedLine>;
}

/** Результат этапа 2: генерация декораций */
export interface DecorationResult {
  /** Геометрия площадей (для отладки) */
  readonly plazaGeometries: readonly import('@fiefdom/shared/core/geometry.types').AreaGeometry[];
  /** Сгенерированные площади: массив Ring */
  readonly plazas: readonly Ring[];
  // 🌟 СТЕН БОЛЬШЕ НЕТ
}

/** Результат этапа 3: обрезка дорог */
export interface ClippingResult {
  readonly clippedLines: ReadonlyMap<string, MultiPolygon>;
}

/** Результат этапа 4: вычисление полей */
export interface FieldComputationResult {
  readonly fieldPolygons: readonly Polygon[];
}

/** Результат этапа 5: привязка полигонов к полевым фичам */
export interface AssignmentResult {
  readonly fieldGeometries: ReadonlyMap<string, MultiPolygon>;
}

/** Финальный результат процессора */
export interface TileGeometryResult {
  readonly tessellation: TessellationResult;
  readonly decorations: DecorationResult;
  readonly clipping: ClippingResult;
  readonly fields: FieldComputationResult;
  readonly assignments: AssignmentResult;
}

// ============================================
// 🛠️ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/** Строит замкнутый Ring дороги из TessellatedLine */
function buildRoadPolygon(tessellated: TessellatedLine): Ring {
  const reversedRight = [...tessellated.right].reverse();
  return [...tessellated.left, ...reversedRight];
}

// ============================================
// 🏭 ГЛАВНАЯ ФУНКЦИЯ ПРОЦЕССОРА
// ============================================

/**
 * 🏭 Запускает полный пайплайн обработки геометрии тайла.
 * 🌟 Без стен — 5 этапов вместо 5.5.
 */
export function processTileGeometry(
  features: readonly TileFeature[]
): TileGeometryResult {
  console.log(`🏭 [GeometryProcessor] Начало обработки ${features.length} фич`);

  // Этап 1: Тесселяция
  const tessellation = tessellate(features);

  // Этап 2: Декорации (площади)
  const decorations = generateDecorations(tessellation);

  // Этап 3: Обрезка дорог
  const clipping = clipLines(tessellation, decorations);

  // Этап 4: Вычисление полей
  const fields = computeFields(tessellation, clipping, decorations);

  // Этап 5: Привязка
  const assignments = assignFieldPolygons(features, fields);

  console.log(
    `✅ [GeometryProcessor] Завершено: ` +
    `${tessellation.areas.size} областей, ` +
    `${tessellation.lines.size} дорог, ` +
    `${decorations.plazas.length} площадей, ` +
    `${fields.fieldPolygons.length} полей, ` +
    `${assignments.fieldGeometries.size} привязок`
  );

  return { tessellation, decorations, clipping, fields, assignments };
}

// ============================================
// ЭТАП 1: ТЕССЕЛЯЦИЯ
// ============================================

function tessellate(features: readonly TileFeature[]): TessellationResult {
  const areas = new Map<string, MultiPolygon>();
  const lines = new Map<string, TessellatedLine>();

  for (const feature of features) {
    if (!feature.geometry) continue;
    if (feature.geometry.kind === 'derived') continue;

    if (feature.geometry.kind === 'area') {
      const ring = tessellateArea(feature.geometry);
      const polygon: Polygon = [ring];
      const mp: MultiPolygon = [polygon];
      areas.set(feature.id, mp);
      console.log(`📐 [Tessellate] Area "${feature.id}": ${ring.length} точек`);
    } else if (feature.geometry.kind === 'line') {
      const tessellated = tessellateLine(feature.geometry);
      lines.set(feature.id, tessellated);
      console.log(
        `📐 [Tessellate] Line "${feature.id}": ` +
        `${tessellated.center.length} точек оси`
      );
    }
  }

  return { areas, lines };
}

// ============================================
// ЭТАП 2: ДЕКОРАЦИИ (без стен)
// ============================================

function generateDecorations(
  tessellation: TessellationResult
): DecorationResult {
  // Площади на перекрёстках дорог
  const plazaGeometries = generatePlazas(tessellation.lines);
  const plazas = plazaGeometries.map(geo => tessellateArea(geo));

  console.log(`🏛️ [Decorations] Сгенерировано ${plazas.length} площадей`);

  return { plazaGeometries, plazas };
}

// ============================================
// ЭТАП 3: ОБРЕЗКА ДОРОГ
// ============================================

function clipLines(
  tessellation: TessellationResult,
  decorations: DecorationResult
): ClippingResult {
  const clippedLines = new Map<string, MultiPolygon>();

  // Собираем все препятствия как массив Polygon
  const obstacles: Polygon[] = [];

  // 1. Области (города, монастыри)
  for (const multiPolygon of tessellation.areas.values()) {
    for (const polygon of multiPolygon) {
      obstacles.push(polygon);
    }
  }

  // 2. Декорации (площади) — Ring → Polygon
  for (const plaza of decorations.plazas) {
    obstacles.push([plaza]);
  }

  // 🌟 СТЕН БОЛЬШЕ НЕТ — препятствий меньше

  console.log(
    `✂️ [Clip] Препятствий для обрезки: ${obstacles.length} ` +
    `(${tessellation.areas.size} областей + ${decorations.plazas.length} площадей)`
  );

  // Если нет препятствий — дороги не обрезаются
  if (obstacles.length === 0) {
    for (const [featureId, tessellated] of tessellation.lines) {
      const ring = buildRoadPolygon(tessellated);
      clippedLines.set(featureId, [[ring]]);
    }
    return { clippedLines };
  }

  for (const [featureId, tessellated] of tessellation.lines) {
    const ring = buildRoadPolygon(tessellated);
    let clipped: MultiPolygon = [[ring]];

    for (const obstacle of obstacles) {
      clipped = subtractPolygons(clipped, [obstacle]);
      if (clipped.length === 0) break;
    }

    if (clipped.length > 0) {
      clippedLines.set(featureId, clipped);
      console.log(
        `✂️ [Clip] Дорога "${featureId}": ${clipped.length} полигон(ов) после обрезки`
      );
    } else {
      console.warn(
        `⚠️ [Clip] Дорога "${featureId}" полностью вырезана препятствиями`
      );
    }
  }

  return { clippedLines };
}

// ============================================
// ЭТАП 4: ВЫЧИСЛЕНИЕ ПОЛЕЙ
// ============================================

function computeFields(
  tessellation: TessellationResult,
  clipping: ClippingResult,
  decorations: DecorationResult
): FieldComputationResult {
  const subtractList: Polygon[] = [];

  // 1. Области (города, монастыри)
  for (const multiPolygon of tessellation.areas.values()) {
    for (const polygon of multiPolygon) {
      subtractList.push(polygon);
    }
  }

  // 2. Обрезанные дороги
  for (const multiPolygon of clipping.clippedLines.values()) {
    for (const polygon of multiPolygon) {
      subtractList.push(polygon);
    }
  }

  // 3. Декорации (площади) — Ring → Polygon
  for (const plaza of decorations.plazas) {
    subtractList.push([plaza]);
  }

  // 🌟 СТЕН БОЛЬШЕ НЕТ

  // Вычитаем всё из квадрата тайла
  const tileMultiPolygon: MultiPolygon = [[TILE_SQUARE]];
  const fieldMultiPolygon = subtractPolygons(tileMultiPolygon, subtractList);

  return { fieldPolygons: fieldMultiPolygon };
}

// ============================================
// ЭТАП 5: ПРИВЯЗКА ПОЛИГОНОВ
// ============================================

function assignFieldPolygons(
  features: readonly TileFeature[],
  fields: FieldComputationResult
): AssignmentResult {
  const fieldGeometries = new Map<string, MultiPolygon>();
  const used = new Set<number>();

  const fieldFeatures = features.filter(
    f => f.type === 'field' && f.geometry?.kind === 'derived'
  );

  if (fieldFeatures.length === 0 || fields.fieldPolygons.length === 0) {
    console.log(
      `🔗 [Assign] Пропуск: ${fieldFeatures.length} полей, ` +
      `${fields.fieldPolygons.length} полигонов`
    );
    return { fieldGeometries };
  }

  console.log(
    `🔗 [Assign] Привязка ${fieldFeatures.length} полей к ` +
    `${fields.fieldPolygons.length} полигонам`
  );

  for (const field of fieldFeatures) {
    const rawSpot = field.meepleSpot;
    const spot: Spot = Array.isArray(rawSpot) ? rawSpot[0] : rawSpot;
    const spotPoint: Point = [spot.x, spot.y];

    let assigned = false;

    for (let i = 0; i < fields.fieldPolygons.length; i++) {
      if (used.has(i)) continue;

      if (pointInPolygon(spotPoint, fields.fieldPolygons[i])) {
        fieldGeometries.set(field.id, [fields.fieldPolygons[i]]);
        used.add(i);
        assigned = true;
        console.log(
          `🔗 [Assign] Поле "${field.id}" → полигон #${i} ` +
          `(spot: ${spot.x}, ${spot.y})`
        );
        break;
      }
    }

    if (!assigned) {
      console.warn(
        `⚠️ [Assign] Не найден полигон для поля "${field.id}" ` +
        `(spot: ${spot.x}, ${spot.y}). Проверьте геометрию.`
      );
    }
  }

  const unusedCount = fields.fieldPolygons.length - used.size;
  if (unusedCount > 0) {
    console.warn(
      `⚠️ [Assign] Осталось нераспределённых полигонов: ${unusedCount}`
    );
  }

  return { fieldGeometries };
}

// ============================================
// 📤 ЭКСПОРТ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ============================================

/** @deprecated Используйте `processTileGeometry` вместо этой функции */
export function computeTileGeometry(features: readonly TileFeature[]): {
  plazas: readonly Ring[];
  clippedLines: Map<string, MultiPolygon>;
  fieldGeometries: Map<string, MultiPolygon>;
} {
  const result = processTileGeometry(features);
  return {
    plazas: result.decorations.plazas,
    clippedLines: result.clipping.clippedLines as Map<string, MultiPolygon>,
    fieldGeometries: result.assignments.fieldGeometries as Map<string, MultiPolygon>,
  };
}