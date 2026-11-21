// packages/client/src/core/geometry/regionStitch.ts
// ============================================
// 🧵 СШИВАНИЕ ПОЛИГОНОВ ТАЙЛОВ В РЕГИОНЫ ДОСКИ
// ============================================
// Чистый модуль (без three, React и clipper). Общее ядро для регионов полей
// (fieldRegions.ts) и городов (cityRegions.ts).
//
// 🧵 КАК СШИВАЮТСЯ ПОЛИГОНЫ (без булевых операций, вершины остаются точными)
//   1. Полигоны переводятся в мировые координаты (поворот и сдвиг тайла),
//      обход колец нормализуется: внешние против часовой, дырки по часовой (внутренность слева).
//   2. Рёбра на линиях сетки доски режутся в точках всех вершин, лежащих на той же линии
//      (чтобы рёбра соседей, у которых вершины стоят по-разному, всё равно совпали).
//   3. Ребро A→B и ребро B→A у разных полигонов — это шов: оба рёбра отбрасываются,
//      а полигоны объединяются в один регион (union-find).
//   4. Из оставшихся рёбер региона собираются кольца: в каждой вершине берётся самый «левый»
//      поворот, поэтому касания в одной точке не склеивают кольца в восьмёрку.
//   5. Кольца делятся на внешние и дырки; дырка достаётся внешнему кольцу, которое её содержит.
//
// 🔒 Замкнутость: ребро, лежащее на линии сетки и НЕ нашедшее пары, — это граница клетки,
//    за которой нет подходящего соседа. Их число возвращается в openSeamEdges:
//    0 — регион нигде не упирается в край клетки (для города это «завершён»).
// ============================================
import type { Point, Polygon, Ring } from '@fiefdom/shared/core/geometry.types';
import { HALF } from './generators/sides';
import { pointInPolygon } from './geometryPointInPolygon';

/** Сторона клетки доски в мировых единицах (совпадает с TILE_SIZE компонентов) */
export const BOARD_TILE_SIZE = 2 * HALF;

// ============================================
// 📐 ТАЙЛ → МИР
// ============================================

/**
 * Локальная точка тайла (x, z) → мировая точка доски.
 * Поворот на θ° по часовой стрелке сверху = rotation.y = −θ в three (см. tileYaw):
 *   x' = x·cosθ − z·sinθ,  z' = x·sinθ + z·cosθ.
 * Для кратных 90° используются точные значения (без ошибок округления cos(π/2)),
 * иначе швы на границах клеток разъезжались бы на 1e-16.
 */
export function tileToWorld(col: number, row: number, rotation: number, x: number, z: number): Point {
    const r = ((Math.round(rotation * 1e6) / 1e6) % 360 + 360) % 360;
    let wx: number;
    let wz: number;
    if (r === 0) [wx, wz] = [x, z];
    else if (r === 90) [wx, wz] = [-z, x];
    else if (r === 180) [wx, wz] = [-x, -z];
    else if (r === 270) [wx, wz] = [z, -x];
    else {
        const rad = (r * Math.PI) / 180;
        wx = x * Math.cos(rad) - z * Math.sin(rad);
        wz = x * Math.sin(rad) + z * Math.cos(rad);
    }
    return [wx + col * BOARD_TILE_SIZE, wz + row * BOARD_TILE_SIZE];
}

/** Мировая точка → локальная точка тайла (обратное к tileToWorld) */
export function worldToTile(col: number, row: number, rotation: number, wx: number, wz: number): Point {
    const x = wx - col * BOARD_TILE_SIZE;
    const z = wz - row * BOARD_TILE_SIZE;
    // Обратный поворот на −θ
    const r = ((Math.round(rotation * 1e6) / 1e6) % 360 + 360) % 360;
    if (r === 0) return [x, z];
    if (r === 90) return [z, -x];
    if (r === 180) return [-x, -z];
    if (r === 270) return [-z, x];
    const rad = (r * Math.PI) / 180;
    return [x * Math.cos(rad) + z * Math.sin(rad), -x * Math.sin(rad) + z * Math.cos(rad)];
}


// ============================================
// 🧮 ГЕОМЕТРИЯ КОЛЕЦ
// ============================================

const SNAP = 1e6;
export const snap = (v: number): number => Math.round(v * SNAP);
export const pointKey = (p: Point): string => `${snap(p[0])},${snap(p[1])}`;

export function signedArea(ring: readonly Point[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        a += x1 * y2 - x2 * y1;
    }
    return a / 2;
}

/** Убирает подряд идущие дубликаты и замыкающую копию первой точки */
export function cleanRing(ring: readonly Point[]): Point[] {
    const out: Point[] = [];
    for (const p of ring) {
        const last = out[out.length - 1];
        if (!last || pointKey(last) !== pointKey(p)) out.push(p);
    }
    while (out.length > 1 && pointKey(out[0]) === pointKey(out[out.length - 1])) out.pop();
    return out;
}

/** Убирает вершины, лежащие точно на прямой между соседями (не меняет форму) */
export function removeCollinear(ring: readonly Point[]): Point[] {
    if (ring.length <= 3) return [...ring];
    const out: Point[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[(i + ring.length - 1) % ring.length];
        const b = ring[i];
        const c = ring[(i + 1) % ring.length];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
        if (Math.abs(cross) < 1e-9 && dot > 0) continue;
        out.push(b);
    }
    return out.length >= 3 ? out : [...ring];
}

/** Координата лежит на линии сетки доски (граница клеток) */
export function onGridLine(v: number): boolean {
    const t = (v - HALF) / BOARD_TILE_SIZE;
    return Math.abs(t - Math.round(t)) * BOARD_TILE_SIZE < 1e-6;
}

// ============================================
// 🧵 ВНУТРЕННОСТИ СШИВАНИЯ
// ============================================

interface Edge {
    readonly item: number;
    readonly a: Point;
    readonly b: Point;
    cancelled: boolean;
    /** Лежит на линии сетки (граница клеток) */
    readonly seam: boolean;
}

class DisjointSet {
    private readonly parent: number[];
    constructor(n: number) {
        this.parent = Array.from({ length: n }, (_, i) => i);
    }
    find(i: number): number {
        while (this.parent[i] !== i) {
            this.parent[i] = this.parent[this.parent[i]];
            i = this.parent[i];
        }
        return i;
    }
    union(a: number, b: number): void {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
    }
}

/** Поворот вектора d_in → d_out против часовой, радианы (−π, π]; больше — «левее» */
function turn(din: Point, dout: Point): number {
    return Math.atan2(din[0] * dout[1] - din[1] * dout[0], din[0] * dout[0] + din[1] * dout[1]);
}

/** Собирает кольца из оставшихся рёбер: в каждой вершине самый левый поворот */
function traceRings(edges: readonly Edge[]): Point[][] {
    const outgoing = new Map<string, Edge[]>();
    for (const e of edges) {
        const k = pointKey(e.a);
        const list = outgoing.get(k);
        if (list) list.push(e);
        else outgoing.set(k, [e]);
    }

    const used = new Set<Edge>();
    const rings: Point[][] = [];
    for (const first of edges) {
        if (used.has(first)) continue;
        const ring: Point[] = [];
        let edge: Edge | undefined = first;
        const startKey = pointKey(first.a);

        for (let guard = 0; edge && guard < edges.length + 2; guard++) {
            used.add(edge);
            ring.push(edge.a);
            const endKey = pointKey(edge.b);
            if (endKey === startKey) break;

            const din: Point = [edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]];
            let best: Edge | undefined;
            let bestTurn = -Infinity;
            for (const candidate of outgoing.get(endKey) ?? []) {
                if (used.has(candidate)) continue;
                const dout: Point = [candidate.b[0] - candidate.a[0], candidate.b[1] - candidate.a[1]];
                const t = turn(din, dout);
                if (t > bestTurn) {
                    bestTurn = t;
                    best = candidate;
                }
            }
            edge = best;
        }
        const cleaned = removeCollinear(cleanRing(ring));
        if (cleaned.length >= 3 && Math.abs(signedArea(cleaned)) > 1e-9) rings.push(cleaned);
    }
    return rings;
}

/** Кольца → полигоны: внешние (площадь > 0) и дырки (< 0), дырка — к самому малому содержащему внешнему */
export function assemblePolygons(rings: readonly Point[][]): Polygon[] {
    const outers: { ring: Ring; holes: Ring[]; area: number }[] = [];
    const holes: Ring[] = [];
    for (const ring of rings) {
        const area = signedArea(ring);
        if (area > 0) outers.push({ ring, holes: [], area });
        else holes.push(ring);
    }
    for (const hole of holes) {
        let parent: (typeof outers)[number] | undefined;
        for (const outer of outers) {
            if (outer.area <= Math.abs(signedArea(hole))) continue;
            if (!pointInPolygon(hole[0], [outer.ring])) continue;
            if (!parent || outer.area < parent.area) parent = outer;
        }
        if (parent) parent.holes.push(hole);
    }
    return outers.map((o) => [o.ring, ...o.holes]);
}

// ============================================
// 🧵 ОБЩЕЕ СШИВАНИЕ
// ============================================

/** Один полигон тайла: кольца уже в мировых координатах и нормализованы (см. normalizeWorldPolygon) */
export interface StitchItem {
    readonly rings: readonly (readonly Point[])[];
}

export interface StitchGroup {
    /** Индексы элементов, вошедших в регион */
    readonly members: readonly number[];
    /** Объединённые полигоны региона: [внешнее кольцо, ...дырки] */
    readonly polygons: readonly Polygon[];
    /** Рёбра на линиях сетки без пары (0 — контур региона замкнут) */
    readonly openSeamEdges: number;
}

/**
 * Полигон тайла → кольца в мировых координатах: внутренность слева от рёбер
 * (внешнее кольцо против часовой, дырки по часовой). null — полигон вырожден.
 */
export function normalizeWorldPolygon(
    polygon: Polygon,
    toWorld: (x: number, z: number) => Point
): Point[][] | null {
    const rings: Point[][] = [];
    polygon.forEach((ring, index) => {
        const world = cleanRing(ring.map(([x, z]) => toWorld(x, z)));
        if (world.length < 3 || Math.abs(signedArea(world)) < 1e-9) return;
        const wantPositive = index === 0;
        rings.push((signedArea(world) > 0) === wantPositive ? world : [...world].reverse());
    });
    if (rings.length === 0 || signedArea(rings[0]) <= 0) return null;
    return rings;
}

/**
 * Сшивает полигоны соседних клеток в регионы. Порядок групп — по первому элементу,
 * внутри группы members идут по возрастанию индекса.
 */
export function stitchItems(items: readonly StitchItem[]): StitchGroup[] {
    if (items.length === 0) return [];

    // 2) Точки-разрезы на линиях сетки: вершины любых колец, лежащие на этой линии
    const breaks = new Map<string, Map<number, number>>(); // линия → (snap(coord) → coord)
    const lineOf = (axis: 'v' | 'h', value: number): string => `${axis}:${snap(value)}`;
    const addBreak = (axis: 'v' | 'h', lineValue: number, coord: number): void => {
        const key = lineOf(axis, lineValue);
        let map = breaks.get(key);
        if (!map) breaks.set(key, (map = new Map()));
        map.set(snap(coord), coord);
    };
    for (const item of items) {
        for (const ring of item.rings) {
            for (const [x, z] of ring) {
                if (onGridLine(x)) addBreak('v', x, z);
                if (onGridLine(z)) addBreak('h', z, x);
            }
        }
    }

    // 3) Рёбра (с разрезанием рёбер на линиях сетки)
    const edges: Edge[] = [];
    items.forEach((item, itemIndex) => {
        for (const ring of item.rings) {
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i];
                const b = ring[(i + 1) % ring.length];
                const vertical = Math.abs(a[0] - b[0]) < 1e-9 && onGridLine(a[0]);
                const horizontal = Math.abs(a[1] - b[1]) < 1e-9 && onGridLine(a[1]);

                if (!vertical && !horizontal) {
                    edges.push({ item: itemIndex, a, b, cancelled: false, seam: false });
                    continue;
                }
                const axisIndex = vertical ? 1 : 0; // вдоль какой координаты идёт ребро
                const along = breaks.get(lineOf(vertical ? 'v' : 'h', vertical ? a[0] : a[1]));
                const from = a[axisIndex];
                const to = b[axisIndex];
                const lo = Math.min(from, to);
                const hi = Math.max(from, to);
                const inside = [...(along?.values() ?? [])].filter((c) => c > lo + 1e-6 && c < hi - 1e-6);
                inside.sort((p, q) => (from < to ? p - q : q - p));

                let prev = a;
                for (const c of inside) {
                    const next: Point = vertical ? [a[0], c] : [c, a[1]];
                    edges.push({ item: itemIndex, a: prev, b: next, cancelled: false, seam: true });
                    prev = next;
                }
                edges.push({ item: itemIndex, a: prev, b, cancelled: false, seam: true });
            }
        }
    });

    // 4) Швы: ребро A→B гасится парным B→A другого полигона, полигоны объединяются
    const sets = new DisjointSet(items.length);
    const byKey = new Map<string, Edge[]>();
    for (const e of edges) {
        const key = `${pointKey(e.a)}>${pointKey(e.b)}`;
        const list = byKey.get(key);
        if (list) list.push(e);
        else byKey.set(key, [e]);
    }
    for (const e of edges) {
        if (e.cancelled) continue;
        const partners = byKey.get(`${pointKey(e.b)}>${pointKey(e.a)}`);
        const partner = partners?.find((p) => !p.cancelled && p !== e);
        if (!partner) continue;
        e.cancelled = true;
        partner.cancelled = true;
        sets.union(e.item, partner.item);
    }

    // 5) Регионы: оставшиеся рёбра → кольца → полигоны
    const groups = new Map<number, number[]>();
    items.forEach((_, i) => {
        const root = sets.find(i);
        const list = groups.get(root);
        if (list) list.push(i);
        else groups.set(root, [i]);
    });

    const result: StitchGroup[] = [];
    for (const members of groups.values()) {
        const memberSet = new Set(members);
        const remaining = edges.filter((e) => !e.cancelled && memberSet.has(e.item));
        const polygons = assemblePolygons(traceRings(remaining));
        const openSeamEdges = remaining.reduce((n, e) => n + (e.seam ? 1 : 0), 0);
        result.push({ members, polygons, openSeamEdges });
    }
    return result;
}
