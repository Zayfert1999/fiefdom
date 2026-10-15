// packages/client/src/core/geometry/types.ts
// ============================================
// 📦 ОБЩИЕ ТИПЫ ГЕОМЕТРИЧЕСКОГО ПАЙПЛАЙНА
// ============================================
// Вынесены из geometryProcessor для разрыва
// циклической зависимости с geometryPostProcessor.
// ============================================
import type { Ring, Polygon, MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import type { TessellatedLine } from './tessellate';

/** Результат тесселяции всех фич тайла */
export interface TessellationResult {
    readonly areas: ReadonlyMap<string, MultiPolygon>;
    readonly lines: ReadonlyMap<string, TessellatedLine>;
}

/** Результат генерации декораций (площади) */
export interface DecorationResult {
    readonly plazaGeometries: readonly import('@fiefdom/shared/core/geometry.types').AreaGeometry[];
    readonly plazas: readonly Ring[];
}

/** Результат обрезки дорог */
export interface ClippingResult {
    readonly clippedLines: ReadonlyMap<string, MultiPolygon>;
}

/** Результат вычисления полей */
export interface FieldComputationResult {
    readonly fieldPolygons: readonly Polygon[];
}

/** Результат привязки полей к фичам */
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