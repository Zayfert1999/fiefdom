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
//       Глубина растёт вместе с шириной дорог (см. requiredEdgeLengths);
//     • площадь отдаёт и «срезы» дорог (PlazaCut): дальше среза дорога идёт
//       отдельным полигоном, начинающимся ровно на ребре среза. Вычитать
//       площадь из дорог булевой операцией не нужно — там и рождались осколки;
//     • «сквозной» край (противоположные дороги) определяется по общей
//       точке торцов, а не только по углу между осями: шум изгибает дороги;
//     • готовый контур проверяется на самопересечения (buildValidPlaza).
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
    /**
     * Минимальная глубина площади вдоль дороги: расстояние по оси от центра перекрёстка до среза (юниты).
     * У широких дорог срез уходит глубже сам: он обязан лежать за внутренним углом и его скруглением.
     */
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

/**
 * Торцы противоположных дорог делят одну точку: плюс-край одной и минус-край другой
 * начинаются в одном месте. Это надёжнее угла между осями: шум изгибает дороги,
 * и угол легко выходит за порог, хотя край по-прежнему сквозной.
 */
const SHARED_END_RATIO = 0.15;

function areOpposite(A: Arm, B: Arm): boolean {
    if (A.dir[0] * B.dir[0] + A.dir[1] * B.dir[1] < OPPOSITE_DOT) return true;
    const width = dist(A.plus[0], A.minus[0]);
    return width > EPS && dist(A.plus[0], B.minus[0]) < width * SHARED_END_RATIO;
}

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
function buildArm(line: TessellatedLine, atStart: boolean, depth: number, minEdgeS = 0): Arm | null {
    const n = line.center.length;
    if (n < 2) return null;

    const center = atStart ? line.center : [...line.center].reverse();
    const plus = atStart ? line.left : [...line.right].reverse();
    const minus = atStart ? line.right : [...line.left].reverse();

    const centerS = cumulative(center);
    const plusS = cumulative(plus);
    const minusS = cumulative(minus);
    // Срез ставим там, где и ось, и оба края прошли нужную глубину:
    // на изгибе внешний край длиннее оси, внутренний короче
    let cap = n - 1;
    for (let i = 1; i < n; i++) {
        if (centerS[i] >= depth && plusS[i] >= minEdgeS && minusS[i] >= minEdgeS) {
            cap = i;
            break;
        }
    }

    // Направление берём по участку ~6 юнитов, а не по первому отрезку
    let k = 1;
    while (k < cap && centerS[k] < 6) k++;
    const dir = unit(center[0], center[k]);
    if (dir[0] === 0 && dir[1] === 0) return null;

    return { dir, plus, minus, plusS, minusS, cap };
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
    if (areOpposite(A, B)) {
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
// 📏 ГЛУБИНА СРЕЗА ПО ШИРИНЕ ДОРОГИ
// ============================================
/** Запас за скруглением, чтобы срез не попадал в саму точку касания (юниты) */
const CAP_SLACK = 1;

/**
 * Для каждой дороги: на какую длину по краю надо уйти от перекрёстка, чтобы
 * срез оказался ЗА внутренним углом и его скруглением. Зависит от ширины дорог
 * и от изгиба, поэтому фиксированный `depth` для широких дорог не годится:
 * пересечение краёв остаётся за срезом, и контур собирается неверно.
 */
function requiredEdgeLengths(probes: readonly (Arm | null)[], p: PlazaParams): number[] {
    const need = probes.map(() => 0);
    const order = probes
        .map((arm, i) => ({ arm, i }))
        .filter((e): e is { arm: Arm; i: number } => e.arm !== null)
        .sort((a, b) => Math.atan2(a.arm.dir[1], a.arm.dir[0]) - Math.atan2(b.arm.dir[1], b.arm.dir[0]));

    for (let k = 0; k < order.length; k++) {
        const A = order[k];
        const B = order[(k + 1) % order.length];
        if (A === B || areOpposite(A.arm, B.arm)) continue;
        const crossing = findCrossing(A.arm, B.arm);
        if (!crossing) continue;
        need[A.i] = Math.max(need[A.i], crossing.sA + p.cornerRadius + CAP_SLACK);
        need[B.i] = Math.max(need[B.i], crossing.sB + p.cornerRadius + CAP_SLACK);
    }
    return need;
}

// ============================================
// ✂️ СРЕЗЫ ДОРОГ
// ============================================
/**
 * Где площадь обрывает дорогу. Дорога дальше идёт полигоном, который начинается
 * на ребре среза (левая и правая вершины с индексом `index`) — то же ребро
 * есть в контуре площади, поэтому полигоны стыкуются вершина в вершину.
 */
export interface PlazaCut {
    readonly roadId: string;
    /** Площадь у начала оси дороги (true) или у её конца (false) */
    readonly atStart: boolean;
    /**
     * Индекс вершины дороги, на которой проходит срез. Площадь забирает всё от
     * перекрёстка до неё: при `atStart` — вершины [0..index], иначе [index..конец].
     */
    readonly index: number;
}

/** Площадь вместе со срезами дорог, которые в неё входят */
export interface Junction {
    readonly geometry: AreaGeometry;
    readonly cuts: readonly PlazaCut[];
}

// ============================================
// 🛡️ ПРОВЕРКА КОНТУРА
// ============================================
/** Контур площади в точках (кривые берём грубо — для проверки хватает) */
function sampleOutline(geometry: AreaGeometry): Point[] {
    const points: Point[] = [geometry.start];
    let current = geometry.start;
    for (const seg of geometry.outline) {
        if (seg.type === 'line') {
            points.push(seg.to);
            current = seg.to;
        } else if (seg.type === 'quadratic') {
            for (let i = 1; i <= 8; i++) {
                const t = i / 8;
                const mt = 1 - t;
                points.push([
                    mt * mt * current[0] + 2 * mt * t * seg.cp[0] + t * t * seg.to[0],
                    mt * mt * current[1] + 2 * mt * t * seg.cp[1] + t * t * seg.to[1],
                ]);
            }
            current = seg.to;
        } else if ('to' in seg) {
            points.push(seg.to as Point);
            current = seg.to as Point;
        }
    }
    return points;
}

const orient2 = (a: Point, b: Point, c: Point): number => {
    const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return Math.abs(v) < 1e-9 ? 0 : v;
};

function ringSelfIntersects(ring: readonly Point[]): boolean {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            const c = ring[j];
            const d = ring[(j + 1) % n];
            if (orient2(a, b, c) * orient2(a, b, d) < 0 && orient2(c, d, a) * orient2(c, d, b) < 0) return true;
        }
    }
    return false;
}

/**
 * Строит контур и проверяет его. Если со скруглением он самопересекается,
 * пробуем без скруглений (острые углы по пересечению краёв).
 * Если и так не вышло — лучше не строить площадь, чем отдать битый контур.
 */
function buildValidPlaza(arms: readonly Arm[], p: PlazaParams): AreaGeometry | null {
    const attempts: PlazaParams[] = [p, { ...p, cornerRadius: 0 }];
    for (const attempt of attempts) {
        const geometry = generatePlazaGeometry(arms, attempt);
        if (!ringSelfIntersects(sampleOutline(geometry))) return geometry;
    }
    return null;
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
    return generateJunctions(tessellatedLines, params).map((junction) => junction.geometry);
}

/**
 * То же, что `generatePlazas`, но вместе со срезами дорог (см. PlazaCut):
 * по ним дороги обрезаются без булевых операций.
 */
export function generateJunctions(
    tessellatedLines: ReadonlyMap<string, TessellatedLine>,
    params?: Partial<PlazaParams>
): Junction[] {
    if (tessellatedLines.size < 2) return [];

    const p = resolvePlazaParams(params);
    const roadIds = [...tessellatedLines.keys()];
    const roads = [...tessellatedLines.values()];

    const ends: RoadEnd[] = [];
    roads.forEach((line, road) => {
        if (line.center.length < 2) return;
        ends.push({ road, atStart: true, point: line.center[0] });
        ends.push({ road, atStart: false, point: line.center[line.center.length - 1] });
    });

    const junctions: Junction[] = [];

    for (const cluster of clusterEnds(ends, p.clusterTolerance)) {
        if (cluster.length < 2) continue;

        // Дорога, оба конца которой в кластере (петля), перекрёстка не образует
        const roadsInCluster = cluster.map((i) => ends[i].road);
        const entries = cluster
            .map((index) => ends[index])
            .filter((end) => roadsInCluster.filter((r) => r === end.road).length === 1);

        // Пробные лучи на всю длину: нужны, чтобы узнать, где реально сходятся края
        const probes = entries.map((end) => buildArm(roads[end.road], end.atStart, Infinity));
        const needS = requiredEdgeLengths(probes, p);

        const arms: Arm[] = [];
        const cuts: PlazaCut[] = [];
        entries.forEach((end, i) => {
            if (!probes[i]) return;
            const arm = buildArm(roads[end.road], end.atStart, p.depth, needS[i]);
            if (!arm) return;
            arms.push(arm);
            // Рёбра луча идут от перекрёстка наружу; у конца оси порядок вершин дороги обратный
            const last = roads[end.road].center.length - 1;
            cuts.push({
                roadId: roadIds[end.road],
                atStart: end.atStart,
                index: end.atStart ? arm.cap : last - arm.cap,
            });
        });
        if (arms.length < 2) continue;

        // Все дороги вдоль одной прямой — это просто длинная дорога, не перекрёсток
        const axes = new Set(
            arms.map(({ dir }) => `${Math.abs(dir[0]).toFixed(2)},${Math.abs(dir[1]).toFixed(2)}`)
        );
        if (axes.size < 2) continue;

        const plaza = buildValidPlaza(arms, p);
        if (!plaza) {
            console.warn('🏛️ [PlazaGenerator] Контур площади самопересекается даже без скругления — площадь пропущена');
            continue;
        }
        junctions.push({ geometry: plaza, cuts });

        console.log(
            `🏛️ [PlazaGenerator] Площадь: ${arms.length} дорог, ` +
            `depth=${p.depth}, radius=${p.cornerRadius}`
        );
    }

    return junctions;
}
