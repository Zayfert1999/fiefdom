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
import { generatePlazas, type PlazaParams } from './generators/plaza';
import { computeFieldPolygons, assignFieldFeatures } from './generators/field';
import { applyGeometryNoise, type NoiseOptions } from './geometryPostProcessor';
// 🌟 Типы из нового файла
import type {
    TessellationResult,
    DecorationResult,
    ClippingResult,
    FieldComputationResult,
    AssignmentResult,
    TileGeometryResult,
} from './types';

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
function buildRoadPolygon(tessellated: TessellatedLine): Ring {
    const reversedRight = [...tessellated.right].reverse();
    return [...tessellated.left, ...reversedRight];
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
    const plazaGeometries = generatePlazas(tessellation.lines, plazaParams);
    const plazas = plazaGeometries.map(geo => tessellateArea(geo, params));
    console.log(`🏛️ [Decorations] Сгенерировано ${plazas.length} площадей`);
    return { plazaGeometries, plazas };
}

// ============================================
// ЭТАП 4: ОБРЕЗКА ДОРОГ
// ============================================
function clipLines(
    tessellation: TessellationResult,
    decorations: DecorationResult
): ClippingResult {
    const clippedLines = new Map<string, MultiPolygon>();
    const obstacles: Polygon[] = [];

    for (const mp of tessellation.areas.values()) {
        for (const polygon of mp) obstacles.push(polygon);
    }
    for (const plaza of decorations.plazas) {
        obstacles.push([plaza]);
    }

    console.log(`✂️ [Clip] Препятствий: ${obstacles.length}`);

    if (obstacles.length === 0) {
        for (const [id, tess] of tessellation.lines) {
            clippedLines.set(id, [[buildRoadPolygon(tess)]]);
        }
        return { clippedLines };
    }

    for (const [id, tess] of tessellation.lines) {
        const ring = buildRoadPolygon(tess);
        let clipped: MultiPolygon = [[ring]];

        for (const obstacle of obstacles) {
            clipped = subtractPolygons(clipped, [obstacle]);
            if (clipped.length === 0) break;
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
    const fieldGeometries = assignFieldFeatures(features, fields.fieldPolygons);
    return { fieldGeometries };
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