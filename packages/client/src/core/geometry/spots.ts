// packages/client/src/core/geometry/spots.ts
// ============================================
// 📍 АВТОМАТИЧЕСКИЕ СПОТЫ МИПЛА И ЩИТА
// ============================================
// Раньше споты были прописаны в base.json вручную и не знали о шуме:
// после искажения контуров мипл мог оказаться у края или вне фичи.
// Теперь они вычисляются из итоговой геометрии:
//
//   • город, монастырь, поле — «полюс недоступности»: точка внутри
//     полигона, максимально удалённая от его границы (алгоритм polylabel,
//     реализован здесь же, без зависимостей). У многосоставных фич берётся
//     часть с наибольшим «вписанным кругом»;
//   • дорога — середина по длине ВИДИМОГО участка оси (после вычитания
//     городов и площадей); полюс для узкой полосы выбирал бы случайную
//     точку вдоль неё;
//   • щит — у края города, в углу тайла или у середины стороны (как у ручных
//     щитов в данных: центр щита на shieldInset от границы). Углы предпочтительнее
//     сторон, но острый угол (дуга города) проигрывает середине стороны.
//     Фигурку щит не перекрывает. Какой именно угол — можно задать для тайла.
//
// Дополнительно считается clearance — расстояние от споты до границы фичи.
// Если оно меньше радиуса мипла, фигурка не помещается: шум слишком сильно
// сузил фичу (аудит показывает это предупреждением).
//
// Модуль чистый: без React и без three.
// ============================================
import type { MultiPolygon, Point, Polygon } from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { multiPolygonContainsPoint } from './geometryPointInPolygon';
import type { TessellatedLine } from './tessellate';
import type { TileGeometryResult } from './types';

// ============================================
// ⚙️ ПАРАМЕТРЫ
// ============================================
export interface SpotParams {
    /** Радиус фигурки мипла (юниты): по нему оценивается, помещается ли она */
    meepleRadius: number;
    /** Радиус щита (юниты) */
    shieldRadius: number;
    /** Зазор между кругом мипла и щитом (юниты) */
    shieldMargin: number;
    /**
     * Расстояние от центра щита до границы города или тайла (юниты).
     * В прежних ручных данных все щиты стоят на 16 от края тайла.
     */
    shieldInset: number;
    /**
     * Штраф за привязку щита к середине стороны вместо угла (юниты).
     * Угол выбирается, пока ближайшая к нему допустимая точка не дальше
     * «сторона + штраф»: прямой угол (≈ inset·√2) выигрывает, острый — нет.
     */
    shieldEdgePenalty: number;
    /**
     * Притяжение к центру фичи (0..0.5). На широких фичах точек с почти одинаковым
     * расстоянием до границы много, и «чистый» polylabel выбирает любую из них.
     * Небольшое притяжение к центроиду делает выбор симметричным и предсказуемым,
     * а на узких фичах решает расстояние. 0 — чистый polylabel.
     */
    centerBias: number;
    /** Точность поиска полюса (юниты): меньше — точнее и медленнее */
    precision: number;
    /** Шаг выборки оси дороги при поиске видимого участка (юниты) */
    roadSampleStep: number;
}

export const DEFAULT_SPOT_PARAMS: Readonly<SpotParams> = {
    meepleRadius: 8,
    shieldRadius: 5,
    shieldMargin: 2,
    shieldInset: 16,
    shieldEdgePenalty: 12,
    centerBias: 0.05,
    precision: 0.25,
    roadSampleStep: 1,
};

const finite = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function resolveSpotParams(partial?: Partial<SpotParams>): SpotParams {
    const d = DEFAULT_SPOT_PARAMS;
    return {
        meepleRadius: Math.min(30, Math.max(0.5, finite(partial?.meepleRadius, d.meepleRadius))),
        shieldRadius: Math.min(20, Math.max(0.5, finite(partial?.shieldRadius, d.shieldRadius))),
        shieldMargin: Math.min(20, Math.max(0, finite(partial?.shieldMargin, d.shieldMargin))),
        shieldInset: Math.min(40, Math.max(1, finite(partial?.shieldInset, d.shieldInset))),
        shieldEdgePenalty: Math.min(60, Math.max(0, finite(partial?.shieldEdgePenalty, d.shieldEdgePenalty))),
        centerBias: Math.min(0.5, Math.max(0, finite(partial?.centerBias, d.centerBias))),
        precision: Math.min(5, Math.max(0.01, finite(partial?.precision, d.precision))),
        roadSampleStep: Math.min(10, Math.max(0.1, finite(partial?.roadSampleStep, d.roadSampleStep))),
    };
}

// ============================================
// 📦 РЕЗУЛЬТАТ
// ============================================
export type SpotMethod = 'pole' | 'centerline';

/** К чему привязан щит: угол тайла (NW...) или середина стороны (N...) */
export type ShieldAnchor = 'NW' | 'NE' | 'SE' | 'SW' | 'N' | 'E' | 'S' | 'W';

export const SHIELD_ANCHORS: readonly ShieldAnchor[] = ['NW', 'NE', 'SE', 'SW', 'N', 'E', 'S', 'W'];

export interface FeatureSpot {
    /** Где ставить мипла */
    readonly meeple: Point;
    /** Где рисовать щит (только у городов со щитом) */
    readonly shield?: Point;
    /** Расстояние от споты до границы фичи (юниты); у дорог — до границы видимой полосы */
    readonly clearance: number;
    /** Свободное место вокруг щита: до границы города и до фигурки (меньше 0 — щит не помещается) */
    readonly shieldClearance?: number;
    /** К чему привязан щит (нет, если сработал запасной вариант) */
    readonly shieldAnchor?: ShieldAnchor;
    readonly method: SpotMethod;
}

// ============================================
// 📐 РАССТОЯНИЕ ДО ПОЛИГОНА
// ============================================

function segmentDistanceSq(px: number, py: number, a: Point, b: Point): number {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;

    if (dx !== 0 || dy !== 0) {
        const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = b[0];
            y = b[1];
        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }
    dx = px - x;
    dy = py - y;
    return dx * dx + dy * dy;
}

/** Расстояние от точки до полигона с дырками: внутри — положительное, снаружи — отрицательное */
export function signedDistanceToPolygon(px: number, py: number, polygon: Polygon): number {
    let inside = false;
    let minDistSq = Infinity;

    for (const ring of polygon) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[i];
            const b = ring[j];
            if (a[1] > py !== b[1] > py && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) {
                inside = !inside;
            }
            minDistSq = Math.min(minDistSq, segmentDistanceSq(px, py, a, b));
        }
    }
    return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

// ============================================
// 🎯 МАКСИМИЗАЦИЯ РАССТОЯНИЯ (ядро polylabel)
// ============================================

export interface Bounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

export interface PoleResult {
    readonly point: Point;
    /**
     * Для maximizeDistance — значение целевой функции в найденной точке.
     * Для poleOfInaccessibility / bestPole — настоящее расстояние до границы полигона.
     */
    readonly distance: number;
}

interface Cell {
    readonly x: number;
    readonly y: number;
    readonly half: number;
    readonly d: number;
    /** Верхняя оценка расстояния внутри ячейки */
    readonly max: number;
}

/** Двоичная куча по полю max (наибольшее — наверху) */
class CellHeap {
    private readonly items: Cell[] = [];

    get length(): number {
        return this.items.length;
    }

    push(cell: Cell): void {
        const items = this.items;
        items.push(cell);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent].max >= items[i].max) break;
            [items[parent], items[i]] = [items[i], items[parent]];
            i = parent;
        }
    }

    pop(): Cell | undefined {
        const items = this.items;
        if (items.length === 0) return undefined;
        const top = items[0];
        const last = items.pop()!;
        if (items.length > 0) {
            items[0] = last;
            let i = 0;
            for (;;) {
                const left = 2 * i + 1;
                const right = left + 1;
                let largest = i;
                if (left < items.length && items[left].max > items[largest].max) largest = left;
                if (right < items.length && items[right].max > items[largest].max) largest = right;
                if (largest === i) break;
                [items[largest], items[i]] = [items[i], items[largest]];
                i = largest;
            }
        }
        return top;
    }
}

/**
 * Ищет точку в `bounds`, где функция `distance` максимальна, с точностью `precision`.
 *
 * Функция обязана быть `lipschitz`-липшицевой (не меняться быстрее, чем на `lipschitz`
 * на единицу пути; для расстояния до полигона это 1): тогда в квадрате с полуразмером h
 * она не превысит f(центра) + h·√2·lipschitz, и ячейки, которые не могут улучшить результат,
 * отбрасываются. Минимум нескольких расстояний тоже 1-липшицев.
 */
export function maximizeDistance(
    distance: (x: number, y: number) => number,
    bounds: Bounds,
    precision: number,
    seeds: readonly Point[] = [],
    lipschitz = 1
): PoleResult {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const cellSize = Math.min(width, height);

    const makeCell = (x: number, y: number, half: number): Cell => {
        const d = distance(x, y);
        return { x, y, half, d, max: d + half * Math.SQRT2 * lipschitz };
    };

    const centre = makeCell(bounds.minX + width / 2, bounds.minY + height / 2, 0);
    let best = centre;
    for (const [x, y] of seeds) {
        const seed = makeCell(x, y, 0);
        if (seed.d > best.d) best = seed;
    }

    if (cellSize === 0) return { point: [bounds.minX, bounds.minY], distance: best.d };

    const heap = new CellHeap();
    const half = cellSize / 2;
    for (let x = bounds.minX; x < bounds.maxX; x += cellSize) {
        for (let y = bounds.minY; y < bounds.maxY; y += cellSize) {
            heap.push(makeCell(x + half, y + half, half));
        }
    }

    for (let cell = heap.pop(); cell; cell = heap.pop()) {
        if (cell.d > best.d) best = cell;
        if (cell.max - best.d <= precision) continue;

        const h = cell.half / 2;
        heap.push(makeCell(cell.x - h, cell.y - h, h));
        heap.push(makeCell(cell.x + h, cell.y - h, h));
        heap.push(makeCell(cell.x - h, cell.y + h, h));
        heap.push(makeCell(cell.x + h, cell.y + h, h));
    }

    return { point: [best.x, best.y], distance: best.d };
}

function ringBounds(ring: readonly Point[]): Bounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
}

/** Центроид внешнего кольца — хороший стартовый кандидат для поиска */
function ringCentroid(ring: readonly Point[]): Point {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        const f = a[0] * b[1] - b[0] * a[1];
        cx += (a[0] + b[0]) * f;
        cy += (a[1] + b[1]) * f;
        area += f * 3;
    }
    return area === 0 ? ring[0] : [cx / area, cy / area];
}

/**
 * Полюс недоступности одного полигона: точка, наиболее удалённая от всех его границ.
 * `centerBias` слегка притягивает результат к центроиду (см. SpotParams.centerBias).
 * `distance` в результате — настоящее расстояние до границы.
 */
export function poleOfInaccessibility(polygon: Polygon, precision = 0.25, centerBias = 0): PoleResult | null {
    const outer = polygon[0];
    if (!outer || outer.length < 3) return null;

    const centroid = ringCentroid(outer);
    const found = maximizeDistance(
        (x, y) =>
            signedDistanceToPolygon(x, y, polygon) - centerBias * Math.hypot(x - centroid[0], y - centroid[1]),
        ringBounds(outer),
        precision,
        [centroid],
        1 + centerBias
    );
    return { point: found.point, distance: signedDistanceToPolygon(found.point[0], found.point[1], polygon) };
}

/** Лучший полюс среди частей многосоставной фичи (наибольший вписанный круг) */
export function bestPole(
    multi: MultiPolygon,
    precision = 0.25,
    centerBias = 0
): { pole: PoleResult; polygon: Polygon } | null {
    let best: { pole: PoleResult; polygon: Polygon } | null = null;
    for (const polygon of multi) {
        const pole = poleOfInaccessibility(polygon, precision, centerBias);
        if (pole && (!best || pole.distance > best.pole.distance)) best = { pole, polygon };
    }
    return best;
}

// ============================================
// 🛣 СПОТ ДОРОГИ: СЕРЕДИНА ВИДИМОГО УЧАСТКА ОСИ
// ============================================

function roadSpot(line: TessellatedLine, visible: MultiPolygon, params: SpotParams): FeatureSpot | null {
    const center = line.center;
    if (center.length < 2 || visible.length === 0) return null;

    const cumulative: number[] = [0];
    for (let i = 1; i < center.length; i++) {
        cumulative.push(
            cumulative[i - 1] + Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1])
        );
    }
    const total = cumulative[cumulative.length - 1];
    if (total === 0) return null;

    const pointAt = (s: number): Point => {
        let j = 0;
        while (j < center.length - 2 && cumulative[j + 1] < s) j++;
        const span = cumulative[j + 1] - cumulative[j];
        const t = span === 0 ? 0 : (s - cumulative[j]) / span;
        return [
            center[j][0] + (center[j + 1][0] - center[j][0]) * t,
            center[j][1] + (center[j + 1][1] - center[j][1]) * t,
        ];
    };

    // Выборка вдоль оси: какие её куски не закрыты городами и площадями
    const steps = Math.max(2, Math.ceil(total / params.roadSampleStep));
    let bestRun: { from: number; to: number } | null = null;
    let runStart: number | null = null;

    for (let i = 0; i <= steps; i++) {
        const s = (i / steps) * total;
        const isVisible = multiPolygonContainsPoint(visible, pointAt(s));
        if (isVisible && runStart === null) runStart = s;
        const runEnds = runStart !== null && (!isVisible || i === steps);
        if (runEnds) {
            const to = isVisible ? s : ((i - 1) / steps) * total;
            if (!bestRun || to - runStart! > bestRun.to - bestRun.from) bestRun = { from: runStart!, to };
            runStart = null;
        }
    }

    if (!bestRun) return null;

    const point = pointAt((bestRun.from + bestRun.to) / 2);
    let clearance = -Infinity;
    for (const polygon of visible) {
        clearance = Math.max(clearance, signedDistanceToPolygon(point[0], point[1], polygon));
    }
    return { meeple: point, clearance, method: 'centerline' };
}

// ============================================
// 🛡 ЩИТ: У КРАЯ ГОРОДА, В УГЛУ ТАЙЛА
// ============================================

const TILE_HALF = 50;
/** Насколько близко вершина контура должна подойти к углу тайла, чтобы считаться им (юниты) */
const CORNER_EPS = 0.75;
/** Крутизна штрафа за нарушение ограничений: цель важнее «ближе к якорю» */
const SHIELD_PENALTY_SLOPE = 3;
/** Нарушение ограничений, не превышающее это значение, допустимо (юниты) */
const SHIELD_FEASIBLE_EPS = 0.5;
/** Штраф за место, где щиту тесно: перевешивает любую разницу в близости к углу */
const SHIELD_CRAMPED_PENALTY = 100;

interface ShieldCandidate {
    readonly id: ShieldAnchor;
    readonly kind: 'corner' | 'edge';
    readonly point: Point;
}

const TILE_CORNERS: ReadonlyArray<{ id: ShieldAnchor; point: Point }> = [
    { id: 'NW', point: [-TILE_HALF, -TILE_HALF] },
    { id: 'NE', point: [TILE_HALF, -TILE_HALF] },
    { id: 'SE', point: [TILE_HALF, TILE_HALF] },
    { id: 'SW', point: [-TILE_HALF, TILE_HALF] },
];

/** Стороны тайла: ось, вдоль которой лежит сторона, и её координата */
const TILE_SIDES: ReadonlyArray<{ id: ShieldAnchor; fixedAxis: 0 | 1; value: number }> = [
    { id: 'N', fixedAxis: 1, value: -TILE_HALF },
    { id: 'E', fixedAxis: 0, value: TILE_HALF },
    { id: 'S', fixedAxis: 1, value: TILE_HALF },
    { id: 'W', fixedAxis: 0, value: -TILE_HALF },
];

/**
 * Места, к которым можно привязать щит: углы тайла, где контур города доходит
 * до угла, и середины тех сторон тайла, вдоль которых идёт город.
 */
function shieldCandidates(polygon: Polygon, minEdgeLength: number): ShieldCandidate[] {
    const outer = polygon[0];
    const candidates: ShieldCandidate[] = [];

    for (const corner of TILE_CORNERS) {
        if (outer.some((v) => Math.hypot(v[0] - corner.point[0], v[1] - corner.point[1]) < CORNER_EPS)) {
            candidates.push({ id: corner.id, kind: 'corner', point: corner.point });
        }
    }

    for (const side of TILE_SIDES) {
        // Отрезки контура, лежащие на этой стороне тайла
        const along = side.fixedAxis === 0 ? 1 : 0;
        const intervals: Array<[number, number]> = [];
        for (let i = 0; i < outer.length; i++) {
            const a = outer[i];
            const b = outer[(i + 1) % outer.length];
            if (Math.abs(a[side.fixedAxis] - side.value) < 0.5 && Math.abs(b[side.fixedAxis] - side.value) < 0.5) {
                intervals.push([Math.min(a[along], b[along]), Math.max(a[along], b[along])]);
            }
        }
        if (intervals.length === 0) continue;

        // Склеиваем перекрывающиеся отрезки и берём самый длинный
        intervals.sort((x, y) => x[0] - y[0]);
        const merged: Array<[number, number]> = [intervals[0]];
        for (const [from, to] of intervals.slice(1)) {
            const last = merged[merged.length - 1];
            if (from <= last[1] + 0.5) last[1] = Math.max(last[1], to);
            else merged.push([from, to]);
        }
        const longest = merged.reduce((best, cur) => (cur[1] - cur[0] > best[1] - best[0] ? cur : best));
        if (longest[1] - longest[0] < minEdgeLength) continue;

        const mid = (longest[0] + longest[1]) / 2;
        candidates.push({
            id: side.id,
            kind: 'edge',
            point: side.fixedAxis === 0 ? [side.value, mid] : [mid, side.value],
        });
    }

    return candidates;
}

interface ShieldPlacement {
    readonly point: Point;
    readonly anchor: ShieldAnchor;
    readonly clearance: number;
}

/**
 * Ставит щит: для каждого кандидата ищет ближайшую к нему точку, которая
 *   • не ближе `shieldInset` к границе города (в том числе к краю тайла),
 *   • не ближе радиус мипла + радиус щита + зазор к мипле.
 * Среди допустимых выбирает ту, у которой «расстояние до якоря + штраф стороны» меньше;
 * при равенстве побеждает более ранний в порядке NW, NE, SE, SW, N, E, S, W.
 *
 * Места, где щиту тесно (свободно меньше его радиуса), получают большой штраф:
 * при равноценной альтернативе щит уйдёт от мипла (например, в другую «лапу» песочных часов).
 *
 * `forced` — угол, заданный для тайла вручную: выбор идёт только среди него, и это решение
 * автора выполняется даже в ущерб зазору до мипла (аудит предупредит о перекрытии).
 */
function placeShield(
    polygon: Polygon,
    meeple: Point,
    params: SpotParams,
    forced?: ShieldAnchor
): ShieldPlacement | null {
    const fullKeepOut = params.meepleRadius + params.shieldRadius + params.shieldMargin;
    const inset = params.shieldInset;

    let candidates = shieldCandidates(polygon, 2 * (params.shieldRadius + 1));
    if (forced) candidates = candidates.filter((c) => c.id === forced);

    let best: { cost: number; placement: ShieldPlacement; order: number } | null = null;

    for (const candidate of candidates) {
        // Заданный вручную угол ставим даже вплотную к мипле: сначала с зазором, потом без него
        const keepOuts = forced ? [fullKeepOut, 0] : [fullKeepOut];
        for (const keepOut of keepOuts) {
        const [ax, ay] = candidate.point;
        const violation = (x: number, y: number, ko: number): number =>
            Math.max(0, inset - signedDistanceToPolygon(x, y, polygon)) +
            Math.max(0, ko - Math.hypot(x - meeple[0], y - meeple[1]));

            // Ищем ближайшую к якорю допустимую точку в окне вокруг него
            const window = inset * 3 + 10;
            const found = maximizeDistance(
                (x, y) => -(Math.hypot(x - ax, y - ay) + SHIELD_PENALTY_SLOPE * violation(x, y, keepOut)),
                { minX: ax - window, minY: ay - window, maxX: ax + window, maxY: ay + window },
                params.precision,
                [],
                1 + 2 * SHIELD_PENALTY_SLOPE
            );
            const [px, py] = found.point;
            if (violation(px, py, keepOut) > SHIELD_FEASIBLE_EPS) continue;

            const clearance = Math.min(
                signedDistanceToPolygon(px, py, polygon) - params.shieldRadius,
                Math.hypot(px - meeple[0], py - meeple[1]) - fullKeepOut
            );
            let cost = Math.hypot(px - ax, py - ay) + (candidate.kind === 'edge' ? params.shieldEdgePenalty : 0);
            // Тесное место — только если нет ничего лучше
            if (clearance < params.shieldRadius) cost += SHIELD_CRAMPED_PENALTY;
            const order = SHIELD_ANCHORS.indexOf(candidate.id);

            // Строго меньше (с допуском) — чтобы при равенстве осталась более ранняя привязка
            if (!best || cost < best.cost - 0.5 || (Math.abs(cost - best.cost) <= 0.5 && order < best.order)) {
                best = { cost, order, placement: { point: [px, py], anchor: candidate.id, clearance } };
            }
            break; // допустимая точка найдена: вариант без зазора не нужен
        }
    }

    return best ? best.placement : null;
}

// ============================================
// 🏛 СПОТЫ ВСЕХ ФИЧ ТАЙЛА
// ============================================

/** Фичи, которым нужны споты, и ноль-значение для щита: тип «город» с признаком щита */
function hasShield(feature: TileFeature): boolean {
    return feature.type === 'city' && feature.shieldSpot !== undefined;
}

/**
 * Считает споты для каждой фичи тайла из итоговой геометрии.
 * Фичи, для которых геометрия не получилась, в результат не попадают.
 *
 * Щит рисуется только у городов, у которых он уже задан в данных
 * (`shieldSpot`): признак «есть щит» остаётся в данных, координаты
 * вычисляются.
 */
export function computeTileSpots(
    features: readonly TileFeature[],
    geometry: TileGeometryResult,
    partialParams?: Partial<SpotParams>,
    options?: { readonly shieldAnchor?: ShieldAnchor }
): Map<string, FeatureSpot> {
    const params = resolveSpotParams(partialParams);
    const spots = new Map<string, FeatureSpot>();

    for (const feature of features) {
        switch (feature.type) {
            case 'city':
            case 'monastery': {
                const multi = geometry.tessellation.areas.get(feature.id);
                const found = multi ? bestPole(multi, params.precision, params.centerBias) : null;
                if (!found) break;

                const meeple = found.pole.point;
                let shield: Point | undefined;
                let shieldClearance: number | undefined;
                let shieldAnchor: ShieldAnchor | undefined;

                if (hasShield(feature)) {
                    // Щит — у края города, в углу тайла или у середины стороны
                    const placed = placeShield(found.polygon, meeple, params, options?.shieldAnchor);

                    if (placed) {
                        shield = placed.point;
                        shieldClearance = placed.clearance;
                        shieldAnchor = placed.anchor;
                    } else {
                        // Тесный город: ни один угол или сторона не подошли — второй полюс вне круга мипла
                        const keepOut = params.meepleRadius + params.shieldRadius + params.shieldMargin;
                        const polygon = found.polygon;
                        const result = maximizeDistance(
                            (x, y) =>
                                Math.min(
                                    signedDistanceToPolygon(x, y, polygon) - params.shieldRadius,
                                    Math.hypot(x - meeple[0], y - meeple[1]) - keepOut
                                ),
                            ringBounds(polygon[0]),
                            params.precision
                        );
                        shield = result.point;
                        shieldClearance = result.distance;
                    }
                }

                spots.set(feature.id, {
                    meeple,
                    shield,
                    clearance: found.pole.distance,
                    shieldClearance,
                    shieldAnchor,
                    method: 'pole',
                });
                break;
            }

            case 'field': {
                const multi = geometry.assignments.fieldGeometries.get(feature.id);
                const found = multi ? bestPole(multi, params.precision, params.centerBias) : null;
                if (found) {
                    spots.set(feature.id, {
                        meeple: found.pole.point,
                        clearance: found.pole.distance,
                        method: 'pole',
                    });
                }
                break;
            }

            case 'road': {
                const line = geometry.tessellation.lines.get(feature.id);
                const visible = geometry.clipping.clippedLines.get(feature.id);
                if (!line || !visible) break;

                const spot = roadSpot(line, visible, params);
                if (spot) {
                    spots.set(feature.id, spot);
                } else {
                    // Ось целиком закрыта: берём лучший полюс видимой полосы
                    const found = bestPole(visible, params.precision, params.centerBias);
                    if (found) {
                        spots.set(feature.id, {
                            meeple: found.pole.point,
                            clearance: found.pole.distance,
                            method: 'pole',
                        });
                    }
                }
                break;
            }
        }
    }

    return spots;
}
