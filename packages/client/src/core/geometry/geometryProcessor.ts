// packages/client/src/core/geometry/geometryProcessor.ts
// ============================================
// 🏭 ГЕОМЕТРИЧЕСКИЙ ПРОЦЕССОР ТАЙЛОВ
// ============================================
// 🌟 ИЗМЕНЕНО:
//   • Типы импортируются из ./types (не определяются здесь)
//   • applyGeometryNoise из ./geometryPostProcessor
//   • Параметры тесселяции (`options.tessellation`) пробрасываются
//     во все вызовы tessellateArea / tessellateLine
// ============================================
import type { TileFeature } from '@fiefdom/shared/core/types';
import type { Ring, Polygon, MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import {
    tessellateArea,
    tessellateLine,
    type TessellatedLine,
    type TessellationParams,
} from './tessellate';
import { subtractPolygons } from './booleanOps';
import { ringsOverlap, ringBounds, boundsOverlap } from './ringOverlap';
import { generateJunctions, type PlazaParams } from './generators/plaza';
import { computeFieldPolygons, assignFieldFeaturesDetailed } from './generators/field';
import { applyGeometryNoise, type NoiseOptions } from './geometryPostProcessor';
// 🌟 Типы из нового файла
import type {
    TessellationResult,
    DecorationResult,
    ClippingResult,
    FieldComputationResult,
    AssignmentResult,
    TileGeometryResult,
    PlazaRoadCut,
} from './types';

/** Порог дробления прямых, который ничего не дробит (юниты) */
const NO_SUBDIVIDE = 1e9;

// Реэкспортируем типы для совместимости
export type {
    TessellationResult,
    DecorationResult,
    ClippingResult,
    FieldComputationResult,
    AssignmentResult,
    TileGeometryResult,
};

/** Опции процессора */
export interface ProcessOptions {
    /** Seed для шума Перлина. Если не указан — шум не применяется */
    readonly noiseSeed?: string;
    /** Параметры шума (амплитуды, частоты, октавы, края тайла, сглаживание...) */
    readonly noise?: Partial<Omit<NoiseOptions, 'seed'>>;
    /** Параметры тесселяции (плотность, min/max точек...) */
    readonly tessellation?: Partial<TessellationParams>;
    /** Параметры площадей на перекрёстках (глубина, радиус скругления...) */
    readonly plaza?: Partial<PlazaParams>;
}

// ============================================
// 🛠️ ХЕЛПЕРЫ
// ============================================
function buildRoadPolygon(tessellated: TessellatedLine, cuts: readonly PlazaRoadCut[] = []): Ring | null {
    // Дорога обрывается там, где её срезает площадь: полигон начинается на ребре среза
    let from = 0;
    let to = tessellated.center.length - 1;
    for (const cut of cuts) {
        if (cut.atStart) from = Math.max(from, cut.index);
        else to = Math.min(to, cut.index);
    }
    if (to - from < 1) return null; // дорога целиком под площадью

    const left = tessellated.left.slice(from, to + 1);
    const reversedRight = tessellated.right.slice(from, to + 1).reverse();
    return [...left, ...reversedRight];
}

// ============================================
// 🏭 ГЛАВНАЯ ФУНКЦИЯ
// ============================================
export function processTileGeometry(
    features: readonly TileFeature[],
    options?: ProcessOptions
): TileGeometryResult {
    console.log(`🏭 [GeometryProcessor] Начало обработки ${features.length} фич`);

    // Этап 1: Тесселяция
    let tessellation = tessellate(features, options?.tessellation);

    // Этап 2: 🌊 Шум Перлина
    if (options?.noiseSeed) {
        tessellation = applyGeometryNoise(tessellation, {
            seed: options.noiseSeed,
            // Типы фич нужны для настроек шума «по типу» (монастырь ≠ город)
            featureTypes: new Map(features.map((feature) => [feature.id, feature.type])),
            ...options.noise,
        });
    }

    // Этап 3: Декорации (площади)
    const decorations = generateDecorations(tessellation, options?.tessellation, options?.plaza);

    // Этап 4: Обрезка дорог
    const clipping = clipLines(tessellation, decorations);

    // Этап 5: Вычисление полей
    const fields = computeFields(tessellation, clipping, decorations);

    // Этап 6: Привязка
    const assignments = assignFieldPolygons(features, fields);

    console.log(
        `✅ [GeometryProcessor] Завершено: ` +
        `${tessellation.areas.size} областей, ${tessellation.lines.size} дорог, ` +
        `${decorations.plazas.length} площадей, ${fields.fieldPolygons.length} полей, ` +
        `${assignments.fieldGeometries.size} привязок`
    );

    return { tessellation, decorations, clipping, fields, assignments };
}

// ... [функции tessellate, generateDecorations, clipLines,
//      computeFields, assignFieldPolygons, computeTileGeometry
//      остаются БЕЗ ИЗМЕНЕНИЙ из текущей версии] ...

// ============================================
// ЭТАП 1: ТЕССЕЛЯЦИЯ
// ============================================
function tessellate(
    features: readonly TileFeature[],
    params?: Partial<TessellationParams>
): TessellationResult {
    const areas = new Map<string, MultiPolygon>();
    const lines = new Map<string, TessellatedLine>();

    for (const feature of features) {
        if (!feature.geometry) continue;
        if (feature.geometry.kind === 'derived') continue;

        if (feature.geometry.kind === 'area') {
            const ring = tessellateArea(feature.geometry, params);
            areas.set(feature.id, [[ring]]);
            console.log(`📐 [Tessellate] Area "${feature.id}": ${ring.length} точек`);
        } else if (feature.geometry.kind === 'line') {
            const tessellated = tessellateLine(feature.geometry, params);
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
// ЭТАП 3: ДЕКОРАЦИИ
// ============================================
function generateDecorations(
    tessellation: TessellationResult,
    params?: Partial<TessellationParams>,
    plazaParams?: Partial<PlazaParams>
): DecorationResult {
    const junctions = generateJunctions(tessellation.lines, plazaParams);
    const plazaGeometries = junctions.map(junction => junction.geometry);

    // Прямые рёбра контура площади не дробим: часть из них общая с дорогами (срезы),
    // а добавленные посередине вершины лежали бы вне линии края после округления
    // координат в булевых операциях и давали осколки.
    const ringParams: Partial<TessellationParams> = {
        ...params,
        lineSubdivideThreshold: NO_SUBDIVIDE,
        minRingPoints: 3,
    };
    const plazas = plazaGeometries.map(geo => tessellateArea(geo, ringParams));

    const plazaCuts = new Map<string, PlazaRoadCut[]>();
    junctions.forEach((junction, plazaIndex) => {
        for (const cut of junction.cuts) {
            const list = plazaCuts.get(cut.roadId) ?? [];
            list.push({ plazaIndex, atStart: cut.atStart, index: cut.index });
            plazaCuts.set(cut.roadId, list);
        }
    });

    console.log(`🏛️ [Decorations] Сгенерировано ${plazas.length} площадей`);
    return { plazaGeometries, plazas, plazaCuts };
}

// ============================================
// ЭТАП 4: ОБРЕЗКА ДОРОГ
// ============================================
function clipLines(
    tessellation: TessellationResult,
    decorations: DecorationResult
): ClippingResult {
    const clippedLines = new Map<string, MultiPolygon>();
    const areaObstacles: Polygon[] = [];

    for (const mp of tessellation.areas.values()) {
        for (const polygon of mp) areaObstacles.push(polygon);
    }

    console.log(`✂️ [Clip] Препятствий: ${areaObstacles.length + decorations.plazas.length}`);

    for (const [id, tess] of tessellation.lines) {
        const cuts = decorations.plazaCuts.get(id) ?? [];
        // Площади, которые уже срезали эту дорогу, булевой операцией не вычитаем
        const ring = buildRoadPolygon(tess, cuts);
        if (!ring) {
            console.warn(`⚠️ [Clip] Дорога "${id}" полностью вырезана`);
            continue;
        }

        let clipped: MultiPolygon = [[ring]];

        // Вычитание у Clipper округляет координаты, поэтому его вызываем, только когда
        // препятствие может задеть дорогу: иначе дорога вернулась бы чуть сдвинутой
        const bounds = ringBounds(ring);
        const mayTouch = (obstacle: Ring): boolean => boundsOverlap(bounds, ringBounds(obstacle));

        for (const obstacle of areaObstacles) {
            if (!mayTouch(obstacle[0])) continue;
            clipped = subtractPolygons(clipped, [obstacle]);
            if (clipped.length === 0) break;
        }

        const owners = new Set(cuts.map(cut => cut.plazaIndex));
        for (let i = 0; i < decorations.plazas.length && clipped.length > 0; i++) {
            const plaza = decorations.plazas[i];
            if (!mayTouch(plaza)) continue;
            // Своя площадь стыкуется с дорогой по ребру среза: вычитать нечего.
            // Если же изогнутая дорога заходит на свою площадь, режем булевой операцией.
            if (owners.has(i) && !ringsOverlap(ring, plaza)) continue;
            clipped = subtractPolygons(clipped, [[plaza]]);
        }

        if (clipped.length > 0) {
            clippedLines.set(id, clipped);
        } else {
            console.warn(`⚠️ [Clip] Дорога "${id}" полностью вырезана`);
        }
    }

    return { clippedLines };
}

// ============================================
// ЭТАП 5: ВЫЧИСЛЕНИЕ ПОЛЕЙ
// ============================================
function computeFields(
    tessellation: TessellationResult,
    clipping: ClippingResult,
    decorations: DecorationResult
): FieldComputationResult {
    const obstacles: Polygon[] = [];

    for (const mp of tessellation.areas.values()) {
        for (const p of mp) obstacles.push(p);
    }
    for (const mp of clipping.clippedLines.values()) {
        for (const p of mp) obstacles.push(p);
    }
    for (const plaza of decorations.plazas) {
        obstacles.push([plaza]);
    }

    const fieldPolygons = computeFieldPolygons(obstacles);
    return { fieldPolygons };
}

// ============================================
// ЭТАП 6: ПРИВЯЗКА
// ============================================
function assignFieldPolygons(
    features: readonly TileFeature[],
    fields: FieldComputationResult
): AssignmentResult {
    const { fieldGeometries, methods } = assignFieldFeaturesDetailed(features, fields.fieldPolygons);
    return { fieldGeometries, fieldBinding: methods };
}

// ============================================
// 📤 ОБРАТНАЯ СОВМЕСТИМОСТЬ
// ============================================
/** @deprecated Используйте `processTileGeometry` */
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