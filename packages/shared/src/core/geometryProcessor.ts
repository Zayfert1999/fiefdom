// packages/shared/src/core/geometryProcessor.ts
// ============================================
// 🏭 ГЕОМЕТРИЧЕСКИЙ ПРОЦЕССОР ТАЙЛОВ
// ============================================
// Строгий поэтапный пайплайн обработки геометрии:
//
//   Этап 1: Тесселяция      → превращает кривые в полигоны (кэширует TessellatedLine)
//   Этап 2: Декорации       → генерирует площади на перекрёстках (использует кэш)
//   Этап 3: Обрезка дорог   → вычитает области и декорации (использует кэш)
//   Этап 4: Вычисление полей → квадрат тайла МИНУС всё остальное
//   Этап 5: Привязка        → распределяет полигоны по фичам
//
// Каждый этап принимает результат предыдущего — нет скрытых вызовов.
// ============================================

import type { TileFeature, Spot } from './types';
import type { Point, AreaGeometry } from './geometry.types';
import { tessellateArea, tessellateLine, type TessellatedLine } from './tessellate';
import { subtractPolygons, TILE_SQUARE } from './booleanOps';
import { pointInPolygon } from './geometryPointInPolygon';
import { generatePlazas } from './proceduralGeometry';

// ============================================
// 📦 ИНТЕРФЕЙСЫ РЕЗУЛЬТАТОВ ЭТАПОВ
// ============================================

/**
 * Результат этапа 1: тесселяция всех фич.
 * Превращает кривые Безье в дискретные полигоны.
 *
 * 🌟 КЛЮЧЕВОЕ: дороги хранятся как TessellatedLine (center, left, right),
 * а не как финальный полигон. Это позволяет:
 *   - Использовать center для генерации площадей (Этап 2)
 *   - Строить полигон по месту для обрезки (Этап 3)
 */
export interface TessellationResult {
    /** Области (города, монастыри): featureId → полигон */
    readonly areas: ReadonlyMap<string, Point[]>;
    /** Дороги: featureId → TessellatedLine (center, left, right) */
    readonly lines: ReadonlyMap<string, TessellatedLine>;
}

/**
 * Результат этапа 2: генерация декораций.
 * Площади на перекрёстках дорог.
 */
export interface DecorationResult {
    /** Геометрия площадей (для отладки) */
    readonly plazaGeometries: readonly AreaGeometry[];
    /** Сгенерированные площади: массив полигонов */
    readonly plazas: readonly Point[][];
}

/**
 * Результат этапа 3: обрезка дорог.
 * Дороги обрезаются по областям и декорациям.
 */
export interface ClippingResult {
    /** Обрезанные дороги: featureId → MultiPolygon */
    readonly clippedLines: ReadonlyMap<string, Point[][][]>;
}

/**
 * Результат этапа 4: вычисление полей.
 * Поле = квадрат тайла МИНУС все фичи и декорации.
 */
export interface FieldComputationResult {
    /** Вычисленные полигоны полей (может быть несколько) */
    readonly fieldPolygons: readonly Point[][][];
}

/**
 * Результат этапа 5: привязка полигонов к полевым фичам.
 */
export interface AssignmentResult {
    /** Привязанные поля: featureId → MultiPolygon */
    readonly fieldGeometries: ReadonlyMap<string, readonly Point[][][]>;
}

/**
 * Финальный результат процессора — все этапы вместе.
 */
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

/**
 * Строит замкнутый полигон дороги из TessellatedLine.
 *
 * Алгоритм: left (вперёд) + reversed right (назад) = замкнутый контур.
 *
 * @param tessellated Тесселированная дорога из Этапа 1
 * @returns Замкнутый полигон (массив точек)
 */
function buildRoadPolygon(tessellated: TessellatedLine): Point[] {
    const reversedRight = [...tessellated.right].reverse();
    return [...tessellated.left, ...reversedRight];
}

// ============================================
// 🏭 ГЛАВНАЯ ФУНКЦИЯ ПРОЦЕССОРА
// ============================================

/**
 * 🏭 Запускает полный пайплайн обработки геометрии тайла.
 *
 * @param features Все фичи тайла
 * @returns Полный результат всех этапов
 *
 * @example
 * ```ts
 * const result = processTileGeometry(tile.features);
 * console.log(result.clipping.clippedLines); // обрезанные дороги
 * console.log(result.assignments.fieldGeometries); // привязанные поля
 * ```
 */
export function processTileGeometry(
    features: readonly TileFeature[]
): TileGeometryResult {
    // Этап 1: Тесселяция
    const tessellation = tessellate(features);

    // Этап 2: Декорации — передаём КЭШ тесселированных дорог
    const decorations = generateDecorations(tessellation.lines);

    // Этап 3: Обрезка дорог
    const clipping = clipLines(tessellation, decorations);

    // Этап 4: Вычисление полей
    const fields = computeFields(tessellation, clipping, decorations);

    // Этап 5: Привязка
    const assignments = assignFieldPolygons(features, fields);

    return {
        tessellation,
        decorations,
        clipping,
        fields,
        assignments,
    };
}

// ============================================
// ЭТАП 1: ТЕССЕЛЯЦИЯ
// ============================================

/**
 * Этап 1: Тесселяция всех фич.
 *
 * Превращает кривые Безье в дискретные полигоны:
 *   - area → замкнутый полигон
 *   - line → TessellatedLine (center, left, right)
 *
 * @param features Все фичи тайла
 * @returns Тесселированные данные по featureId
 */
function tessellate(features: readonly TileFeature[]): TessellationResult {
    const areas = new Map<string, Point[]>();
    const lines = new Map<string, TessellatedLine>();

    for (const feature of features) {
        if (!feature.geometry) continue;
        if (feature.geometry.kind === 'derived') continue;

        if (feature.geometry.kind === 'area') {
            const polygon = tessellateArea(feature.geometry);
            areas.set(feature.id, polygon);
        } else if (feature.geometry.kind === 'line') {
            // Сохраняем полный TessellatedLine — используется в Этапах 2 и 3
            const tessellated = tessellateLine(feature.geometry);
            lines.set(feature.id, tessellated);
        }
    }

    return { areas, lines };
}

// ============================================
// ЭТАП 2: ДЕКОРАЦИИ
// ============================================

/**
 * Этап 2: Генерация декораций (площадей).
 *
 * Площади генерируются автоматически на перекрёстках дорог.
 *
 * 🌟 Принимает кэш тесселированных дорог из Этапа 1.
 *
 * @param tessellatedLines Кэш тесселированных дорог
 * @returns Сгенерированные площади
 */
function generateDecorations(
    tessellatedLines: ReadonlyMap<string, TessellatedLine>
): DecorationResult {
    const plazaGeometries = generatePlazas(tessellatedLines);
    const plazas = plazaGeometries.map(geo => tessellateArea(geo));
    return { plazaGeometries, plazas };
}

// ============================================
// ЭТАП 3: ОБРЕЗКА ДОРОГ
// ============================================

/**
 * Этап 3: Обрезка дорог по областям и декорациям.
 *
 * Каждая дорога вычитается из всех областей (городов, монастырей)
 * и всех декораций (площадей).
 *
 * 🌟 Использует кэш тесселированных дорог из Этапа 1.
 * Строит полигон дороги через buildRoadPolygon по месту.
 *
 * @param tessellation Результат этапа 1
 * @param decorations  Результат этапа 2
 * @returns Обрезанные дороги
 */
function clipLines(
    tessellation: TessellationResult,
    decorations: DecorationResult
): ClippingResult {
    const clippedLines = new Map<string, Point[][][]>();

    // Собираем препятствия для обрезки дорог
    const obstacles: Point[][][] = [];

    // Области (города, монастыри)
    for (const polygon of tessellation.areas.values()) {
        obstacles.push([polygon]);
    }

    // Декорации (площади)
    for (const plaza of decorations.plazas) {
        obstacles.push([plaza]);
    }

    // Если нечего вычитать — возвращаем необрезанные дороги
    if (obstacles.length === 0) {
        for (const [featureId, tessellated] of tessellation.lines) {
            const polygon = buildRoadPolygon(tessellated);
            clippedLines.set(featureId, [[polygon]]);
        }
        return { clippedLines };
    }

    // Обрезаем каждую дорогу по всем препятствиям
    for (const [featureId, tessellated] of tessellation.lines) {
        // 🌟 Строим полигон из TessellatedLine через buildRoadPolygon
        const polygon = buildRoadPolygon(tessellated);
        let clipped: Point[][][] = [[polygon]];

        for (const obstacle of obstacles) {
            clipped = subtractPolygons(clipped, [obstacle]) as Point[][][];
            if (clipped.length === 0) break;
        }

        if (clipped.length > 0) {
            clippedLines.set(featureId, clipped);
        }
    }

    return { clippedLines };
}

// ============================================
// ЭТАП 4: ВЫЧИСЛЕНИЕ ПОЛЕЙ
// ============================================

/**
 * Этап 4: Вычисление геометрии полей.
 *
 * Поле = квадрат тайла МИНУС:
 *   - Все области (города, монастыри)
 *   - Обрезанные дороги
 *   - Декорации (площади)
 *
 * @param tessellation Результат этапа 1
 * @param clipping     Результат этапа 3
 * @param decorations  Результат этапа 2
 * @returns Вычисленные полигоны полей
 */
function computeFields(
    tessellation: TessellationResult,
    clipping: ClippingResult,
    decorations: DecorationResult
): FieldComputationResult {
    const subtractList: Point[][][] = [];

    // 1. Области (города, монастыри)
    for (const polygon of tessellation.areas.values()) {
        subtractList.push([polygon]);
    }

    // 2. Обрезанные дороги
    for (const clipped of clipping.clippedLines.values()) {
        for (const polygon of clipped) {
            subtractList.push(polygon);
        }
    }

    // 3. Декорации (площади)
    for (const plaza of decorations.plazas) {
        subtractList.push([plaza]);
    }

    // Вычитаем всё из квадрата тайла
    const tileMultiPolygon: readonly Point[][][] = [[TILE_SQUARE as Point[]]];
    const fieldPolygons = subtractPolygons(tileMultiPolygon, subtractList);

    return { fieldPolygons };
}

// ============================================
// ЭТАП 5: ПРИВЯЗКА ПОЛИГОНОВ
// ============================================

/**
 * Этап 5: Привязка вычисленных полигонов к полевым фичам.
 *
 * Алгоритм:
 *   Для каждой полевой фичи берём её `meepleSpot` как якорь
 *   и ищем полигон, содержащий эту точку (point-in-polygon).
 *
 * @param features Все фичи тайла
 * @param fields   Результат этапа 4
 * @returns Привязанные поля
 */
function assignFieldPolygons(
    features: readonly TileFeature[],
    fields: FieldComputationResult
): AssignmentResult {
    const fieldGeometries = new Map<string, readonly Point[][][]>();
    const used = new Set<number>();

    // Берём только поля с `derived` геометрией
    const fieldFeatures = features.filter(
        f => f.type === 'field' && f.geometry?.kind === 'derived'
    );

    if (fieldFeatures.length === 0 || fields.fieldPolygons.length === 0) {
        return { fieldGeometries };
    }

    // Для каждого поля ищем полигон по meepleSpot
    for (const field of fieldFeatures) {
        // Поддержка миграции: Spot может быть массивом или одиночным объектом
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
                break;
            }
        }

        if (!assigned) {
            console.warn(
                `⚠️ [geometryProcessor] Не найден полигон для поля "${field.id}"` +
                ` (spot: ${spot.x}, ${spot.y}). Проверьте геометрию.`
            );
        }
    }

    const unusedCount = fields.fieldPolygons.length - used.size;
    if (unusedCount > 0) {
        console.warn(
            `⚠️ [geometryProcessor] Осталось нераспределённых полигонов: ${unusedCount}`
        );
    }

    return { fieldGeometries };
}

// ============================================
// 📤 ЭКСПОРТ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ============================================

/**
 * @deprecated Используйте `processTileGeometry` вместо этой функции.
 *
 * Эта функция оставлена для обратной совместимости.
 * Внутренне вызывает новый процессор и возвращает только нужные поля.
 */
export function computeTileGeometry(features: readonly TileFeature[]): {
    plazas: readonly Point[][];
    clippedLines: Map<string, Point[][][]>;
    fieldGeometries: Map<string, readonly Point[][][]>;
} {
    const result = processTileGeometry(features);
    return {
        plazas: result.decorations.plazas,
        clippedLines: result.clipping.clippedLines as Map<string, Point[][][]>,
        fieldGeometries: result.assignments.fieldGeometries as Map<string, readonly Point[][][]>,
    };
}