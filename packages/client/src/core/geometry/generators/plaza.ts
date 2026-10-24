// packages/client/src/core/geometry/generators/plaza.ts
// ============================================
// 🏛️ ПЛОЩАДИ НА ПЕРЕКРЁСТКАХ ДОРОГ
// ============================================
// 🌟 ЧТО ИЗМЕНИЛОСЬ:
//   Раньше площадь строилась по прямым «хордам» от центра и срезалась
//   прямыми на глубине PLAZA_DEPTH. У зашумлённых дорог край на этой
//   глубине уже смещён, поэтому на стыке появлялись ступеньки,
//   а угол между дорогами срезался почти прямой линией.
//
//   Теперь контур площади СОСТОИТ ИЗ РЕАЛЬНЫХ КРАЁВ ДОРОГ:
//     • вдоль каждой дороги площадь идёт по её левому/правому краю
//       (те же точки, что у дороги → никаких ступенек и щелей);
//     • внутренний угол между соседними дорогами скругляется
//       квадратичной кривой, касательной к обоим краям;
//     • противоположные дороги (~180°) соединяются по их общему краю;
//     • внешний (выпуклый) угол, например у Г-образного стыка,
//       скругляется по касательным в торцах дорог;
//     • поперёк дороги на глубине `depth` идёт «срез» — он лежит
//       внутри дорожной полосы и после обрезки дорог не виден.
//
// АРХИТЕКТУРА:
//   Принимает УЖЕ ТЕССЕЛИРОВАННЫЕ (и зашумлённые) дороги из пайплайна.
//   Возвращает AreaGeometry (линии + квадратичные кривые), поэтому
//   плотность скруглений управляется параметрами тесселяции.
// ============================================
import type { Point, AreaGeometry, OutlineSegment } from '@fiefdom/shared/core/geometry.types';
import type { TessellatedLine } from '../tessellate';

// ============================================
// ⚙️ ПАРАМЕТРЫ
// ============================================
export interface PlazaParams {
    /** Глубина площади вдоль дороги: расстояние по оси от центра перекрёстка до среза (юниты) */
    depth: number;
    /** Радиус скругления внутренних углов: сколько юнитов вдоль каждого края съедает скругление */
    cornerRadius: number;
    /** 0 = срез углов прямой линией, 1 = плавная кривая, касательная к краям */
    cornerRoundness: number;
    /** Концы дорог ближе этого расстояния считаются одним перекрёстком (юниты) */
    clusterTolerance: number;
}

export const DEFAULT_PLAZA_PARAMS: Readonly<PlazaParams> = {
    depth: 24,
    cornerRadius: 12,
    cornerRoundness: 1,
    clusterTolerance: 3,
};

const finite = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const clampNum = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function resolvePlazaParams(partial?: Partial<PlazaParams>): PlazaParams {
    const d = DEFAULT_PLAZA_PARAMS;
    return {
        depth: clampNum(finite(partial?.depth, d.depth), 2, 100),
        cornerRadius: clampNum(finite(partial?.cornerRadius, d.cornerRadius), 0, 60),
        cornerRoundness: clampNum(finite(partial?.cornerRoundness, d.cornerRoundness), 0, 1),
        clusterTolerance: clampNum(finite(partial?.clusterTolerance, d.clusterTolerance), 0.5, 20),
    };
}

/** dot(dirA, dirB) ниже порога = дороги почти противоположны (~180°) */
const OPPOSITE_DOT = -0.97;
/** Скругление короче этого не строим (юниты) */
const MIN_FILLET = 0.25;
/** Максимальный вылет касательных при поиске внешнего угла (юниты) */
const MAX_OUTER_EXTEND = 60;
const EPS = 1e-9;

// ============================================
// 📐 ВЕКТОРНЫЕ ХЕЛПЕРЫ
// ============================================
const dist = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

const lerp = (a: Point, b: Point, t: number): Point => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
];

const unit = (from: Point, to: Point): Point => {
    const len = dist(from, to);
    return len < EPS ? [0, 0] : [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
};

function cumulative(points: readonly Point[]): number[] {
    const result: number[] = [0];
    for (let i = 1; i < points.length; i++) {
        result.push(result[i - 1] + dist(points[i - 1], points[i]));
    }
    return result;
}

/** Точка на полилинии на расстоянии s от начала */
function pointAt(points: readonly Point[], cum: readonly number[], s: number): Point {
    const last = points.length - 1;
    if (s <= 0) return points[0];
    if (s >= cum[last]) return points[last];
    let j = 0;
    while (j < last - 1 && cum[j + 1] < s) j++;
    const span = cum[j + 1] - cum[j];
    return span < EPS ? points[j] : lerp(points[j], points[j + 1], (s - cum[j]) / span);
}

/** Вершины с индексом ≤ cap, лежащие дальше s от начала (по возрастанию) */
function verticesBeyond(points: readonly Point[], cum: readonly number[], s: number, cap: number): Point[] {
    const result: Point[] = [];
    for (let i = 0; i <= cap; i++) {
        if (cum[i] > s + 1e-6) result.push(points[i]);
    }
    return result;
}

// ============================================
// 🦾 «ЛУЧ» ДОРОГИ У ПЕРЕКРЁСТКА
// ============================================
interface Arm {
    /** Единичное направление от перекрёстка наружу */
    readonly dir: Point;
    /** Край на стороне +90° от направления; точки идут от перекрёстка наружу */
    readonly plus: readonly Point[];
    /** Край на стороне −90° */
    readonly minus: readonly Point[];
    readonly plusS: readonly number[];
    readonly minusS: readonly number[];
    /** Индекс вершины, на которой проходит срез площади */
    readonly cap: number;
}

/**
 * Приводит дорогу к «лучу»: все массивы упорядочены от перекрёстка наружу.
 * `left` = ось + нормаль (поворот касательной на +90°), поэтому у начала
 * оси левая сторона — «плюс», а у конца порядок и стороны меняются местами.
 */
function buildArm(line: TessellatedLine, atStart: boolean, depth: number): Arm | null {
    const n = line.center.length;
    if (n < 2) return null;

    const center = atStart ? line.center : [...line.center].reverse();
    const plus = atStart ? line.left : [...line.right].reverse();
    const minus = atStart ? line.right : [...line.left].reverse();

    const centerS = cumulative(center);
    let cap = n - 1;
    for (let i = 1; i < n; i++) {
        if (centerS[i] >= depth) {
            cap = i;
            break;
        }
    }

    // Направление берём по участку ~6 юнитов, а не по первому отрезку
    let k = 1;
    while (k < cap && centerS[k] < 6) k++;
    const dir = unit(center[0], center[k]);
    if (dir[0] === 0 && dir[1] === 0) return null;

    return { dir, plus, minus, plusS: cumulative(plus), minusS: cumulative(minus), cap };
}

// ============================================
// ✂️ ПЕРЕСЕЧЕНИЕ КРАЁВ СОСЕДНИХ ДОРОГ
// ============================================
interface EdgeCrossing {
    readonly point: Point;
    /** Расстояние до пересечения вдоль края A и вдоль края B */
    readonly sA: number;
    readonly sB: number;
}

/**
 * Ищет ближайшее к перекрёстку пересечение края A с краем B
 * (в пределах среза). Это внутренний угол между дорогами.
 */
function findCrossing(A: Arm, B: Arm): EdgeCrossing | null {
    let best: EdgeCrossing | null = null;

    for (let j = 0; j < A.cap; j++) {
        const a1 = A.plus[j];
        const a2 = A.plus[j + 1];
        const ax = a2[0] - a1[0];
        const ay = a2[1] - a1[1];

        for (let k = 0; k < B.cap; k++) {
            const b1 = B.minus[k];
            const b2 = B.minus[k + 1];
            const bx = b2[0] - b1[0];
            const by = b2[1] - b1[1];

            const det = ax * by - ay * bx;
            if (Math.abs(det) < EPS) continue;

            const t = ((b1[0] - a1[0]) * by - (b1[1] - a1[1]) * bx) / det;
            const u = ((b1[0] - a1[0]) * ay - (b1[1] - a1[1]) * ax) / det;
            if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;

            const sA = A.plusS[j] + t * (A.plusS[j + 1] - A.plusS[j]);
            const sB = B.minusS[k] + u * (B.minusS[k + 1] - B.minusS[k]);
            if (!best || sA + sB < best.sA + best.sB) {
                best = { point: [a1[0] + ax * t, a1[1] + ay * t], sA, sB };
            }
        }
    }
    return best;
}

/**
 * Внешний (выпуклый) угол: продолжаем края назад за торцы дорог
 * и ищем точку их пересечения.
 */
function findOuterCorner(A: Arm, B: Arm): Point | null {
    const a0 = A.plus[0];
    const b0 = B.minus[0];
    const tA = unit(a0, A.plus[1]);
    const tB = unit(b0, B.minus[1]);

    // a0 − tA·u = b0 − tB·v
    const det = -tA[0] * tB[1] + tA[1] * tB[0];
    if (Math.abs(det) < 1e-6) return null;

    const rx = b0[0] - a0[0];
    const ry = b0[1] - a0[1];
    const u = (rx * tB[1] - ry * tB[0]) / det;
    const v = (-tA[0] * ry + tA[1] * rx) / det;
    if (u < 0.01 || v < 0.01 || u > MAX_OUTER_EXTEND || v > MAX_OUTER_EXTEND) return null;

    return [a0[0] - tA[0] * u, a0[1] - tA[1] * u];
}

// ============================================
// 🧵 СОЕДИНЕНИЕ СОСЕДНИХ ДОРОГ
// ============================================
const lineTo = (to: Point): OutlineSegment => ({ type: 'line', to });

/**
 * Участок контура от края дороги A (мы стоим в A.plus[cap])
 * до края дороги B (заканчиваем в B.minus[cap]).
 */
function buildConnector(A: Arm, B: Arm, p: PlazaParams): OutlineSegment[] {
    const segments: OutlineSegment[] = [];
    const aCapS = A.plusS[A.cap];
    const bCapS = B.minusS[B.cap];

    /** Вершины A от среза вниз до s (без самой стартовой точки среза) */
    const descendA = (s: number): void => {
        const above = verticesBeyond(A.plus, A.plusS, s, A.cap).reverse();
        for (const point of above.slice(1)) segments.push(lineTo(point));
    };
    /** Вершины B от s вверх до среза */
    const ascendB = (s: number): void => {
        for (const point of verticesBeyond(B.minus, B.minusS, s, B.cap)) segments.push(lineTo(point));
    };

    // --- Противоположные дороги: идём по общему краю ---
    if (A.dir[0] * B.dir[0] + A.dir[1] * B.dir[1] < OPPOSITE_DOT) {
        descendA(-1);
        const a0 = A.plus[0];
        const b0 = B.minus[0];
        if (dist(a0, b0) > 1e-6) segments.push(lineTo(b0));
        for (const point of B.minus.slice(1, B.cap + 1)) segments.push(lineTo(point));
        return segments;
    }

    // --- Внутренний угол: скругление, касательное к обоим краям ---
    const crossing = findCrossing(A, B);
    if (crossing) {
        const radius = Math.min(p.cornerRadius, aCapS - crossing.sA, bCapS - crossing.sB);

        if (radius < MIN_FILLET) {
            // Скруглять нечем: идём строго по краям через точку пересечения
            descendA(crossing.sA);
            segments.push(lineTo(crossing.point));
            ascendB(crossing.sB);
            return segments;
        }

        const sP = crossing.sA + radius;
        const sQ = crossing.sB + radius;
        const P = pointAt(A.plus, A.plusS, sP);
        const Q = pointAt(B.minus, B.minusS, sQ);
        const cp = lerp(lerp(P, Q, 0.5), crossing.point, p.cornerRoundness);

        descendA(sP);
        if (dist(segments.length ? lastPoint(segments, A.plus[A.cap]) : A.plus[A.cap], P) > 1e-6) {
            segments.push(lineTo(P));
        }
        segments.push({ type: 'quadratic', cp, to: Q });
        ascendB(sQ);
        return segments;
    }

    // --- Внешний (выпуклый) угол: скругляем между торцами дорог ---
    const corner = findOuterCorner(A, B);
    descendA(-1);
    const a0 = A.plus[0];
    const b0 = B.minus[0];
    if (corner) {
        const cp = lerp(lerp(a0, b0, 0.5), corner, p.cornerRoundness);
        segments.push({ type: 'quadratic', cp, to: b0 });
    } else {
        segments.push(lineTo(b0));
    }
    for (const point of B.minus.slice(1, B.cap + 1)) segments.push(lineTo(point));
    return segments;
}

/** Последняя точка уже построенных сегментов (или запасная) */
function lastPoint(segments: readonly OutlineSegment[], fallback: Point): Point {
    const last = segments[segments.length - 1];
    return last && 'to' in last ? last.to : fallback;
}

// ============================================
// 🏛️ ГЕОМЕТРИЯ ОДНОЙ ПЛОЩАДИ
// ============================================
function generatePlazaGeometry(arms: readonly Arm[], p: PlazaParams): AreaGeometry {
    // Дороги по возрастанию угла; соседние пары (i, i+1) образуют углы
    const sorted = [...arms].sort(
        (a, b) => Math.atan2(a.dir[1], a.dir[0]) - Math.atan2(b.dir[1], b.dir[0])
    );

    const start = sorted[0].minus[sorted[0].cap];
    const outline: OutlineSegment[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const A = sorted[i];
        const B = sorted[(i + 1) % sorted.length];

        // Срез поперёк дороги: из «минус»-края в «плюс»-край
        outline.push(lineTo(A.plus[A.cap]));
        outline.push(...buildConnector(A, B, p));
    }
    outline.push({ type: 'close' });

    return { kind: 'area', start, outline };
}

// ============================================
// 📍 КЛАСТЕРИЗАЦИЯ
// ============================================
interface RoadEnd {
    readonly road: number;
    readonly atStart: boolean;
    readonly point: Point;
}

function clusterEnds(ends: readonly RoadEnd[], tolerance: number): number[][] {
    const clusters: number[][] = [];
    const used = new Set<number>();
    for (let i = 0; i < ends.length; i++) {
        if (used.has(i)) continue;
        const cluster = [i];
        used.add(i);
        for (let j = i + 1; j < ends.length; j++) {
            if (!used.has(j) && dist(ends[i].point, ends[j].point) <= tolerance) {
                cluster.push(j);
                used.add(j);
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}

// ============================================
// 🏛️ ОСНОВНАЯ ФУНКЦИЯ (PUBLIC API)
// ============================================
/**
 * Генерирует площади на перекрёстках дорог.
 * Принимает кэш тесселированных (и зашумлённых) дорог, заново их не тесселирует.
 *
 * @param tessellatedLines Кэш тесселированных дорог
 * @param params           Параметры площади (необязательно)
 * @returns Массив AreaGeometry площадей
 */
export function generatePlazas(
    tessellatedLines: ReadonlyMap<string, TessellatedLine>,
    params?: Partial<PlazaParams>
): AreaGeometry[] {
    if (tessellatedLines.size < 2) return [];

    const p = resolvePlazaParams(params);
    const roads = [...tessellatedLines.values()];

    const ends: RoadEnd[] = [];
    roads.forEach((line, road) => {
        if (line.center.length < 2) return;
        ends.push({ road, atStart: true, point: line.center[0] });
        ends.push({ road, atStart: false, point: line.center[line.center.length - 1] });
    });

    const plazas: AreaGeometry[] = [];

    for (const cluster of clusterEnds(ends, p.clusterTolerance)) {
        if (cluster.length < 2) continue;

        // Дорога, оба конца которой в кластере (петля), перекрёстка не образует
        const roadsInCluster = cluster.map((i) => ends[i].road);
        const arms: Arm[] = [];
        for (const index of cluster) {
            const end = ends[index];
            if (roadsInCluster.filter((r) => r === end.road).length > 1) continue;
            const arm = buildArm(roads[end.road], end.atStart, p.depth);
            if (arm) arms.push(arm);
        }
        if (arms.length < 2) continue;

        // Все дороги вдоль одной прямой — это просто длинная дорога, не перекрёсток
        const axes = new Set(
            arms.map(({ dir }) => `${Math.abs(dir[0]).toFixed(2)},${Math.abs(dir[1]).toFixed(2)}`)
        );
        if (axes.size < 2) continue;

        plazas.push(generatePlazaGeometry(arms, p));

        console.log(
            `🏛️ [PlazaGenerator] Площадь: ${arms.length} дорог, ` +
            `depth=${p.depth}, radius=${p.cornerRadius}`
        );
    }

    return plazas;
}
