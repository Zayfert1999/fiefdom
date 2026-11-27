// packages/client/src/core/geometry/townGeometry.ts
// ============================================
// 🏘 РАСКЛАДКА ВНУТРЕННЕГО УСТРОЙСТВА ГОРОДА
// ============================================
// Чистый модуль (без three и React): регион города + параметры → площадь, улицы, дома.
//
// 1. 🏛 ПЛОЩАДЬ. Центр — полюс недоступности (polylabel, spots.ts): самая удалённая от всех
//    границ точка, в том числе от внутренних колец (поле или монастырь внутри города).
//    В совсем маленьком городе (меньше square.minCityArea) площади нет. Дальше радиус плавно
//    растёт с размером города (townSquareRadius) и ограничен свободным местом вокруг точки.
//
// 2. 🛣 УЛИЦЫ. Точки (плотнее у площади) → релаксация Ллойда → диаграмма Вороного (через
//    триангуляцию Делоне) → рёбра диаграммы обрезаются контуром города с отступом и кругом
//    площади → кратчайшие пути от ворот к площади становятся главными улицами → остальные рёбра
//    прореживаются случайно, тупики внутри города убираются → ломаные разбиваются на цепочки
//    и сглаживаются методом Лапласа.
//    Улица ворот начинается в точке, где ось дороги пересекает контур (как у стен).
//    Сглаживание двухфазное: СНАЧАЛА главные дороги (точки от арки до площади, интенсивнее всего),
//    потом второстепенные улицы — их концы на главных дорогах уже не двигаются.
//    Площадь — МЕСТО НАЗНАЧЕНИЯ, а не стоп-зона: сеть обрезается по кольцу R + подъезд, у каждых
//    ворот свой въезд, а последний отрезок каждой главной дороги — прямой радиальный подъезд от
//    кольца к кромке. Вторичные улицы присоединяются к площади «лучами» в ограниченном числе.
//    Дальние дороги: из площади главные дороги идут в самые удалённые концы города, чтобы сеть
//    охватывала весь город. Прореживание не отрезает кварталы: остов сети всегда связный.
//
// 3. 🏠 ДОМА. Вдоль каждой улицы с обеих сторон идут «ходоки»: на каждом шаге пробуется дом
//    со случайными размерами; он ставится, если целиком в городе (с отступом), не на площади,
//    не на улице и не пересекает уже поставленные дома. Затем дома по кругу вокруг площади.
//
// Всё детерминировано: seed = подпись региона + params.seed. Один и тот же город выглядит
// одинаково у всех игроков и при перерисовке.
//
// Координаты — мировые [x, z] (вторая компонента Point — это z).
// ============================================
import type { Point, Polygon } from '@fiefdom/shared/core/geometry.types';
import { createSeededRandom } from '@fiefdom/shared/prng/seedRandom';
import type { CityRegion, GateSite } from './cityRegions';
import { BOARD_TILE_SIZE } from './regionStitch';
import { poleOfInaccessibility, signedDistanceToPolygon } from './spots';
import type { TownParams, TownSquareParams } from './townParams';

type V2 = [number, number];

// ============================================
// 🧩 ТИПЫ РЕЗУЛЬТАТА
// ============================================

export interface TownSquare {
    readonly x: number;
    readonly z: number;
    readonly radius: number;
}

export interface TownStreet {
    readonly points: readonly Point[];
    readonly width: number;
    readonly kind: 'main' | 'side';
}

export interface TownHouse {
    readonly x: number;
    readonly z: number;
    /** Поворот ширины дома вокруг вертикали (радианы, от оси x к оси z) */
    readonly yaw: number;
    readonly width: number;
    readonly depth: number;
    readonly wallHeight: number;
    readonly roofHeight: number;
    /** Смещение вершины крыши в осях дома (вдоль ширины и глубины) */
    readonly apexU: number;
    readonly apexV: number;
    /** Множитель оттенка 0.9–1.1 */
    readonly tone: number;
    /** Индекс цвета крыши 0–2 */
    readonly roof: number;
    /** Расстояние от площади, нормированное в 0–1 (порядок роста «волной») */
    readonly delay: number;
}

export interface TownLayout {
    readonly squares: readonly TownSquare[];
    readonly streets: readonly TownStreet[];
    readonly houses: readonly TownHouse[];
    /** Что не удалось разложить (для консоли и песочницы) */
    readonly warnings: readonly string[];
}

// ============================================
// 📐 ГЕОМЕТРИЧЕСКИЕ ХЕЛПЕРЫ
// ============================================

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const dist = (p: V2, q: V2): number => Math.hypot(p[0] - q[0], p[1] - q[1]);

function unit(p: V2, q: V2): V2 {
    const l = dist(p, q) || 1;
    return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
}

/** [расстояние, ближайшая точка x, z] до отрезка */
function nearestOnSegment(x: number, z: number, a: V2, b: V2): [number, number, number] {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1) : 0;
    const px = a[0] + dx * t;
    const pz = a[1] + dz * t;
    return [Math.hypot(x - px, z - pz), px, pz];
}

function ringArea(ring: readonly Point[]): number {
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return Math.abs(s) / 2;
}

/** Площадь города: внешнее кольцо минус внутренние */
function polygonArea(polygon: Polygon): number {
    return polygon.reduce((sum, ring, i) => sum + (i === 0 ? 1 : -1) * ringArea(ring), 0);
}

function boundsOf(ring: readonly Point[]): [number, number, number, number] {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of ring) {
        minX = Math.min(minX, x);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxZ = Math.max(maxZ, z);
    }
    return [minX, minZ, maxX, maxZ];
}

/** Параметр t (0–1) пересечения отрезков p→q и a→b или null */
function segmentHit(p: V2, q: V2, a: Point, b: Point): number | null {
    const rx = q[0] - p[0];
    const rz = q[1] - p[1];
    const sx = b[0] - a[0];
    const sz = b[1] - a[1];
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((a[0] - p[0]) * sz - (a[1] - p[1]) * sx) / den;
    const u = ((a[0] - p[0]) * rz - (a[1] - p[1]) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Точка пересечения ломаной с кольцами полигона: первая вдоль ломаной */
function firstHit(polygon: Polygon, polyline: readonly V2[]): V2 | null {
    for (let k = 0; k < polyline.length - 1; k++) {
        const p = polyline[k];
        const q = polyline[k + 1];
        let best: number | null = null;
        for (const ring of polygon) {
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const t = segmentHit(p, q, ring[i], ring[j]);
                if (t !== null && (best === null || t < best)) best = t;
            }
        }
        if (best !== null) return [p[0] + (q[0] - p[0]) * best, p[1] + (q[1] - p[1]) * best];
    }
    return null;
}

interface GatePoint {
    /** Точка ворот на контуре */
    readonly at: V2;
    /** Единичное направление внутрь города */
    readonly dir: V2;
}

/** Где ось дороги пересекает контур: сначала по самой оси, иначе лучом из тупика наружу */
function resolveGate(polygon: Polygon, site: GateSite): GatePoint | null {
    const len = Math.hypot(site.dirX, site.dirZ) || 1;
    const dir: V2 = [site.dirX / len, site.dirZ / len];
    const path = site.path?.map((p): V2 => [p[0], p[1]]);
    const hit =
        (path && path.length >= 2 ? firstHit(polygon, path) : null) ??
        firstHit(polygon, [
            [site.x, site.z],
            [site.x - dir[0] * 200, site.z - dir[1] * 200],
        ]);
    return hit ? { at: hit, dir } : null;
}

// ============================================
// 🏛 РАЗМЕР ГЛАВНОЙ ПЛОЩАДИ
// ============================================

/** Площадь одного тайла в мировых единицах: 1 «площадь тайла» в параметрах площади */
const TILE_AREA = BOARD_TILE_SIZE * BOARD_TILE_SIZE;

/**
 * Радиус главной площади по размеру города (без учёта свободного места вокруг центра).
 *   • город меньше `minCityArea` (в площадях тайла) — 0: площади нет;
 *   • от порога радиус равен `minRadius` и растёт вместе с размером города до `maxRadius`
 *     при `fullSizeArea` и больше. Рост идёт по корню из площади: то есть линейно по «поперечнику»
 *     города, а не по площади — иначе площадь раздувалась бы быстрее самого города.
 */
export function townSquareRadius(cityArea: number, square: TownSquareParams): number {
    if (cityArea < square.minCityArea * TILE_AREA) return 0;
    const from = Math.sqrt(square.minCityArea * TILE_AREA);
    const to = Math.sqrt(square.fullSizeArea * TILE_AREA);
    const t = to > from ? clamp((Math.sqrt(cityArea) - from) / (to - from), 0, 1) : 1;
    return square.minRadius + (square.maxRadius - square.minRadius) * t;
}

// ============================================
// 🔺 ТРИАНГУЛЯЦИЯ ДЕЛОНЕ (Bowyer–Watson) И РЕЛАКСАЦИЯ ЛЛОЙДА
// ============================================

interface Tri {
    readonly v: readonly [number, number, number];
    readonly cx: number;
    readonly cz: number;
    readonly r2: number;
}

type Site = [number, number, number]; // x, z, локальный радиус

const edgeKey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

function delaunay(sites: readonly Site[]): Tri[] {
    const n = sites.length;
    const pts: V2[] = sites.map((s): V2 => [s[0], s[1]]);
    pts.push([-1e5, -1e5], [2e5, -1e5], [0, 2e5]);

    const makeTri = (a: number, b: number, c: number): Tri => {
        const A = pts[a];
        const B = pts[b];
        const C = pts[c];
        let d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
        if (Math.abs(d) < 1e-9) d = 1e-9;
        const a2 = A[0] * A[0] + A[1] * A[1];
        const b2 = B[0] * B[0] + B[1] * B[1];
        const c2 = C[0] * C[0] + C[1] * C[1];
        const ux = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d;
        const uz = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
        return { v: [a, b, c], cx: ux, cz: uz, r2: (A[0] - ux) ** 2 + (A[1] - uz) ** 2 };
    };

    let tris: Tri[] = [makeTri(n, n + 1, n + 2)];
    for (let i = 0; i < n; i++) {
        const p = pts[i];
        const bad: Tri[] = [];
        const keep: Tri[] = [];
        for (const t of tris) ((p[0] - t.cx) ** 2 + (p[1] - t.cz) ** 2 < t.r2 - 1e-9 ? bad : keep).push(t);

        const count = new Map<string, number>();
        const edges: [number, number, string][] = [];
        for (const t of bad) {
            for (let k = 0; k < 3; k++) {
                const a = t.v[k];
                const b = t.v[(k + 1) % 3];
                const key = edgeKey(a, b);
                count.set(key, (count.get(key) ?? 0) + 1);
                edges.push([a, b, key]);
            }
        }
        for (const [a, b, key] of edges) if (count.get(key) === 1) keep.push(makeTri(a, b, i));
        tris = keep;
    }
    return tris.filter((t) => t.v[0] < n && t.v[1] < n && t.v[2] < n);
}

/** Один шаг Ллойда: каждый внутренний узел смещается в центроид своей ячейки Вороного */
function lloydStep(sites: readonly Site[], tris: readonly Tri[]): Site[] {
    const incident: Tri[][] = sites.map(() => []);
    const edgeCount = new Map<string, number>();
    for (const t of tris) {
        for (let k = 0; k < 3; k++) {
            incident[t.v[k]].push(t);
            const key = edgeKey(t.v[k], t.v[(k + 1) % 3]);
            edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
        }
    }

    return sites.map((s, i): Site => {
        const fan = incident[i];
        if (fan.length < 3) return s;
        // Узел на выпуклой оболочке имеет неограниченную ячейку: его не двигаем
        for (const t of fan) {
            for (let k = 0; k < 3; k++) {
                const a = t.v[k];
                const b = t.v[(k + 1) % 3];
                if ((a === i || b === i) && edgeCount.get(edgeKey(a, b)) === 1) return s;
            }
        }
        const ring: V2[] = fan
            .map((t): V2 => [t.cx, t.cz])
            .sort((p, q) => Math.atan2(p[1] - s[1], p[0] - s[0]) - Math.atan2(q[1] - s[1], q[0] - s[0]));
        let area = 0;
        let cx = 0;
        let cz = 0;
        for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
            const f = ring[j][0] * ring[k][1] - ring[k][0] * ring[j][1];
            area += f;
            cx += (ring[j][0] + ring[k][0]) * f;
            cz += (ring[j][1] + ring[k][1]) * f;
        }
        area /= 2;
        if (Math.abs(area) < 1e-6) return s;
        const nx = cx / (6 * area);
        const nz = cz / (6 * area);
        return Number.isFinite(nx) && Number.isFinite(nz) && Math.hypot(nx - s[0], nz - s[1]) < s[2] ? [nx, nz, s[2]] : s;
    });
}

// ============================================
// 🧭 МАРШРУТ ВОРОТ БЕЗ СЕТИ (запасной): прямая или A* по сетке
// ============================================

/** Отрезок p→q идёт по свободной земле (или по площади) */
function lineClear(sd: (x: number, z: number) => number, p: V2, q: V2, halfWidth: number, c: V2, radius: number): boolean {
    const n = Math.max(1, Math.ceil(dist(p, q) / 2));
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = p[0] + (q[0] - p[0]) * t;
        const z = p[1] + (q[1] - p[1]) * t;
        if (sd(x, z) < halfWidth + 1 && Math.hypot(x - c[0], z - c[1]) > radius) return false;
    }
    return true;
}

function gridRoute(
    sd: (x: number, z: number) => number,
    from: V2,
    to: V2,
    halfWidth: number,
    c: V2,
    radius: number,
    bb: readonly [number, number, number, number]
): V2[] | null {
    const cs = 3;
    const gx = Math.ceil((bb[2] - bb[0]) / cs) + 1;
    const gz = Math.ceil((bb[3] - bb[1]) / cs) + 1;
    const total = gx * gz;
    const pos = (k: number): V2 => [bb[0] + (k % gx) * cs, bb[1] + Math.floor(k / gx) * cs];
    const cell = (p: V2): number =>
        clamp(Math.round((p[0] - bb[0]) / cs), 0, gx - 1) + clamp(Math.round((p[1] - bb[1]) / cs), 0, gz - 1) * gx;

    const pass: boolean[] = [];
    for (let k = 0; k < total; k++) {
        const p = pos(k);
        pass[k] = sd(p[0], p[1]) >= halfWidth + 1.5 || Math.hypot(p[0] - c[0], p[1] - c[1]) <= radius + cs;
    }
    const s = cell(from);
    const g = cell(to);
    pass[s] = true;
    pass[g] = true;

    const gs = new Map<number, number>([[s, 0]]);
    const prev = new Map<number, number>();
    const closed = new Set<number>();
    const open: number[] = [s];
    while (open.length > 0) {
        let bi = 0;
        let bf = Infinity;
        for (let i = 0; i < open.length; i++) {
            const f = (gs.get(open[i]) ?? 0) + dist(pos(open[i]), to);
            if (f < bf) {
                bf = f;
                bi = i;
            }
        }
        const cur = open.splice(bi, 1)[0];
        if (cur === g) break;
        closed.add(cur);
        const cx = cur % gx;
        const cz = Math.floor(cur / gx);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;
                const nx = cx + dx;
                const nz = cz + dz;
                if (nx < 0 || nz < 0 || nx >= gx || nz >= gz) continue;
                const nk = nx + nz * gx;
                if (closed.has(nk) || !pass[nk]) continue;
                const np = pos(nk);
                const penalty = sd(np[0], np[1]) < halfWidth + 9 ? 1.5 : 0;
                const ng = (gs.get(cur) ?? 0) + (dx !== 0 && dz !== 0 ? 1.41 : 1) * cs * (1 + penalty);
                const old = gs.get(nk);
                if (old === undefined || ng < old) {
                    gs.set(nk, ng);
                    prev.set(nk, cur);
                    if (!open.includes(nk)) open.push(nk);
                }
            }
        }
    }
    if (!gs.has(g)) return null;

    const path: V2[] = [];
    for (let k: number | undefined = g; k !== undefined && k !== s; k = prev.get(k)) path.unshift(pos(k));
    const all: V2[] = [from, ...path.slice(0, -1), to];
    const out: V2[] = [from];
    let idx = 0;
    while (idx < all.length - 1) {
        let j = all.length - 1;
        while (j > idx + 1 && !lineClear(sd, all[idx], all[j], halfWidth, c, radius)) j--;
        out.push(all[j]);
        idx = j;
    }
    return out;
}

// ============================================
// 🕸 СЕТЬ УЛИЦ: ВОРОНОЙ + ЛАПЛАС
// ============================================

type NodeFlag = 'free' | 'wall' | 'sq' | 'gate' | 'gate2';

interface GraphNode {
    readonly p: V2;
    f: NodeFlag;
}

interface GraphEdge {
    readonly a: number;
    readonly b: number;
    readonly len: number;
    kind: 'main' | 'side';
    keep: boolean;
    /** Радиальный подъезд к площади: прореживание и чистка тупиков его не трогают */
    protect?: boolean;
}

/** Шаг точек на главных и второстепенных улицах перед сглаживанием */
const MAIN_STEP = 3;
const SIDE_STEP = 5;
/** Мосты между обломками сети: не длиннее этого числа размеров квартала */
const BRIDGE_FACTOR = 2.5;

interface StreetNetworkInput {
    readonly sd: (x: number, z: number) => number;
    readonly bb: readonly [number, number, number, number];
    readonly center: V2;
    readonly radius: number;
    readonly cityRadius: number;
    readonly gates: readonly GatePoint[];
    readonly params: TownParams;
    readonly rnd: () => number;
    readonly warnings: string[];
}

function buildStreetNetwork(input: StreetNetworkInput): TownStreet[] {
    const { sd, bb, center: c, radius: R, cityRadius, gates, params, rnd, warnings } = input;
    const S = params.streets;
    const Q = params.square;
    /** Площадь есть: она — место назначения главных дорог */
    const hasSquare = R > 0;
    /** Радиальный подъезд пропорционален радиусу площади */
    const approach = hasSquare ? clamp(R * Q.approachRatio, Q.approachMin, Q.approachMax) : 0;
    /** Вокруг площади сеть улиц обрезается по этому кольцу: внутри кольца — только подъезды */
    const ringRadius = R + approach;
    const hwSide = S.sideWidth / 2;
    const lim = params.edgeInset + hwSide + 0.5;
    const block = S.blockSize;

    // --- 1. Точки: плотнее у площади, реже к краям ---
    const margin = block * 1.3;
    const x0 = bb[0] - margin;
    const x1 = bb[2] + margin;
    const z0 = bb[1] - margin;
    const z1 = bb[3] + margin;
    let sites: Site[] = [];
    const localRadius = (x: number, z: number): number =>
        block * (0.65 + 0.55 * clamp(Math.hypot(x - c[0], z - c[1]) / cityRadius, 0, 1.2));
    for (let tries = 0; tries < 5000 && sites.length < 300; tries++) {
        const x = x0 + rnd() * (x1 - x0);
        const z = z0 + rnd() * (z1 - z0);
        const r = localRadius(x, z);
        if (sites.every((s) => Math.hypot(x - s[0], z - s[1]) >= Math.min(r, s[2]))) sites.push([x, z, r]);
    }
    for (let i = 0; i < 2; i++) sites = lloydStep(sites, delaunay(sites));

    // --- 2. Рёбра диаграммы Вороного: соединяем центры описанных окружностей соседних треугольников ---
    const tris = delaunay(sites);
    const byEdge = new Map<string, Tri[]>();
    for (const t of tris) {
        for (let k = 0; k < 3; k++) {
            const key = edgeKey(t.v[k], t.v[(k + 1) % 3]);
            const list = byEdge.get(key);
            if (list) list.push(t);
            else byEdge.set(key, [t]);
        }
    }

    const inside = (x: number, z: number): boolean => sd(x, z) >= lim && (!hasSquare || Math.hypot(x - c[0], z - c[1]) >= ringRadius);
    const cause = (x: number, z: number): NodeFlag => (hasSquare && Math.hypot(x - c[0], z - c[1]) < ringRadius ? 'sq' : 'wall');
    const refine = (outer: V2, inner: V2): V2 => {
        let a = outer;
        let b = inner;
        for (let k = 0; k < 7; k++) {
            const m: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            if (inside(m[0], m[1])) b = m;
            else a = m;
        }
        return b;
    };

    /** Куски отрезка p→q внутри застраиваемой зоны: [начало, конец, флаг начала, флаг конца] */
    const clip = (p: V2, q: V2): [V2, V2, NodeFlag, NodeFlag][] => {
        const n = Math.max(2, Math.ceil(dist(p, q) / 1.5));
        const out: [V2, V2, NodeFlag, NodeFlag][] = [];
        let start: { p: V2; f: NodeFlag } | null = null;
        let prev: V2 = p;
        let prevIn = false;
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const pt: V2 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
            const inn = inside(pt[0], pt[1]);
            if (inn && !prevIn) start = i === 0 ? { p: pt, f: 'free' } : { p: refine(prev, pt), f: cause(prev[0], prev[1]) };
            if (!inn && prevIn && start) {
                out.push([start.p, refine(pt, prev), start.f, cause(pt[0], pt[1])]);
                start = null;
            }
            prev = pt;
            prevIn = inn;
        }
        if (prevIn && start) out.push([start.p, prev, start.f, 'free']);
        return out;
    };

    const nodes: GraphNode[] = [];
    const nodeIndex = new Map<string, number>();
    const edges: GraphEdge[] = [];
    const edgeIndex = new Set<string>();

    const addNode = (p: V2, f: NodeFlag): number => {
        const key = `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
        const found = nodeIndex.get(key);
        if (found === undefined) {
            nodeIndex.set(key, nodes.length);
            nodes.push({ p, f });
            return nodes.length - 1;
        }
        if (f !== 'free') nodes[found].f = f;
        return found;
    };
    const addEdge = (a: number, b: number, kind: 'main' | 'side' = 'side', protect = false): void => {
        if (a === b) return;
        const key = edgeKey(a, b);
        if (edgeIndex.has(key)) return;
        const len = dist(nodes[a].p, nodes[b].p);
        if (len < 1) return;
        edgeIndex.add(key);
        edges.push({ a, b, len, kind, keep: true, protect });
    };

    for (const list of byEdge.values()) {
        if (list.length !== 2) continue;
        const p: V2 = [list[0].cx, list[0].cz];
        const q: V2 = [list[1].cx, list[1].cz];
        if (Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(q[0]), Math.abs(q[1])) > 1e4) continue;
        for (const [a, b, fa, fb] of clip(p, q)) addEdge(addNode(a, fa), addNode(b, fb));
    }

    // --- 3. Ворота: короткий «подъезд» от контура и стык с ближайшим узлом сети ---
    const gateNodes: number[] = [];
    for (const gate of gates) {
        // Прямой участок от арки; не короче, чем нужно, чтобы выйти из полосы дороги у стены
        const run = Math.max(S.mainWidth / 2 + 2, S.archRun);
        const start: V2 = gate.at;
        const mouth: V2 = [start[0] + gate.dir[0] * run, start[1] + gate.dir[1] * run];
        const halfMain = S.mainWidth / 2;

        const candidates: [number, number][] = [];
        nodes.forEach((n, i) => {
            if (n.f !== 'free') return;
            const d = dist(n.p, mouth);
            if (d < 80) candidates.push([d, i]);
        });
        candidates.sort((u, v) => u[0] - v[0]);
        let target = -1;
        for (const [, i] of candidates.slice(0, 14)) {
            if (lineClear(sd, mouth, nodes[i].p, halfMain, [1e9, 1e9], 0)) {
                target = i;
                break;
            }
        }

        const gateId = addNode(start, 'gate');
        const mouthId = addNode(mouth, 'gate2');
        gateNodes.push(gateId);
        addEdge(gateId, mouthId, 'main');
        if (target >= 0) {
            addEdge(mouthId, target, 'main');
            continue;
        }

        // Сети поблизости нет: прямая или обход по сетке до края площади
        const route =
            hasSquare && lineClear(sd, mouth, c, halfMain, c, ringRadius) ? [mouth, c] : gridRoute(sd, mouth, c, halfMain, c, ringRadius, bb);
        if (!route) {
            warnings.push('ворота не соединены с площадью: нет свободного пути');
            continue;
        }
        const last = route[route.length - 1];
        const prev = route[route.length - 2] ?? mouth;
        const u = unit(c, prev);
        const end: V2 = hasSquare ? [c[0] + u[0] * ringRadius, c[1] + u[1] * ringRadius] : last;
        const chain = [...route.slice(0, -1), end];
        let prevId = mouthId;
        chain.forEach((p, k) => {
            if (k === 0 && p === mouth) return;
            const id = addNode(p, k === chain.length - 1 ? 'sq' : 'free');
            addEdge(prevId, id, 'main');
            prevId = id;
        });
    }

    // --- 3б. Мосты: в узких местах сеть рвётся на обломки; соединяем их кратчайшими свободными
    // перемычками, чтобы ни один квартал не оказался отрезан от ворот и площади ---
    {
        const parent = nodes.map((_, i) => i);
        const find = (i: number): number => {
            let root = i;
            while (parent[root] !== root) root = parent[root];
            for (let k = i; parent[k] !== root; ) {
                const next = parent[k];
                parent[k] = root;
                k = next;
            }
            return root;
        };
        for (const e of edges) parent[find(e.a)] = find(e.b);

        const maxBridge = block * BRIDGE_FACTOR;
        const bridgeable = (i: number): boolean => nodes[i].f === 'free' || nodes[i].f === 'wall';
        const pairs: [number, number, number][] = [];
        for (let i = 0; i < nodes.length; i++) {
            if (!bridgeable(i)) continue;
            for (let j = i + 1; j < nodes.length; j++) {
                if (!bridgeable(j) || find(i) === find(j)) continue;
                const d = dist(nodes[i].p, nodes[j].p);
                if (d <= maxBridge) pairs.push([d, i, j]);
            }
        }
        pairs.sort((u, v) => u[0] - v[0]);

        /** Перемычка идёт по свободной земле и не пересекает уже проложенные улицы */
        const clearBridge = (i: number, j: number): boolean => {
            const p = nodes[i].p;
            const q = nodes[j].p;
            const n = Math.max(2, Math.ceil(dist(p, q) / 2));
            for (let k = 1; k < n; k++) {
                const t = k / n;
                const x = p[0] + (q[0] - p[0]) * t;
                const z = p[1] + (q[1] - p[1]) * t;
                if (sd(x, z) < lim - 0.5) return false;
                if (hasSquare && Math.hypot(x - c[0], z - c[1]) < ringRadius - 0.5) return false;
            }
            for (const e of edges) {
                if (e.a === i || e.a === j || e.b === i || e.b === j) continue;
                if (segmentHit(p, q, nodes[e.a].p, nodes[e.b].p) !== null) return false;
            }
            return true;
        };

        for (const [, i, j] of pairs) {
            if (find(i) === find(j) || !clearBridge(i, j)) continue;
            addEdge(i, j, 'side');
            parent[find(i)] = find(j);
        }
    }

    // --- 4. Главные улицы: кратчайшие пути от ворот к площади ---
    const buildAdjacency = (keptOnly: boolean): [number, number][][] => {
        const adj: [number, number][][] = nodes.map(() => []);
        edges.forEach((e, i) => {
            if (keptOnly && !e.keep) return;
            adj[e.a].push([e.b, i]);
            adj[e.b].push([e.a, i]);
        });
        return adj;
    };

    let adj = buildAdjacency(false);
    // Узлы на кольце вокруг площади: сюда сеть «упирается», отсюда начинаются радиальные подъезды
    const ringNodes: number[] = [];
    nodes.forEach((n, i) => {
        if (n.f === 'sq') ringNodes.push(i);
    });
    const targets = new Set<number>(ringNodes);
    if (targets.size === 0) {
        // Площади нет (город тесный или маленький): цель — узел сети, ближайший к центру
        let best = -1;
        let bestD = Infinity;
        nodes.forEach((n, i) => {
            if (n.f !== 'free') return;
            const d = dist(n.p, c);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        });
        if (best >= 0) targets.add(best);
    }

    /** Кратчайшие пути из `source` по всему графу (Дейкстра); `stopAt` — остановиться на первой из этих целей */
    const treeOf = (source: number, stopAt?: Set<number>) => {
        const dd = new Map<number, number>([[source, 0]]);
        const viaEdge = new Map<number, number>();
        const viaNode = new Map<number, number>();
        const done = new Set<number>();
        for (;;) {
            let u = -1;
            let best = Infinity;
            for (const [i, d] of dd) {
                if (!done.has(i) && d < best) {
                    best = d;
                    u = i;
                }
            }
            if (u < 0) break;
            done.add(u);
            if (stopAt?.has(u)) break;
            for (const [v, ei] of adj[u]) {
                // Уже главные рёбра чуть «дешевле»: пути от разных ворот сливаются в магистраль
                const w = edges[ei].len * (edges[ei].kind === 'main' ? 0.6 : 1);
                const old = dd.get(v);
                if (old === undefined || best + w < old) {
                    dd.set(v, best + w);
                    viaNode.set(v, u);
                    viaEdge.set(v, ei);
                }
            }
        }
        return { dd, viaEdge, viaNode };
    };
    type Tree = ReturnType<typeof treeOf>;

    /** Делает рёбра пути от `to` обратно к корню дерева главными */
    const markPath = (tree: Tree, source: number, to: number): void => {
        for (let cur = to; cur !== source; ) {
            const e = tree.viaEdge.get(cur);
            const prevNode = tree.viaNode.get(cur);
            if (e === undefined || prevNode === undefined) break;
            edges[e].kind = 'main';
            cur = prevNode;
        }
    };

    const entrances: number[] = [];
    const minSep = (S.entranceMinSep * Math.PI) / 180;
    const angleOf = (i: number): number => Math.atan2(nodes[i].p[1] - c[1], nodes[i].p[0] - c[0]);
    const angDiff = (a: number, b: number): number => {
        const d = Math.abs(a - b) % (2 * Math.PI);
        return d > Math.PI ? 2 * Math.PI - d : d;
    };
    /** Точки на кромке площади, куда выходят подъезды: площадь соединяет их между собой как узел сети */
    const rim: number[] = [];
    /** Радиальный подъезд: от узла кольца прямо к кромке площади */
    const stub = (ring: number, kind: 'main' | 'side'): void => {
        const u = unit(c, nodes[ring].p);
        const end = addNode([c[0] + u[0] * R, c[1] + u[1] * R], 'sq');
        rim.push(end);
        addEdge(ring, end, kind, true);
    };

    if (!hasSquare) {
        for (const source of gateNodes) {
            const tree = treeOf(source, targets);
            const hit = [...tree.dd.keys()]
                .filter((i) => targets.has(i))
                .sort((a, b) => (tree.dd.get(a) ?? 0) - (tree.dd.get(b) ?? 0))[0];
            if (hit !== undefined) markPath(tree, source, hit);
        }
    } else {
        // Площадь — место назначения: у каждых ворот СВОЙ въезд. Ворота обрабатываются от самых
        // «дешёвых» к дорогим, и каждые берут самый дешёвый въезд не ближе minSep к уже занятым
        const trees = gateNodes.map((g) => treeOf(g));
        const order = gateNodes
            .map((g, k) => ({ g, k, best: Math.min(...ringNodes.map((r) => trees[k].dd.get(r) ?? Infinity)) }))
            .sort((a, b) => a.best - b.best);
        for (const { g, k } of order) {
            const tree = trees[k];
            const candidates = ringNodes
                .filter((r) => tree.dd.has(r))
                .sort((a, b) => (tree.dd.get(a) ?? 0) - (tree.dd.get(b) ?? 0));
            if (candidates.length === 0) continue;
            const pick =
                candidates.find((r) => entrances.every((o) => o !== r && angDiff(angleOf(o), angleOf(r)) >= minSep)) ?? candidates[0];
            if (!entrances.includes(pick)) entrances.push(pick);
            markPath(tree, g, pick);
        }
        for (const r of entrances) stub(r, 'main');
    }

    // Дальние дороги: главные дороги в самые удалённые от главной сети концы города.
    // Каждая идёт от площади (свой новый въезд, если на кольце есть место) или ответвляется от главной сети
    if (S.farRoads > 0 && gateNodes.length > 0) {
        for (let f = 0; f < S.farRoads; f++) {
            const samples: V2[] = [];
            for (const e of edges) {
                if (e.kind !== 'main') continue;
                const A = nodes[e.a].p;
                const B = nodes[e.b].p;
                const n = Math.max(1, Math.ceil(e.len / 4));
                for (let k = 0; k <= n; k++) samples.push([A[0] + ((B[0] - A[0]) * k) / n, A[1] + ((B[1] - A[1]) * k) / n]);
            }
            let target = -1;
            let farthest = S.farCover;
            nodes.forEach((n, i) => {
                if (n.f !== 'free' && n.f !== 'wall') return;
                let d = Infinity;
                for (const p of samples) d = Math.min(d, dist(n.p, p));
                if (d > farthest) {
                    farthest = d;
                    target = i;
                }
            });
            if (target < 0) break;

            const tree = treeOf(target);
            let ring = -1;
            let ringCost = Infinity;
            for (const r of ringNodes) {
                if (!tree.dd.has(r) || entrances.includes(r)) continue;
                if (!entrances.every((o) => angDiff(angleOf(o), angleOf(r)) >= minSep)) continue;
                const cost = tree.dd.get(r) ?? Infinity;
                if (cost < ringCost) {
                    ringCost = cost;
                    ring = r;
                }
            }
            const mainNodes = new Set<number>();
            for (const e of edges) if (e.kind === 'main') mainNodes.add(e.a).add(e.b);
            let join = -1;
            let joinCost = Infinity;
            for (const m of mainNodes) {
                if (m === target || !tree.dd.has(m)) continue;
                const cost = tree.dd.get(m) ?? Infinity;
                if (cost < joinCost) {
                    joinCost = cost;
                    join = m;
                }
            }
            // Новый въезд на площадь предпочтительнее, если он не намного дальше ответвления
            const useRing = ring >= 0 && ringCost * 0.8 <= joinCost;
            const source = useRing ? ring : join;
            if (source < 0) break;
            markPath(tree, target, source);
            if (useRing) {
                entrances.push(source);
                stub(source, 'main');
            }
        }
    }

    // Вторичные «лучи» к площади: не больше maxRays, разведены по углу; без ворот — минимум 4
    if (hasSquare) {
        const maxRays = gateNodes.length === 0 ? Math.max(S.maxRays, 4) : S.maxRays;
        const raySep = (S.raySep * Math.PI) / 180;
        const taken = [...entrances];
        for (let k = 0; k < maxRays; k++) {
            let best = -1;
            let bestSep = -1;
            for (const r of ringNodes) {
                if (taken.includes(r)) continue;
                const sep = taken.length > 0 ? Math.min(...taken.map((o) => angDiff(angleOf(o), angleOf(r)))) : Math.PI;
                if (sep > bestSep) {
                    bestSep = sep;
                    best = r;
                }
            }
            if (best < 0 || bestSep < raySep) break;
            taken.push(best);
            stub(best, 'side');
        }
    }

    // Связность через площадь: обломок сети, до которого можно добраться только мимо площади (узкое
    // место города), получает свой «луч» к ней сверх лимита maxRays — иначе квартал остался бы без улиц
    if (hasSquare && gateNodes.length > 0) {
        const hub = (): Set<number> => {
            const seenNodes = new Set<number>(gateNodes);
            const queue = [...gateNodes];
            let hubOpened = false;
            for (let qi = 0; qi < queue.length; qi++) {
                const u = queue[qi];
                const next = adj[u].map(([v]) => v);
                if (!hubOpened && rim.includes(u)) {
                    hubOpened = true;
                    next.push(...rim);
                }
                for (const v of next) {
                    if (!seenNodes.has(v)) {
                        seenNodes.add(v);
                        queue.push(v);
                    }
                }
            }
            return seenNodes;
        };
        adj = buildAdjacency(false);
        const reached = hub();
        const taken = [...entrances, ...rim.map((r) => adj[r][0]?.[0]).filter((x): x is number => x !== undefined)];
        const handled = new Set<number>();
        for (const r of ringNodes) {
            if (reached.has(r) || handled.has(r) || taken.includes(r)) continue;
            // Компонента этого узла кольца: выбираем её узел кольца, наиболее удалённый по углу от занятых
            const comp = new Set<number>([r]);
            const stack = [r];
            while (stack.length > 0) {
                const u = stack.pop() as number;
                for (const [v] of adj[u]) {
                    if (!comp.has(v)) {
                        comp.add(v);
                        stack.push(v);
                    }
                }
            }
            let best = -1;
            let bestSep = -1;
            for (const q of ringNodes) {
                if (!comp.has(q) || taken.includes(q)) continue;
                const sep = taken.length > 0 ? Math.min(...taken.map((o) => angDiff(angleOf(o), angleOf(q)))) : Math.PI;
                if (sep > bestSep) {
                    bestSep = sep;
                    best = q;
                }
            }
            for (const q of comp) handled.add(q);
            if (best < 0) continue;
            taken.push(best);
            stub(best, 'side');
        }
    }

    // --- 5. Прореживание: остов сети всегда связный, случайно убирается часть остальных рёбер ---
    {
        const parent = nodes.map((_, i) => i);
        const find = (i: number): number => {
            let root = i;
            while (parent[root] !== root) root = parent[root];
            for (let k = i; parent[k] !== root; ) {
                const next = parent[k];
                parent[k] = root;
                k = next;
            }
            return root;
        };
        const union = (a: number, b: number): void => {
            parent[find(a)] = find(b);
        };
        for (const e of edges) if (e.kind === 'main') union(e.a, e.b);
        const shuffled = edges
            .filter((e) => e.kind !== 'main')
            .map((e) => ({ e, key: rnd() }))
            .sort((p, q) => p.key - q.key);
        for (const { e } of shuffled) {
            // Ребро, замыкающее новый квартал, остаётся с вероятностью keepFraction; остовные — всегда
            if (find(e.a) !== find(e.b)) union(e.a, e.b);
            else if (!e.protect && rnd() >= S.keepFraction) e.keep = false;
        }
    }
    adj = buildAdjacency(true);

    // Оставляем только то, что связано с воротами (или с площадью, если ворот нет). Площадь — узел сети:
    // все её подъезды (точки на кромке) соединены между собой
    const seen = new Set<number>(gateNodes.length > 0 ? gateNodes : targets);
    const queue = [...seen];
    let hubOpened = false;
    for (let qi = 0; qi < queue.length; qi++) {
        const u = queue[qi];
        const next = adj[u].map(([v]) => v);
        if (!hubOpened && rim.includes(u)) {
            hubOpened = true;
            next.push(...rim);
        }
        for (const v of next) {
            if (!seen.has(v)) {
                seen.add(v);
                queue.push(v);
            }
        }
    }
    for (const e of edges) if (e.keep && !seen.has(e.a)) e.keep = false;

    // Короткие отростки (тупик целиком короче minLength) убираем; длинные переулки остаются.
    // Отросток считается целиком — от тупика до первого перекрёстка, а не по одному ребру:
    // иначе удаление каскадом съедало бы целые ветки
    for (let changed = true; changed; ) {
        changed = false;
        adj = buildAdjacency(true);
        for (let n = 0; n < nodes.length; n++) {
            if (adj[n].length !== 1) continue;
            const f = nodes[n].f;
            if (f !== 'free' && f !== 'wall' && f !== 'sq') continue;
            const chain: number[] = [];
            let total = 0;
            let cur = n;
            let prevEdge = -1;
            for (;;) {
                const step = adj[cur].find(([, ei]) => ei !== prevEdge);
                if (!step) break;
                chain.push(step[1]);
                total += edges[step[1]].len;
                prevEdge = step[1];
                cur = step[0];
                if (adj[cur].length !== 2 || nodes[cur].f !== 'free') break;
            }
            if (chain.some((ei) => edges[ei].kind === 'main' || edges[ei].protect)) continue;
            // У стены и у площади тупик — обычное дело: убираем только совсем короткие
            if (total < (f === 'free' ? S.minLength : S.minLength / 2)) {
                for (const ei of chain) edges[ei].keep = false;
                changed = true;
            }
        }
    }

    // --- 6. Цепочки узлов и сглаживание Лапласа: главные дороги первыми и сильнее, затем второстепенные ---
    interface SmoothNode {
        p: V2;
        /** Неподвижный: контур, площадь, арка ворот */
        readonly fixed: boolean;
        /** Лежит на главной дороге (перекрёсток с второстепенной улицей тоже) */
        main: boolean;
        /** Соседи по главным дорогам и по второстепенным улицам — две независимые сетки сглаживания */
        readonly nbMain: number[];
        readonly nbSide: number[];
    }
    const sn: SmoothNode[] = nodes.map((n) => ({ p: [n.p[0], n.p[1]], fixed: n.f !== 'free', main: false, nbMain: [], nbSide: [] }));
    const chains: { ids: number[]; kind: 'main' | 'side' }[] = [];

    for (const e of edges) {
        if (!e.keep) continue;
        const A = nodes[e.a].p;
        const B = nodes[e.b].p;
        const t = unit(A, B);
        const isMain = e.kind === 'main';
        // Участок от арки ворот прямой: у стены (внутри отступа) сглаживание точки не двигает,
        // поэтому случайный изгиб здесь остался бы навсегда
        const isArch = nodes[e.a].f === 'gate' || nodes[e.b].f === 'gate';
        // Главные дороги режутся мельче: сглаживанию нужно больше точек, чтобы получилась дуга
        const inner = Math.max(0, Math.ceil(e.len / (isMain ? MAIN_STEP : SIDE_STEP)) - 1);
        const ids: number[] = [e.a];
        for (let k = 1; k <= inner; k++) {
            const u = k / (inner + 1);
            const off = isArch ? 0 : (rnd() - 0.5) * 2 * S.wobble;
            sn.push({
                p: [A[0] + (B[0] - A[0]) * u - t[1] * off, A[1] + (B[1] - A[1]) * u + t[0] * off],
                fixed: false,
                main: isMain,
                nbMain: [],
                nbSide: [],
            });
            ids.push(sn.length - 1);
        }
        ids.push(e.b);
        if (isMain) {
            sn[e.a].main = true;
            sn[e.b].main = true;
        }
        for (let k = 0; k < ids.length - 1; k++) {
            const [u, v] = [sn[ids[k]], sn[ids[k + 1]]];
            (isMain ? u.nbMain : u.nbSide).push(ids[k + 1]);
            (isMain ? v.nbMain : v.nbSide).push(ids[k]);
        }
        chains.push({ ids, kind: e.kind });
    }

    /**
     * Сглаживание Лапласа: каждая подвижная точка (`movable`) смещается к среднему своих соседей.
     * Точка, ушедшая за допустимую зону (стена, площадь), остаётся на месте.
     */
    const smooth = (
        iterations: number,
        movable: (g: SmoothNode) => boolean,
        neighbours: (g: SmoothNode) => number[],
        junctionLambda: number,
        /** Насколько близко к стене точка может подойти: дорога идёт к арке, дома и улицы — нет */
        clearance: number
    ): void => {
        for (let it = 0; it < iterations; it++) {
            const next = sn.map((g): V2 => {
                const nb = neighbours(g);
                if (g.fixed || !movable(g) || nb.length === 0) return g.p;
                let sx = 0;
                let sz = 0;
                for (const j of nb) {
                    sx += sn[j].p[0];
                    sz += sn[j].p[1];
                }
                sx /= nb.length;
                sz /= nb.length;
                // Перекрёстки двигаются слабее, чтобы сеть не «съёжилась»
                const lambda = nb.length > 2 ? junctionLambda : 0.5;
                return [g.p[0] + (sx - g.p[0]) * lambda, g.p[1] + (sz - g.p[1]) * lambda];
            });
            next.forEach((p, i) => {
                if (sd(p[0], p[1]) >= clearance - 0.5) sn[i].p = p;
            });
        }
    };

    // Фаза 1: главные дороги — по точкам пути от арки (неподвижна) до края площади (неподвижен)
    // Главной дороге достаточно полосы её ширины у стены: она идёт к арке и может заходить в зону отступа
    smooth(S.mainSmoothing, (g) => g.main, (g) => g.nbMain, 0.35, S.mainWidth / 2 + 1);
    // Фаза 2: второстепенные улицы; всё, что лежит на главных дорогах, уже стоит на месте
    smooth(S.sideSmoothing, (g) => !g.main, (g) => g.nbSide, 0.3, lim);

    const streets = chains.map(
        (ch): TownStreet => ({
            points: ch.ids.map((i) => sn[i].p),
            width: ch.kind === 'main' ? S.mainWidth : S.sideWidth,
            kind: ch.kind,
        })
    );
    // Главные первыми: дома сначала занимают места вдоль них
    streets.sort((a, b) => (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1));
    return streets;
}

// ============================================
// 🏠 ДОМА
// ============================================

interface Street {
    readonly pts: readonly V2[];
    readonly cum: readonly number[];
    readonly len: number;
    readonly width: number;
    readonly kind: 'main' | 'side';
}

function makeStreet(street: TownStreet): Street {
    const pts = street.points.map((p): V2 => [p[0], p[1]]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    return { pts, cum, len: cum[cum.length - 1], width: street.width, kind: street.kind };
}

/** Точка и единичная касательная на расстоянии s вдоль улицы */
function along(st: Street, s: number): { p: V2; t: V2 } {
    const d = clamp(s, 0, st.len);
    let i = 0;
    while (i < st.pts.length - 2 && st.cum[i + 1] < d) i++;
    const a = st.pts[i];
    const b = st.pts[i + 1];
    const l = st.cum[i + 1] - st.cum[i] || 1;
    const u = (d - st.cum[i]) / l;
    return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: unit(a, b) };
}

interface Box {
    x: number;
    z: number;
    hw: number;
    hd: number;
    ux: number;
    uz: number;
    vx: number;
    vz: number;
}

function makeBox(x: number, z: number, w: number, d: number, yaw: number): Box {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return { x, z, hw: w / 2, hd: d / 2, ux: c, uz: s, vx: -s, vz: c };
}

const toLocal = (o: Box, x: number, z: number): V2 => [(x - o.x) * o.ux + (z - o.z) * o.uz, (x - o.x) * o.vx + (z - o.z) * o.vz];

/** Пересекаются ли два прямоугольника (с запасом m): теорема о разделяющей оси */
function boxesOverlap(a: Box, b: Box, m: number): boolean {
    const axes: V2[] = [
        [a.ux, a.uz],
        [a.vx, a.vz],
        [b.ux, b.uz],
        [b.vx, b.vz],
    ];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    for (const u of axes) {
        const ra = a.hw * Math.abs(u[0] * a.ux + u[1] * a.uz) + a.hd * Math.abs(u[0] * a.vx + u[1] * a.vz);
        const rb = b.hw * Math.abs(u[0] * b.ux + u[1] * b.uz) + b.hd * Math.abs(u[0] * b.vx + u[1] * b.vz);
        if (Math.abs(dx * u[0] + dz * u[1]) > ra + rb + m) return false;
    }
    return true;
}

interface HouseInput {
    readonly sd: (x: number, z: number) => number;
    readonly center: V2;
    readonly radius: number;
    readonly streets: readonly Street[];
    readonly params: TownParams;
    readonly rnd: () => number;
}

function placeHouses(input: HouseInput): TownHouse[] {
    const { sd, center: c, radius: R, streets, params, rnd } = input;
    const H = params.houses;
    const inset = params.edgeInset;

    // Точки вдоль улиц с полуширинами: по ним проверяем, не наехал ли дом на дорогу
    const samples: [number, number, number][] = [];
    for (const st of streets) {
        for (let d = 0; d <= st.len; d += 1.5) {
            const a = along(st, d).p;
            samples.push([a[0], a[1], st.width / 2]);
        }
    }

    const placed: { box: Box; house: Omit<TownHouse, 'delay'> }[] = [];
    const between = (min: number, max: number): number => min + rnd() * (max - min);

    const fits = (o: Box): boolean => {
        for (const su of [-1, 0, 1]) {
            for (const sv of [-1, 0, 1]) {
                if (sd(o.x + o.ux * su * o.hw + o.vx * sv * o.hd, o.z + o.uz * su * o.hw + o.vz * sv * o.hd) < inset) return false;
            }
        }
        if (R > 0) {
            const l = toLocal(o, c[0], c[1]);
            const qx = clamp(l[0], -o.hw, o.hw);
            const qz = clamp(l[1], -o.hd, o.hd);
            if (Math.hypot(l[0] - qx, l[1] - qz) < R + params.square.gap) return false;
        }
        for (const s of samples) {
            const l = toLocal(o, s[0], s[1]);
            if (Math.abs(l[0]) <= o.hw + s[2] + 0.6 && Math.abs(l[1]) <= o.hd + s[2] + 0.6) return false;
        }
        for (const other of placed) if (boxesOverlap(o, other.box, 0.8)) return false;
        return true;
    };

    const roll = (x: number, z: number, yaw: number, w: number, d: number): { box: Box; house: Omit<TownHouse, 'delay'> } => ({
        box: makeBox(x, z, w, d, yaw),
        house: {
            x,
            z,
            yaw,
            width: w,
            depth: d,
            wallHeight: between(H.wallHeightMin, H.wallHeightMax) * H.scale,
            roofHeight: between(H.roofHeightMin, H.roofHeightMax) * H.scale,
            apexU: (rnd() - 0.5) * 2 * H.apexJitter * w,
            apexV: (rnd() - 0.5) * 2 * H.apexJitter * d,
            tone: 0.9 + rnd() * 0.2,
            roof: Math.floor(rnd() * 3),
        },
    });

    const size = (): [number, number] => [between(H.widthMin, H.widthMax) * H.scale, between(H.depthMin, H.depthMax) * H.scale];

    const walk = (st: Street, side: 1 | -1): void => {
        let s = 3;
        while (s < st.len) {
            const [w, d] = size();
            const a = along(st, s + w / 2);
            const off = st.width / 2 + H.setback + d / 2;
            const yaw = Math.atan2(a.t[1], a.t[0]) + (rnd() - 0.5) * 2 * ((H.yawJitter * Math.PI) / 180);
            const item = roll(a.p[0] - a.t[1] * side * off, a.p[1] + a.t[0] * side * off, yaw, w, d);
            const ok = fits(item.box);
            if (ok && rnd() < H.fill) {
                placed.push(item);
                s += w + between(H.gapMin, H.gapMax);
            } else {
                s += ok ? w + H.gapMin : 3;
            }
        }
    };

    // Сначала главные улицы, потом кольцо у площади, затем остальные
    const mainCount = streets.filter((s) => s.kind === 'main').length;
    for (let i = 0; i < mainCount; i++) {
        walk(streets[i], -1);
        walk(streets[i], 1);
    }

    if (H.squareRing && R > 0) {
        let th = rnd() * Math.PI * 2;
        const end = th + Math.PI * 2;
        while (th < end) {
            const [w, d] = size();
            const rho = R + params.square.gap + d / 2 + 0.3;
            const item = roll(c[0] + Math.cos(th) * rho, c[1] + Math.sin(th) * rho, th + Math.PI / 2, w, d);
            if (fits(item.box) && rnd() < H.fill) placed.push(item);
            th += (w + H.gapMin + rnd() * 1.5) / rho;
        }
    }

    for (let i = mainCount; i < streets.length; i++) {
        walk(streets[i], -1);
        walk(streets[i], 1);
    }

    // Порядок роста «волной»: расстояние от площади, нормированное в 0–1
    let far = 1;
    for (const p of placed) far = Math.max(far, Math.hypot(p.house.x - c[0], p.house.z - c[1]));
    return placed.map((p) => ({ ...p.house, delay: Math.hypot(p.house.x - c[0], p.house.z - c[1]) / far }));
}

// ============================================
// 🏙 ОДИН ПОЛИГОН ГОРОДА
// ============================================

interface PolygonLayout {
    square: TownSquare | null;
    streets: TownStreet[];
    houses: TownHouse[];
}

function layoutPolygon(
    polygon: Polygon,
    sites: readonly GateSite[],
    params: TownParams,
    rnd: () => number,
    warnings: string[]
): PolygonLayout {
    const empty: PolygonLayout = { square: null, streets: [], houses: [] };
    const outer = polygon[0];
    if (!outer || outer.length < 3) return empty;

    const sd = (x: number, z: number): number => signedDistanceToPolygon(x, z, polygon);
    const area = polygonArea(polygon);
    const inset = params.edgeInset;

    // 🏛 Центр: полюс недоступности (polylabel). Чистый polylabel, без смещения к центроиду
    const pole = poleOfInaccessibility(polygon, 0.5, 0);
    if (!pole || pole.distance < inset + 2) {
        warnings.push('город слишком тесный для застройки');
        return empty;
    }
    const c: V2 = [pole.point[0], pole.point[1]];
    const cityRadius = Math.sqrt(Math.max(area, 1) / Math.PI);
    // Размер по городу (0 — город слишком мал), затем не больше свободного места вокруг центра
    const Q = params.square;
    const clearance = pole.distance - inset;
    let radius = Math.min(townSquareRadius(area, params.square), clearance);
    // Вокруг площади с подъездом остаётся проход: иначе в узком месте города она отрезала бы его часть
    const withApproach = (r: number): number => r + clamp(r * Q.approachRatio, Q.approachMin, Q.approachMax);
    while (radius > 0 && withApproach(radius) > clearance - Q.passWidth) radius -= 0.5;
    if (radius < 0) radius = 0;
    // Урезанная теснотой площадь меньше 3/4 положенного минимума выглядела бы огрызком: без неё лучше
    if (radius < Math.max(4, params.square.minRadius * 0.75)) radius = 0;
    const square: TownSquare | null = radius > 0 ? { x: c[0], z: c[1], radius } : null;

    const gates: GatePoint[] = [];
    for (const site of sites) {
        const gate = resolveGate(polygon, site);
        if (gate) gates.push(gate);
        else warnings.push('ворота не нашли контур города');
    }

    const streets = buildStreetNetwork({
        sd,
        bb: boundsOf(outer),
        center: c,
        radius,
        cityRadius,
        gates,
        params,
        rnd,
        warnings,
    });

    const houses = placeHouses({ sd, center: c, radius, streets: streets.map(makeStreet), params, rnd });
    return { square, streets, houses };
}

// ============================================
// 🚀 ТОЧКА ВХОДА
// ============================================

/** К какому полигону региона относятся ворота: к тому, где точка глубже всего внутри */
function ownerOf(polygons: readonly Polygon[], site: GateSite): number {
    let best = 0;
    let bestD = -Infinity;
    polygons.forEach((polygon, i) => {
        const d = signedDistanceToPolygon(site.x, site.z, polygon);
        if (d > bestD) {
            bestD = d;
            best = i;
        }
    });
    return best;
}

/**
 * Внутреннее устройство замкнутого города: площадь, улицы и дома.
 * Раскладка детерминирована: seed = подпись региона + params.seed.
 */
export function layoutCityTown(region: CityRegion, params: TownParams): TownLayout {
    const squares: TownSquare[] = [];
    const streets: TownStreet[] = [];
    const houses: TownHouse[] = [];
    const warnings: string[] = [];

    region.polygons.forEach((polygon, index) => {
        const sites = region.gates.filter((gate) => ownerOf(region.polygons, gate) === index);
        const rnd = createSeededRandom(`${region.signature}|${params.seed}|${index}`);
        const part = layoutPolygon(polygon, sites, params, rnd, warnings);
        if (part.square) squares.push(part.square);
        streets.push(...part.streets);
        houses.push(...part.houses);
    });

    return { squares, streets, houses, warnings };
}
