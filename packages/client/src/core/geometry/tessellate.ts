// packages/client/src/core/geometry/tessellate.ts
// ============================================
// 📐 АДАПТИВНАЯ ТЕССЕЛЯЦИЯ КРИВЫХ В ПОЛИЛИНИИ
// ============================================
// 🌟 ЧТО ИЗМЕНИЛОСЬ В ЭТОЙ ВЕРСИИ:
//   • Все параметры вынесены в `TessellationParams` и могут
//     передаваться в каждую функцию (песочница крутит их ползунками)
//   • `maxRingPoints` теперь действительно работает
//     (раньше был объявлен, но нигде не использовался)
//   • Сегмент `close` тесселируется как обычная прямая
//     (раньше замыкающее ребро оставалось одним длинным отрезком)
//   • Дубликат «последняя точка == стартовая» убирается
//   • `ensureMinPoints` дробит самые длинные рёбра, а не
//     пересэмплирует кольцо — углы больше не «съедаются»
//   • Рёбра, лежащие ровно на границе тайла, можно не дробить
//     (`subdivideBoundaryEdges: false`) — меньше вершин, тот же результат
//   • Нормали дороги вынесены в `computeLineNormals` — их использует и
//     тесселяция, и пост-процессор шума (единый источник истины)
// ============================================
import type {
    Point,
    Ring,
    AreaGeometry,
    LineGeometry,
    OutlineSegment,
    PathSegment,
} from '@fiefdom/shared/core/geometry.types';
import { HALF } from './generators/sides';

// ============================================
// ⚙️ ПАРАМЕТРЫ ТЕССЕЛЯЦИИ
// ============================================
export interface TessellationParams {
    /** Сегментов на юнит длины кривой Безье (больше = плотнее) */
    curveDensity: number;
    /** Минимум сегментов на одну кривую Безье */
    minCurveSegments: number;
    /** Максимум сегментов на одну кривую Безье */
    maxCurveSegments: number;
    /** Подотрезков на юнит длины прямой (больше = плотнее для шума) */
    lineDensity: number;
    /** Прямые короче этого порога (юниты) не разбиваются */
    lineSubdivideThreshold: number;
    /** Дробить ли рёбра, лежащие на границе тайла (на шум они не влияют) */
    subdivideBoundaryEdges: boolean;
    /** Минимум точек в замкнутом кольце (чтобы шум не ломал форму) */
    minRingPoints: number;
    /** Максимум точек в замкнутом кольце (защита от перфоманса) */
    maxRingPoints: number;
    /** Минимум точек на осевой линии дороги (нужен для нормалей) */
    minLinePoints: number;
}

export const DEFAULT_TESSELLATION_PARAMS: Readonly<TessellationParams> = {
    curveDensity: 0.3,
    minCurveSegments: 4,
    maxCurveSegments: 32,
    lineDensity: 0.3,
    lineSubdivideThreshold: 4,
    subdivideBoundaryEdges: true,
    minRingPoints: 12,
    maxRingPoints: 512,
    minLinePoints: 4,
};

/** Совместимость со старым именем. Используйте `DEFAULT_TESSELLATION_PARAMS`. */
export const TESSELLATION_CONFIG = DEFAULT_TESSELLATION_PARAMS;

/** @deprecated Используйте `DEFAULT_TESSELLATION_PARAMS`. Оставлено для совместимости. */
export const TESSELLATION = 8;

const finite = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Достраивает частичные параметры значениями по умолчанию
 * и приводит их к допустимым диапазонам.
 */
export function resolveTessellationParams(
    partial?: Partial<TessellationParams>
): TessellationParams {
    const d = DEFAULT_TESSELLATION_PARAMS;

    const minCurve = Math.max(1, Math.round(finite(partial?.minCurveSegments, d.minCurveSegments)));
    const maxCurve = Math.max(minCurve, Math.round(finite(partial?.maxCurveSegments, d.maxCurveSegments)));
    const minRing = Math.max(3, Math.round(finite(partial?.minRingPoints, d.minRingPoints)));
    const maxRing = Math.max(minRing, Math.round(finite(partial?.maxRingPoints, d.maxRingPoints)));

    return {
        curveDensity: Math.max(0.01, finite(partial?.curveDensity, d.curveDensity)),
        minCurveSegments: minCurve,
        maxCurveSegments: maxCurve,
        lineDensity: Math.max(0.01, finite(partial?.lineDensity, d.lineDensity)),
        lineSubdivideThreshold: Math.max(0, finite(partial?.lineSubdivideThreshold, d.lineSubdivideThreshold)),
        subdivideBoundaryEdges: partial?.subdivideBoundaryEdges ?? d.subdivideBoundaryEdges,
        minRingPoints: minRing,
        maxRingPoints: maxRing,
        minLinePoints: Math.max(2, Math.round(finite(partial?.minLinePoints, d.minLinePoints))),
    };
}

// ============================================
// 📐 ХЕЛПЕРЫ: ДЛИНА И РАЗБИВКА
// ============================================

/** Расстояние между двумя точками */
function dist(a: Point, b: Point): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

/** Приближённая длина квадратичной кривой Безье (хорда + контрольный полигон) / 2 */
function quadCurveLength(p0: Point, cp: Point, p1: Point): number {
    return (dist(p0, p1) + dist(p0, cp) + dist(cp, p1)) / 2;
}

/** Приближённая длина кубической кривой Безье */
function cubicCurveLength(p0: Point, c1: Point, c2: Point, p1: Point): number {
    return (dist(p0, p1) + dist(p0, c1) + dist(c1, c2) + dist(c2, p1)) / 2;
}

/**
 * Количество сегментов кривой по её длине.
 * `scale` < 1 используется для автоматического снижения плотности
 * при превышении `maxRingPoints`.
 */
function curveSegments(length: number, p: TessellationParams, scale: number): number {
    const n = Math.ceil(length * p.curveDensity * scale);
    return Math.max(p.minCurveSegments, Math.min(p.maxCurveSegments, n));
}

/** Лежит ли отрезок целиком на одной стороне тайла */
function isBoundaryEdge(a: Point, b: Point): boolean {
    const eps = 1e-6;
    const onX = Math.abs(Math.abs(a[0]) - HALF) < eps && Math.abs(a[0] - b[0]) < eps;
    const onY = Math.abs(Math.abs(a[1]) - HALF) < eps && Math.abs(a[1] - b[1]) < eps;
    return onX || onY;
}

/** Количество подотрезков для прямой линии */
function lineSegments(a: Point, b: Point, p: TessellationParams, scale: number): number {
    if (!p.subdivideBoundaryEdges && isBoundaryEdge(a, b)) return 1;
    const length = dist(a, b);
    if (length < p.lineSubdivideThreshold) return 1;
    return Math.max(1, Math.ceil(length * p.lineDensity * scale));
}

// ============================================
// 📐 ТОЧКИ НА КРИВЫХ
// ============================================

function quadAt(p0: Point, cp: Point, p1: Point, t: number): Point {
    const mt = 1 - t;
    return [
        mt * mt * p0[0] + 2 * mt * t * cp[0] + t * t * p1[0],
        mt * mt * p0[1] + 2 * mt * t * cp[1] + t * t * p1[1],
    ];
}

function cubicAt(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return [
        mt2 * mt * p0[0] + 3 * mt2 * t * c1[0] + 3 * mt * t2 * c2[0] + t2 * t * p1[0],
        mt2 * mt * p0[1] + 3 * mt2 * t * c1[1] + 3 * mt * t2 * c2[1] + t2 * t * p1[1],
    ];
}

function lineAt(p0: Point, p1: Point, t: number): Point {
    return [
        p0[0] + (p1[0] - p0[0]) * t,
        p0[1] + (p1[1] - p0[1]) * t,
    ];
}

// ============================================
// 🧩 АДАПТИВНЫЙ ИТЕРАТОР ПО СЕГМЕНТАМ
// ============================================

interface RawTessellation {
    readonly points: Point[];
    /** true для «опорных» точек (концы сегментов), false для промежуточных */
    readonly anchors: boolean[];
}

/**
 * Развёртывает массив сегментов в плоский массив точек.
 *
 * @param closed Контур замкнут: `close` дробит замыкающее ребро,
 *               а совпадающая с началом последняя точка отбрасывается.
 */
function tessellateSegments(
    segments: readonly (OutlineSegment | PathSegment)[],
    start: Point,
    p: TessellationParams,
    scale: number,
    closed: boolean
): RawTessellation {
    const points: Point[] = [start];
    const anchors: boolean[] = [true];
    let current = start;

    const push = (pt: Point, anchor: boolean): void => {
        points.push(pt);
        anchors.push(anchor);
    };

    for (const seg of segments) {
        switch (seg.type) {
            case 'line': {
                const n = lineSegments(current, seg.to, p, scale);
                for (let i = 1; i <= n; i++) {
                    push(i === n ? seg.to : lineAt(current, seg.to, i / n), i === n);
                }
                current = seg.to;
                break;
            }

            case 'quadratic': {
                const n = curveSegments(quadCurveLength(current, seg.cp, seg.to), p, scale);
                for (let i = 1; i <= n; i++) {
                    push(i === n ? seg.to : quadAt(current, seg.cp, seg.to, i / n), i === n);
                }
                current = seg.to;
                break;
            }

            case 'bezier': {
                const n = curveSegments(cubicCurveLength(current, seg.cp1, seg.cp2, seg.to), p, scale);
                for (let i = 1; i <= n; i++) {
                    push(i === n ? seg.to : cubicAt(current, seg.cp1, seg.cp2, seg.to, i / n), i === n);
                }
                current = seg.to;
                break;
            }

            case 'close': {
                // Замыкающее ребро current → start. Сама стартовая точка
                // уже лежит в points[0], поэтому дробим без финальной точки.
                if (dist(current, start) > 1e-6) {
                    const n = lineSegments(current, start, p, scale);
                    for (let i = 1; i < n; i++) {
                        push(lineAt(current, start, i / n), false);
                    }
                    current = start;
                }
                break;
            }

            case 'arc':
                // Арки пока обрабатываем как прямые
                push(seg.to, true);
                current = seg.to;
                break;
        }
    }

    // Контур явно вернулся в начало → убираем дубликат
    if (closed && points.length > 2 && dist(points[points.length - 1], points[0]) < 1e-6) {
        points.pop();
        anchors.pop();
    }

    return { points, anchors };
}

// ============================================
// 📏 ОГРАНИЧЕНИЕ ЧИСЛА ТОЧЕК
// ============================================

/**
 * Равномерно выбрасывает промежуточные (не опорные) точки,
 * пока их количество не уложится в `max`. Углы сохраняются.
 */
function decimate(raw: RawTessellation, max: number): Point[] {
    const excess = raw.points.length - max;
    if (excess <= 0) return raw.points;

    const removable: number[] = [];
    raw.anchors.forEach((isAnchor, i) => {
        if (!isAnchor) removable.push(i);
    });

    const drop = new Set<number>();
    if (removable.length <= excess) {
        removable.forEach(i => drop.add(i));
    } else {
        const step = removable.length / excess;
        for (let k = 0; k < excess; k++) {
            drop.add(removable[Math.floor(k * step)]);
        }
    }

    return raw.points.filter((_, i) => !drop.has(i));
}

/**
 * Тесселирует замкнутый контур с соблюдением `maxRingPoints`:
 * сначала снижает плотность, потом, если не хватило, прореживает.
 */
function tessellateClosed(
    segments: readonly OutlineSegment[],
    start: Point,
    p: TessellationParams
): Point[] {
    let scale = 1;
    let raw = tessellateSegments(segments, start, p, scale, true);

    for (let iter = 0; iter < 6 && raw.points.length > p.maxRingPoints; iter++) {
        scale *= Math.max(0.2, (p.maxRingPoints / raw.points.length) * 0.9);
        raw = tessellateSegments(segments, start, p, scale, true);
    }

    return decimate(raw, p.maxRingPoints);
}

// ============================================
// 📏 ДОБАВЛЕНИЕ ТОЧЕК ДО МИНИМУМА
// ============================================

/**
 * Вставляет середины самых длинных рёбер, пока точек меньше `minCount`.
 * В отличие от пересэмплирования, не трогает существующие вершины,
 * поэтому углы остаются на месте.
 */
function subdivideLongestEdges(points: readonly Point[], minCount: number, closed: boolean): Point[] {
    const result: Point[] = [...points];
    if (result.length < 2) return result;

    while (result.length < minCount) {
        const edgeCount = closed ? result.length : result.length - 1;
        let bestIdx = -1;
        let bestLen = 1e-6;

        for (let i = 0; i < edgeCount; i++) {
            const len = dist(result[i], result[(i + 1) % result.length]);
            if (len > bestLen) {
                bestLen = len;
                bestIdx = i;
            }
        }

        if (bestIdx < 0) break; // все рёбра нулевой длины
        const a = result[bestIdx];
        const b = result[(bestIdx + 1) % result.length];
        result.splice(bestIdx + 1, 0, lineAt(a, b, 0.5));
    }

    return result;
}

// ============================================
// 🏛️ AREA: замкнутая область → Ring
// ============================================

/**
 * Преобразует `AreaGeometry` в Ring (замкнутый контур).
 * Адаптивная разбивка + гарантия минимума и максимума точек.
 */
export function tessellateArea(
    geo: AreaGeometry,
    params?: Partial<TessellationParams>
): Ring {
    const p = resolveTessellationParams(params);
    const ring = tessellateClosed(geo.outline, geo.start, p);
    return subdivideLongestEdges(ring, p.minRingPoints, true);
}

// ============================================
// 🛤️ LINE: путь → TessellatedLine
// ============================================

/** Результат тесселяции дороги */
export interface TessellatedLine {
    /** Центральная осевая линия */
    center: Ring;
    /** Левый контур (смещён на +halfWidth по нормали) */
    left: Ring;
    /** Правый контур (смещён на -halfWidth по нормали) */
    right: Ring;
    /** Половина ширины дороги (юниты) */
    halfWidth: number;
}

/**
 * Единичные нормали вдоль открытой полилинии.
 * Нормаль строится по разности соседних точек (центральная разность,
 * на концах — односторонняя). Для нулевой длины берётся предыдущая нормаль.
 *
 * Единственная реализация: её используют и тесселяция дороги,
 * и пост-процессор шума, поэтому их результаты согласованы бит-в-бит.
 */
export function computeLineNormals(points: readonly Point[]): Point[] {
    const n = points.length;
    const normals: Point[] = new Array(n);
    let last: Point = [0, 0];

    for (let i = 0; i < n; i++) {
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(n - 1, i + 1)];
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len >= 1e-9) {
            last = [-dy / len, dx / len];
        }
        normals[i] = last;
    }

    return normals;
}

/**
 * Преобразует `LineGeometry` в три полилинии (ось + левый + правый контуры).
 */
export function tessellateLine(
    geo: LineGeometry,
    params?: Partial<TessellationParams>
): TessellatedLine {
    const p = resolveTessellationParams(params);
    const raw = tessellateSegments(geo.path, geo.start, p, 1, false);

    // Дорога не замкнута, но для корректных нормалей нужно достаточно точек
    const center = subdivideLongestEdges(raw.points, p.minLinePoints, false);

    const halfWidth = geo.lineWidth / 2;
    const normals = computeLineNormals(center);
    const left: Point[] = new Array(center.length);
    const right: Point[] = new Array(center.length);

    for (let i = 0; i < center.length; i++) {
        const [cx, cy] = center[i];
        const [nx, ny] = normals[i];
        left[i] = [cx + nx * halfWidth, cy + ny * halfWidth];
        right[i] = [cx - nx * halfWidth, cy - ny * halfWidth];
    }

    return { center, left, right, halfWidth };
}

// ============================================
// 🏗️ УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ ЛЮБОЙ ФИЧИ
// ============================================

/**
 * Тесселирует любую фичу в Ring (замкнутый контур).
 * Для `area` — возвращает outline.
 * Для `line` — возвращает left + reverse(right).
 */
export function tessellateFeature(
    geometry: AreaGeometry | LineGeometry,
    params?: Partial<TessellationParams>
): Ring {
    if (geometry.kind === 'area') {
        return tessellateArea(geometry, params);
    }
    const { left, right } = tessellateLine(geometry, params);
    return [...left, ...[...right].reverse()];
}
