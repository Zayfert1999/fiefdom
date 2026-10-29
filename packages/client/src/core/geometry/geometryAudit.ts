// packages/client/src/core/geometry/geometryAudit.ts
// ============================================
// 🩺 АУДИТ ГЕОМЕТРИИ: МЕТРИКИ, ШВЫ, РЕГРЕССИИ
// ============================================
// Чистые функции без React. Их используют:
//   • галерея и «доска швов» в песочнице (GeometryGallery.tsx)
//   • панель проблем под одиночным тайлом
//   • автотесты (geometryAudit.test.ts)
//
// Что проверяется по каждому тайлу:
//   • out-of-tile       — геометрия вышла за квадрат тайла
//   • road-end-gap      — торец дороги на границе не лежит ровно на ней
//   • self-intersection — контур или контур дороги самопересекается
//   • tight-spacing     — вершины почти совпадают (слипшиеся точки)
//   • area-drift        — шум слишком сильно изменил площадь фичи
//   • missing-geometry  — у фичи не получилась геометрия
//   • field-unassigned  — поле не получило полигон / остались лишние полигоны
//   • road-clipped      — дорога полностью вырезана
//   • spot-missing      — для фичи не получилось вычислить спот мипла
//   • spot-tight        — фигурка мипла (или щит) не помещается: запас меньше радиуса
//   • field-binding-fallback — поле нашло полигон только по meepleSpot, а не по портам
//
// Швы: строится случайная доска из тайлов с совпадающими портами,
// затем вдоль каждого общего ребра берутся пары точек по обе стороны.
// Тип поверхности (город / монастырь / дорога / поле) должен совпасть.
//
// ⚠️ Коды field-unassigned и road-clipped зависят от булевых операций
//    (clipper2-ts). Остальные считаются только по тесселяции.
// ============================================
import type { Point, Ring } from '@fiefdom/shared/core/geometry.types';
import type { FeatureType, TileFeature } from '@fiefdom/shared/core/types';
import { getStitchedPort, rotatePort } from '@fiefdom/shared/core/portUtils';
import { createSeededRandom } from '@fiefdom/shared/prng/seedRandom';
import { processTileGeometry } from './geometryProcessor';
import { generateFeatureGeometries } from './generators';
import type { PlazaParams } from './generators/plaza';
import { HALF } from './generators/sides';
import { measureOutOfTile, type NoiseByType, type NoiseSettings } from './geometryPostProcessor';
import { resolveTileParams, type GeometryParams } from './geometryParams';
import { computeTileSpots, resolveSpotParams, type FeatureSpot, type SpotParams } from './spots';
import { pointInRing, multiPolygonContainsPoint } from './geometryPointInPolygon';
import {
    tessellateArea,
    tessellateLine,
    type TessellatedLine,
    type TessellationParams,
} from './tessellate';
import type { TessellationResult, TileGeometryResult } from './types';

// ============================================
// 📦 ТИПЫ
// ============================================

/** Минимальное описание тайла (структурно совместимо с Tile) */
export interface AuditTile {
    readonly id: string;
    readonly artId?: string;
    readonly quantity?: number;
    readonly features: readonly TileFeature[];
}

export type Rotation = 0 | 90 | 180 | 270;

export type AuditSeverity = 'error' | 'warn';

export type AuditCode =
    | 'out-of-tile'
    | 'road-end-gap'
    | 'self-intersection'
    | 'tight-spacing'
    | 'area-drift'
    | 'missing-geometry'
    | 'field-unassigned'
    | 'road-clipped'
    | 'spot-missing'
    | 'spot-tight'
    | 'field-binding-fallback'
    | 'generation';

/** Коды, которые зависят от булевых операций (clipper2-ts) */
export const CLIPPER_DEPENDENT_CODES: ReadonlySet<AuditCode> = new Set<AuditCode>([
    'field-unassigned',
    'road-clipped',
    'spot-missing',
    'spot-tight',
    'field-binding-fallback',
]);

export interface AuditIssue {
    readonly severity: AuditSeverity;
    readonly code: AuditCode;
    readonly message: string;
    readonly featureId?: string;
}

export interface AuditThresholds {
    /** Допустимый выход за тайл (юниты) */
    readonly outOfTile: number;
    /** Допустимое отклонение торца дороги от границы (юниты) */
    readonly roadEndGap: number;
    /** Минимальное расстояние между соседними вершинами (юниты) */
    readonly minSpacing: number;
    /** Допустимое относительное изменение площади фичи от шума */
    readonly maxAreaDrift: number;
    /** Допустимая доля несовпавших выборок на одном шве */
    readonly seamMismatchFraction: number;
}

export const DEFAULT_AUDIT_THRESHOLDS: Readonly<AuditThresholds> = {
    outOfTile: 1e-6,
    roadEndGap: 1e-6,
    minSpacing: 0.05,
    maxAreaDrift: 0.3,
    seamMismatchFraction: 0.01,
};

export interface TileAudit {
    readonly tileId: string;
    readonly artId: string;
    readonly seed: string;
    readonly features: readonly TileFeature[];
    readonly geometry: TileGeometryResult;
    /** Вершины по фичам (контур / ось дороги) */
    readonly vertexCounts: Readonly<Record<string, number>>;
    readonly totalVertices: number;
    readonly outOfTile: number;
    readonly roadEndGap: number;
    readonly selfIntersections: number;
    readonly minSpacing: number;
    /** Вычисленные споты мипла и щита по featureId */
    readonly spots: ReadonlyMap<string, FeatureSpot>;
    /** Расстояние от вычисленного спота до прежнего ручного meepleSpot (юниты), если он задан */
    readonly spotDeltas: Readonly<Record<string, number>>;
    /** Наименьший запас вокруг спота среди всех фич (юниты) */
    readonly minSpotClearance: number;
    /**
     * Площадь площадей, выступающая за дорожные полосы (юниты²).
     * Это «заливка» скруглённых углов: при cornerRadius = 0 и перекрёстке
     * без внешних углов она должна быть ≈ 0 — значит, площадь точно
     * повторяет края дорог без ступенек.
     */
    readonly plazaExcessArea: number;
    /** Относительное изменение площади по фичам (|после − до| / до) */
    readonly areaDrift: Readonly<Record<string, number>>;
    readonly maxAreaDrift: number;
    /** Хэш тесселяции (после шума) — для регрессионных снимков */
    readonly signature: string;
    readonly issues: readonly AuditIssue[];
    readonly errorCount: number;
    readonly warnCount: number;
    /** Время обработки пайплайна, мс (только для auditTile) */
    readonly elapsedMs: number;
}

// ============================================
// 🔇 ТИХИЙ РЕЖИМ ДЛЯ КОНСОЛИ
// ============================================
// Пайплайн подробно пишет в консоль. Для галереи из десятков тайлов,
// пересчитываемых при каждом движении ползунка, это слишком шумно.

function withQuietConsole<T>(fn: () => T): T {
    const { log, warn } = console;
    console.log = () => undefined;
    console.warn = () => undefined;
    try {
        return fn();
    } finally {
        console.log = log;
        console.warn = warn;
    }
}

// ============================================
// 📐 ГЕОМЕТРИЧЕСКИЕ ХЕЛПЕРЫ
// ============================================

const dist = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

function ringArea(ring: Ring): number {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
}

/** Замкнутый контур дороги: левая сторона + обращённая правая */
export function roadRing(line: TessellatedLine): Ring {
    return [...line.left, ...[...line.right].reverse()];
}

function orient(a: Point, b: Point, c: Point): number {
    const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return Math.abs(v) < 1e-9 ? 0 : v;
}

/** Строгое пересечение: касания и общие концы не считаются */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Число самопересечений замкнутого кольца (O(n²), кольца небольшие) */
export function countSelfIntersections(ring: Ring): number {
    const n = ring.length;
    if (n < 4) return 0;

    let count = 0;
    for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue; // соседние через замыкание
            if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) count++;
        }
    }
    return count;
}

/** Минимальная длина ребра (замкнутого кольца или открытой полилинии) */
function minEdgeLength(points: readonly Point[], closed: boolean): number {
    let min = Infinity;
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
        min = Math.min(min, dist(points[i], points[(i + 1) % points.length]));
    }
    return min;
}

const isOnTileEdge = (p: Point, eps = 1e-6): boolean =>
    Math.abs(Math.abs(p[0]) - HALF) < eps || Math.abs(Math.abs(p[1]) - HALF) < eps;

/**
 * Насколько торцы дороги отклоняются от границы тайла.
 * Для каждого конца оси, лежащего на границе, левая и правая точки
 * должны иметь ту же координату по нормали к границе, что и ось.
 */
function roadEndGap(line: TessellatedLine): number {
    let gap = 0;
    const last = line.center.length - 1;

    for (const i of [0, last]) {
        const c = line.center[i];
        if (!c || !isOnTileEdge(c)) continue;
        const axis = Math.abs(Math.abs(c[0]) - HALF) < 1e-6 ? 0 : 1;
        gap = Math.max(
            gap,
            Math.abs(line.left[i][axis] - c[axis]),
            Math.abs(line.right[i][axis] - c[axis])
        );
    }
    return gap;
}

/**
 * Площадь частей площадей, не покрытых ни одной дорогой (юниты²).
 * Считается выборкой по сетке — без булевых операций.
 */
export function estimatePlazaExcessArea(
    plazas: readonly Ring[],
    lines: ReadonlyMap<string, TessellatedLine>,
    step = 0.5
): number {
    if (plazas.length === 0) return 0;

    const roadRings = [...lines.values()].map(roadRing);
    let count = 0;

    for (const plaza of plazas) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [x, y] of plaza) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        for (let x = minX + step / 2; x < maxX; x += step) {
            for (let y = minY + step / 2; y < maxY; y += step) {
                const point: Point = [x, y];
                if (!pointInRing(point, plaza)) continue;
                if (roadRings.some((ring) => pointInRing(point, ring))) continue;
                count++;
            }
        }
    }
    return count * step * step;
}

// ============================================
// 🔑 СИГНАТУРА ГЕОМЕТРИИ (FNV-1a)
// ============================================

/**
 * Стабильный хэш тесселяции с точностью до 0.001 юнита.
 * Меняется при любом изменении формы — удобно для снимков в тестах.
 */
export function geometrySignature(tessellation: TessellationResult): string {
    let h = 0x811c9dc5;
    const feed = (v: number): void => {
        const n = Math.round(v * 1000) | 0;
        for (let k = 0; k < 4; k++) {
            h ^= (n >>> (8 * k)) & 0xff;
            h = Math.imul(h, 16777619) >>> 0;
        }
    };
    const feedRing = (ring: readonly Point[]): void => {
        feed(ring.length);
        for (const [x, y] of ring) {
            feed(x);
            feed(y);
        }
    };

    for (const id of [...tessellation.areas.keys()].sort()) {
        for (const polygon of tessellation.areas.get(id)!) {
            for (const ring of polygon) feedRing(ring);
        }
    }
    for (const id of [...tessellation.lines.keys()].sort()) {
        const line = tessellation.lines.get(id)!;
        feedRing(line.left);
        feedRing(line.center);
        feedRing(line.right);
    }
    return h.toString(16).padStart(8, '0');
}

// ============================================
// 🔬 АУДИТ ГОТОВОГО РЕЗУЛЬТАТА ПРОЦЕССОРА
// ============================================

export interface AuditGeometryInput {
    readonly tileId: string;
    readonly artId?: string;
    readonly seed: string;
    readonly features: readonly TileFeature[];
    readonly result: TileGeometryResult;
    /** Параметры тесселяции — нужны, чтобы посчитать «чистую» форму без шума */
    readonly tessellation?: Partial<TessellationParams>;
    /** Параметры расчёта спотов (радиус мипла, точность, притяжение к центру) */
    readonly spots?: Partial<SpotParams>;
    readonly warnings?: readonly string[];
    readonly thresholds?: Partial<AuditThresholds>;
    readonly elapsedMs?: number;
}

/**
 * Считает метрики по уже готовому результату процессора.
 * Ничего не пересчитывает через булевы операции — поэтому подходит
 * для панели одиночного тайла, где результат уже есть.
 */
export function auditGeometry(input: AuditGeometryInput): TileAudit {
    const th: AuditThresholds = { ...DEFAULT_AUDIT_THRESHOLDS, ...input.thresholds };
    const { features, result } = input;
    const { tessellation, clipping, fields, assignments } = result;
    const issues: AuditIssue[] = [];

    for (const warning of input.warnings ?? []) {
        issues.push({ severity: 'error', code: 'generation', message: warning });
    }

    // --- Вершины ---
    const vertexCounts: Record<string, number> = {};
    for (const [id, multi] of tessellation.areas) {
        vertexCounts[id] = multi.reduce(
            (sum, polygon) => sum + polygon.reduce((acc, ring) => acc + ring.length, 0),
            0
        );
    }
    for (const [id, line] of tessellation.lines) vertexCounts[id] = line.center.length;
    const totalVertices = Object.values(vertexCounts).reduce((a, b) => a + b, 0);

    // --- Выход за тайл ---
    const outOfTile = measureOutOfTile(tessellation);
    if (outOfTile > th.outOfTile) {
        issues.push({
            severity: 'error',
            code: 'out-of-tile',
            message: `Геометрия выходит за тайл на ${outOfTile.toFixed(2)} ед.`,
        });
    }

    // --- Торцы дорог ---
    let maxGap = 0;
    for (const [id, line] of tessellation.lines) {
        const gap = roadEndGap(line);
        maxGap = Math.max(maxGap, gap);
        if (gap > th.roadEndGap) {
            issues.push({
                severity: 'error',
                code: 'road-end-gap',
                featureId: id,
                message: `Торец дороги "${id}" не лежит на границе тайла (зазор ${gap.toFixed(2)} ед.) — шов с соседом не сойдётся`,
            });
        }
    }

    // --- Самопересечения и слипшиеся вершины ---
    let selfIntersections = 0;
    let minSpacing = Infinity;

    for (const [id, multi] of tessellation.areas) {
        for (const polygon of multi) {
            for (const ring of polygon) {
                const crossings = countSelfIntersections(ring);
                selfIntersections += crossings;
                minSpacing = Math.min(minSpacing, minEdgeLength(ring, true));
                if (crossings > 0) {
                    issues.push({
                        severity: 'error',
                        code: 'self-intersection',
                        featureId: id,
                        message: `Контур "${id}" самопересекается (${crossings})`,
                    });
                }
            }
        }
    }
    for (const [id, line] of tessellation.lines) {
        const ring = roadRing(line);
        const crossings = countSelfIntersections(ring);
        selfIntersections += crossings;
        minSpacing = Math.min(minSpacing, minEdgeLength(line.center, false));
        if (crossings > 0) {
            issues.push({
                severity: 'error',
                code: 'self-intersection',
                featureId: id,
                message: `Контур дороги "${id}" самопересекается (${crossings}) — шум слишком сильный для радиуса изгиба или ширины`,
            });
        }
    }
    result.decorations.plazas.forEach((ring, index) => {
        const crossings = countSelfIntersections(ring);
        selfIntersections += crossings;
        if (crossings > 0) {
            issues.push({
                severity: 'error',
                code: 'self-intersection',
                featureId: `plaza_${index}`,
                message: `Контур площади #${index} самопересекается (${crossings})`,
            });
        }
    });
    const plazaExcessArea = estimatePlazaExcessArea(result.decorations.plazas, tessellation.lines);

    if (minSpacing < th.minSpacing) {
        issues.push({
            severity: 'warn',
            code: 'tight-spacing',
            message: `Есть почти совпадающие вершины (расстояние ${minSpacing.toFixed(3)} ед.)`,
        });
    }

    // --- Дрейф площади относительно формы без шума ---
    const areaDrift: Record<string, number> = {};
    let maxAreaDrift = 0;
    for (const feature of features) {
        const geo = feature.geometry;
        if (!geo) continue;

        let clean = 0;
        let noised = 0;
        if (geo.kind === 'area') {
            const multi = tessellation.areas.get(feature.id);
            if (!multi) continue;
            clean = ringArea(tessellateArea(geo, input.tessellation));
            noised = multi.reduce((sum, polygon) => sum + ringArea(polygon[0]), 0);
        } else if (geo.kind === 'line') {
            const line = tessellation.lines.get(feature.id);
            if (!line) continue;
            clean = ringArea(roadRing(tessellateLine(geo, input.tessellation)));
            noised = ringArea(roadRing(line));
        } else {
            continue;
        }

        if (clean <= 0) continue;
        const drift = Math.abs(noised - clean) / clean;
        areaDrift[feature.id] = drift;
        maxAreaDrift = Math.max(maxAreaDrift, drift);
        if (drift > th.maxAreaDrift) {
            issues.push({
                severity: 'warn',
                code: 'area-drift',
                featureId: feature.id,
                message: `Шум изменил площадь "${feature.id}" на ${(drift * 100).toFixed(0)}%`,
            });
        }
    }

    // --- Наличие геометрии у каждой фичи ---
    for (const feature of features) {
        const kind = feature.geometry?.kind;

        if (feature.type === 'field') {
            const assigned = assignments.fieldGeometries.get(feature.id);
            if (!assigned || assigned.length === 0) {
                issues.push({
                    severity: 'error',
                    code: 'field-unassigned',
                    featureId: feature.id,
                    message: `Поле "${feature.id}" не получило полигон (проверьте meepleSpot и геометрию соседей)`,
                });
            }
            continue;
        }

        if (kind === 'area') {
            if (!tessellation.areas.has(feature.id)) {
                issues.push({
                    severity: 'error',
                    code: 'missing-geometry',
                    featureId: feature.id,
                    message: `Нет контура у "${feature.id}"`,
                });
            }
        } else if (kind === 'line') {
            if (!tessellation.lines.has(feature.id)) {
                issues.push({
                    severity: 'error',
                    code: 'missing-geometry',
                    featureId: feature.id,
                    message: `Нет оси у дороги "${feature.id}"`,
                });
            } else if ((clipping.clippedLines.get(feature.id)?.length ?? 0) === 0) {
                issues.push({
                    severity: 'warn',
                    code: 'road-clipped',
                    featureId: feature.id,
                    message: `Дорога "${feature.id}" полностью вырезана городами/площадями`,
                });
            }
        } else if (feature.type === 'city' || feature.type === 'road' || feature.type === 'monastery') {
            issues.push({
                severity: 'error',
                code: 'missing-geometry',
                featureId: feature.id,
                message: `У "${feature.id}" (${feature.type}) нет геометрии`,
            });
        }
    }

    // --- Споты: считаются из итоговой геометрии ---
    const spotParams = resolveSpotParams(input.spots);
    const spots = computeTileSpots(features, result, spotParams);
    const spotDeltas: Record<string, number> = {};
    let minSpotClearance = Infinity;

    for (const feature of features) {
        if (feature.type !== 'city' && feature.type !== 'road' && feature.type !== 'monastery' && feature.type !== 'field') {
            continue;
        }
        const spot = spots.get(feature.id);
        const alreadyBroken = issues.some(
            (i) => i.severity === 'error' && i.featureId === feature.id
        );

        if (!spot) {
            if (!alreadyBroken) {
                issues.push({
                    severity: 'error',
                    code: 'spot-missing',
                    featureId: feature.id,
                    message: `Не удалось вычислить спот мипла для "${feature.id}"`,
                });
            }
            continue;
        }

        minSpotClearance = Math.min(minSpotClearance, spot.clearance);
        if (spot.clearance < spotParams.meepleRadius) {
            issues.push({
                severity: 'warn',
                code: 'spot-tight',
                featureId: feature.id,
                message:
                    `Фигурка не помещается в "${feature.id}": запас ${spot.clearance.toFixed(1)} ` +
                    `< радиуса мипла ${spotParams.meepleRadius}`,
            });
        }
        if (spot.shieldClearance !== undefined && spot.shieldClearance < 0) {
            issues.push({
                severity: 'warn',
                code: 'spot-tight',
                featureId: feature.id,
                message: `Щит в "${feature.id}" перекрывает мипла или выходит за город (запас ${spot.shieldClearance.toFixed(1)})`,
            });
        }

        const rawManual = feature.meepleSpot as unknown;
        const manual = (Array.isArray(rawManual) ? rawManual[0] : rawManual) as { x: number; y: number } | undefined;
        if (manual && typeof manual.x === 'number' && typeof manual.y === 'number') {
            spotDeltas[feature.id] = Math.hypot(spot.meeple[0] - manual.x, spot.meeple[1] - manual.y);
        }
    }

    // Поля, привязанные только запасным способом (по meepleSpot): без ручных спотов они бы потерялись
    for (const [fieldId, method] of assignments.fieldBinding ?? []) {
        if (method === 'spot') {
            issues.push({
                severity: 'warn',
                code: 'field-binding-fallback',
                featureId: fieldId,
                message: `Поле "${fieldId}" нашло полигон только по meepleSpot (порты не совпали с границей)`,
            });
        }
    }

    const assignedCount = [...assignments.fieldGeometries.values()].reduce(
        (sum, multi) => sum + multi.length,
        0
    );
    const leftover = fields.fieldPolygons.length - assignedCount;
    if (leftover > 0) {
        issues.push({
            severity: 'warn',
            code: 'field-unassigned',
            message: `Осталось нераспределённых полигонов поля: ${leftover}`,
        });
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;

    return {
        tileId: input.tileId,
        artId: input.artId ?? input.tileId,
        seed: input.seed,
        features,
        geometry: result,
        vertexCounts,
        totalVertices,
        outOfTile,
        roadEndGap: maxGap,
        selfIntersections,
        minSpacing: Number.isFinite(minSpacing) ? minSpacing : 0,
        spots,
        spotDeltas,
        minSpotClearance: Number.isFinite(minSpotClearance) ? minSpotClearance : 0,
        plazaExcessArea,
        areaDrift,
        maxAreaDrift,
        signature: geometrySignature(tessellation),
        issues,
        errorCount,
        warnCount: issues.length - errorCount,
        elapsedMs: input.elapsedMs ?? 0,
    };
}

// ============================================
// 🏭 АУДИТ ТАЙЛА «С НУЛЯ» (генерация + процессор + метрики)
// ============================================

/**
 * Те же настройки, что и в песочнице.
 *
 * Приоритет значений: явные поля ниже → `geometryParams` (в нём ещё и настройки
 * конкретного тайла по artId) → значения по умолчанию в коде.
 */
export interface AuditPipelineOptions {
    /** Полный набор параметров из geometryParams.json (или из песочницы) */
    readonly geometryParams?: GeometryParams;
    /** Генерировать геометрию из портов (по умолчанию true) */
    readonly enableGenerative?: boolean;
    /** Перегенерировать поверх ручной геометрии (по умолчанию false) */
    readonly overwrite?: boolean;
    readonly roadWidth?: number;
    /** Включить шум (по умолчанию true) */
    readonly noiseEnabled?: boolean;
    /** Общий seed вместо artId (для сравнения seed на всех тайлах) */
    readonly seedOverride?: string;
    readonly noise?: Partial<NoiseSettings>;
    /** Настройки шума по типу фичи (город / монастырь / дорога) */
    readonly noiseByType?: NoiseByType;
    readonly tessellation?: Partial<TessellationParams>;
    /** Параметры площадей на перекрёстках */
    readonly plaza?: Partial<PlazaParams>;
    /** Параметры расчёта спотов мипла и щита */
    readonly spots?: Partial<SpotParams>;
    readonly thresholds?: Partial<AuditThresholds>;
    /** Заглушить консольные логи пайплайна (по умолчанию true) */
    readonly quiet?: boolean;
}

export function auditTile(tile: AuditTile, options: AuditPipelineOptions = {}): TileAudit {
    const run = (): TileAudit => {
        const started = performance.now();
        const artKey = tile.artId ?? tile.id;

        // Параметры тайла: общие + его собственные (seed, шум) из geometryParams
        const params = options.geometryParams;
        const forTile = params ? resolveTileParams(params, artKey) : undefined;

        const seed = options.seedOverride?.trim() || forTile?.seed || artKey;
        const noise = { ...forTile?.noise, ...options.noise };
        const noiseByType = options.noiseByType ?? forTile?.noiseByType;
        const tessellation = { ...params?.tessellation, ...options.tessellation };
        const plaza = { ...params?.plaza, ...options.plaza };
        const spotParams = { ...params?.spots, ...options.spots };

        let features: readonly TileFeature[] = tile.features;
        const warnings: string[] = [];

        if (options.enableGenerative ?? true) {
            const generated = generateFeatureGeometries(tile.features, {
                overwrite: options.overwrite ?? params?.generation.overwrite ?? false,
                roadWidth: options.roadWidth ?? params?.generation.roadWidth,
            });
            warnings.push(...generated.warnings);
            features = tile.features.map((feature) => {
                const geometry = generated.geometries.get(feature.id);
                return geometry ? { ...feature, geometry } : feature;
            });
        }

        const result = processTileGeometry(features, {
            noiseSeed: (options.noiseEnabled ?? true) ? seed : undefined,
            noise: { ...noise, byType: noiseByType },
            tessellation,
            plaza,
        });

        return auditGeometry({
            tileId: tile.id,
            artId: tile.artId,
            seed,
            features,
            result,
            tessellation,
            spots: spotParams,
            warnings,
            thresholds: options.thresholds,
            elapsedMs: performance.now() - started,
        });
    };

    return (options.quiet ?? true) ? withQuietConsole(run) : run();
}

export function auditTiles(
    tiles: readonly AuditTile[],
    options: AuditPipelineOptions = {}
): TileAudit[] {
    return tiles.map((tile) => auditTile(tile, options));
}

export interface AuditSummary {
    readonly tiles: number;
    readonly tilesWithErrors: number;
    readonly tilesWithWarnings: number;
    readonly errors: number;
    readonly warnings: number;
    readonly totalVertices: number;
    readonly elapsedMs: number;
}

export function summarizeAudits(audits: readonly TileAudit[]): AuditSummary {
    return {
        tiles: audits.length,
        tilesWithErrors: audits.filter((a) => a.errorCount > 0).length,
        tilesWithWarnings: audits.filter((a) => a.errorCount === 0 && a.warnCount > 0).length,
        errors: audits.reduce((sum, a) => sum + a.errorCount, 0),
        warnings: audits.reduce((sum, a) => sum + a.warnCount, 0),
        totalVertices: audits.reduce((sum, a) => sum + a.totalVertices, 0),
        elapsedMs: audits.reduce((sum, a) => sum + a.elapsedMs, 0),
    };
}

// ============================================
// 🧱 ДОСКА ДЛЯ ТЕСТА ШВОВ
// ============================================

export interface PlacedTile {
    readonly tile: AuditTile;
    readonly col: number;
    readonly row: number;
    readonly rotation: Rotation;
}

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
const PORTS_COUNT = 12;

/** Тип фичи на каждом из 12 портов (свободные порты = поле) */
function portTypes(features: readonly TileFeature[]): FeatureType[] {
    const types: FeatureType[] = new Array(PORTS_COUNT).fill('field');
    for (const feature of features) {
        for (const port of feature.ports ?? []) types[port] = feature.type;
    }
    return types;
}

function rotatedPortTypes(tile: AuditTile, rotation: Rotation): FeatureType[] {
    const base = portTypes(tile.features);
    const rotated: FeatureType[] = new Array(PORTS_COUNT).fill('field');
    for (let port = 0; port < PORTS_COUNT; port++) {
        rotated[rotatePort(port, rotation)] = base[port];
    }
    return rotated;
}

interface Candidate {
    readonly tile: AuditTile;
    readonly rotation: Rotation;
    readonly ports: readonly FeatureType[];
}

/** Подходит ли кандидат: его W/N стороны должны стыковаться с E/S соседей */
function fits(candidate: Candidate, left?: Candidate, up?: Candidate): boolean {
    if (left) {
        for (const port of [3, 4, 5]) {
            if (left.ports[port] !== candidate.ports[getStitchedPort(port)]) return false;
        }
    }
    if (up) {
        for (const port of [6, 7, 8]) {
            if (up.ports[port] !== candidate.ports[getStitchedPort(port)]) return false;
        }
    }
    return true;
}

/**
 * Случайная доска cols × rows с совпадающими портами (перебор с откатом).
 * Детерминирована по seed. Возвращает null, если уложиться в maxSteps не удалось.
 */
export function generateSeamBoard(
    tiles: readonly AuditTile[],
    cols: number,
    rows: number,
    seed: string,
    maxSteps = 50_000
): PlacedTile[] | null {
    if (tiles.length === 0 || cols < 1 || rows < 1) return null;

    const rng = createSeededRandom(seed);
    const candidates: Candidate[] = tiles.flatMap((tile) =>
        ROTATIONS.map((rotation) => ({ tile, rotation, ports: rotatedPortTypes(tile, rotation) }))
    );

    const shuffled = (): Candidate[] => {
        const copy = [...candidates];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    const placed: Candidate[] = new Array(cols * rows);
    let steps = 0;

    const place = (index: number): boolean => {
        if (index === cols * rows) return true;
        const col = index % cols;
        const left = col > 0 ? placed[index - 1] : undefined;
        const up = index >= cols ? placed[index - cols] : undefined;

        for (const candidate of shuffled()) {
            if (++steps > maxSteps) return false;
            if (!fits(candidate, left, up)) continue;
            placed[index] = candidate;
            if (place(index + 1)) return true;
        }
        return false;
    };

    if (!place(0)) return null;

    return placed.map((c, index) => ({
        tile: c.tile,
        col: index % cols,
        row: Math.floor(index / cols),
        rotation: c.rotation,
    }));
}

// ============================================
// 🧵 ПРОВЕРКА ШВОВ
// ============================================

export type SurfaceType = 'city' | 'monastery' | 'road' | 'field';

/**
 * Что находится в точке (локальные координаты тайла без поворота).
 * Приоритет как при отрисовке: город/монастырь → дорога → поле.
 * Не зависит от булевых операций — только от тесселяции.
 */
export function classifySurface(audit: TileAudit, local: Point): SurfaceType {
    const { areas, lines } = audit.geometry.tessellation;

    for (const feature of audit.features) {
        if (feature.type !== 'city' && feature.type !== 'monastery') continue;
        const multi = areas.get(feature.id);
        if (multi && multiPolygonContainsPoint(multi, local)) return feature.type;
    }
    for (const feature of audit.features) {
        if (feature.type !== 'road') continue;
        const line = lines.get(feature.id);
        if (line && pointInRing(local, roadRing(line))) return 'road';
    }
    return 'field';
}

/** Мировая точка → локальные координаты тайла без поворота (точно для кратных 90°) */
const ROTATION_COS_SIN: Record<Rotation, readonly [number, number]> = {
    0: [1, 0],
    90: [0, 1],
    180: [-1, 0],
    270: [0, -1],
};

function toLocal(world: Point, placed: PlacedTile): Point {
    const x = world[0] - placed.col * 100;
    const y = world[1] - placed.row * 100;
    const [c, s] = ROTATION_COS_SIN[placed.rotation];
    return [x * c + y * s, -x * s + y * c];
}

export interface SeamPair {
    /** Индексы в массиве PlacedTile */
    readonly a: number;
    readonly b: number;
    readonly axis: 'horizontal' | 'vertical';
    readonly mismatchFraction: number;
    /** Диапазоны несовпадения в мировых координатах (для отрисовки) */
    readonly mismatchSegments: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }>;
    /** Что и где не совпало: «road ≠ field» */
    readonly kinds: readonly string[];
}

export interface SeamReport {
    readonly pairs: readonly SeamPair[];
    readonly badPairs: number;
    readonly worstFraction: number;
    readonly mismatchedSamples: number;
    readonly totalSamples: number;
}

export interface SeamOptions {
    /** Выборок на одно ребро */
    readonly samples?: number;
    /** Отступ от ребра внутрь каждого тайла, юниты */
    readonly inset?: number;
    /** Отступ от углов тайла, где дуги городов сходят в точку, юниты */
    readonly cornerTrim?: number;
    /** Допустимая доля несовпадений на ребро */
    readonly tolerance?: number;
}

/**
 * Для каждой пары соседей сравнивает тип поверхности по обе стороны ребра.
 * Т.к. порты у соседей совпадают, расхождение = дефект геометрии.
 */
export function auditSeams(
    placed: readonly PlacedTile[],
    audits: ReadonlyMap<string, TileAudit>,
    options: SeamOptions = {}
): SeamReport {
    const samples = options.samples ?? 100;
    const inset = options.inset ?? 0.5;
    const trim = options.cornerTrim ?? 2;
    const tolerance = options.tolerance ?? DEFAULT_AUDIT_THRESHOLDS.seamMismatchFraction;

    const byCell = new Map<string, number>();
    placed.forEach((p, index) => byCell.set(`${p.col},${p.row}`, index));

    const pairs: SeamPair[] = [];
    let mismatchedSamples = 0;
    let totalSamples = 0;
    let worstFraction = 0;
    let badPairs = 0;

    const compare = (aIndex: number, bIndex: number, axis: 'horizontal' | 'vertical'): void => {
        const a = placed[aIndex];
        const b = placed[bIndex];
        const auditA = audits.get(a.tile.id);
        const auditB = audits.get(b.tile.id);
        if (!auditA || !auditB) return;

        const span = 100 - 2 * trim;
        const flags: boolean[] = [];
        const kinds = new Set<string>();
        const positions: number[] = [];

        for (let k = 0; k < samples; k++) {
            const t = -50 + trim + ((k + 0.5) * span) / samples;
            positions.push(t);

            const [pa, pb]: [Point, Point] =
                axis === 'horizontal'
                    ? [
                        [a.col * 100 + 50 - inset, a.row * 100 + t],
                        [a.col * 100 + 50 + inset, a.row * 100 + t],
                    ]
                    : [
                        [a.col * 100 + t, a.row * 100 + 50 - inset],
                        [a.col * 100 + t, a.row * 100 + 50 + inset],
                    ];

            const typeA = classifySurface(auditA, toLocal(pa, a));
            const typeB = classifySurface(auditB, toLocal(pb, b));
            const bad = typeA !== typeB;
            flags.push(bad);
            if (bad) kinds.add(`${typeA} ≠ ${typeB}`);
        }

        // Склеиваем подряд идущие несовпадения в отрезки
        const segments: SeamPair['mismatchSegments'][number][] = [];
        let start = -1;
        for (let k = 0; k <= samples; k++) {
            const bad = k < samples && flags[k];
            if (bad && start < 0) start = k;
            if (!bad && start >= 0) {
                const t1 = positions[start] - span / samples / 2;
                const t2 = positions[k - 1] + span / samples / 2;
                segments.push(
                    axis === 'horizontal'
                        ? { x1: a.col * 100 + 50, y1: a.row * 100 + t1, x2: a.col * 100 + 50, y2: a.row * 100 + t2 }
                        : { x1: a.col * 100 + t1, y1: a.row * 100 + 50, x2: a.col * 100 + t2, y2: a.row * 100 + 50 }
                );
                start = -1;
            }
        }

        const bad = flags.filter(Boolean).length;
        const fraction = bad / samples;
        mismatchedSamples += bad;
        totalSamples += samples;
        worstFraction = Math.max(worstFraction, fraction);
        if (fraction > tolerance) badPairs++;

        pairs.push({
            a: aIndex,
            b: bIndex,
            axis,
            mismatchFraction: fraction,
            mismatchSegments: segments,
            kinds: [...kinds],
        });
    };

    placed.forEach((p, index) => {
        const right = byCell.get(`${p.col + 1},${p.row}`);
        const below = byCell.get(`${p.col},${p.row + 1}`);
        if (right !== undefined) compare(index, right, 'horizontal');
        if (below !== undefined) compare(index, below, 'vertical');
    });

    return { pairs, badPairs, worstFraction, mismatchedSamples, totalSamples };
}

// ============================================
// 📋 ТЕКСТОВЫЙ ОТЧЁТ (для буфера обмена)
// ============================================

export function formatAuditReport(
    audits: readonly TileAudit[],
    seams?: SeamReport
): string {
    const s = summarizeAudits(audits);
    const lines: string[] = [
        `Аудит геометрии: тайлов ${s.tiles}, с ошибками ${s.tilesWithErrors}, ` +
        `только с предупреждениями ${s.tilesWithWarnings}, вершин ${s.totalVertices}`,
    ];

    for (const audit of audits) {
        if (audit.issues.length === 0) continue;
        lines.push(`\n${audit.tileId} (seed "${audit.seed}")`);
        for (const issue of audit.issues) {
            lines.push(`  ${issue.severity === 'error' ? '✖' : '⚠'} [${issue.code}] ${issue.message}`);
        }
    }

    if (seams) {
        lines.push(
            `\nШвы: пар ${seams.pairs.length}, с расхождением ${seams.badPairs}, ` +
            `худшая доля ${(seams.worstFraction * 100).toFixed(1)}%`
        );
    }
    return lines.join('\n');
}
