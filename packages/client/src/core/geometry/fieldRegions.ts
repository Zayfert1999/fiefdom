// packages/client/src/core/geometry/fieldRegions.ts
// ============================================
// 🌿 РЕГИОНЫ ПОЛЕЙ НА ДОСКЕ: ОДИН ПОЛИГОН И ОДИН МЕШ НА РЕГИОН
// ============================================
// Чистый модуль (без three, React и clipper).
//
// 🌟 ЗАЧЕМ
//   Поля соседних тайлов — части одного региона. Если строить мех каждого тайла отдельно,
//   на стыках будут швы: свои вершины, свои нормали, затухание у дорог считается обрезанно.
//   Здесь поля одного региона сшиваются в общий полигон (с дырками), по которому строится
//   ОДИН меш с ОДНОЙ группой. Рельеф при этом — мировой шум (terrain.ts), поэтому все регионы
//   выглядят однородно.
//
// 🧵 КАК СШИВАЮТСЯ ПОЛИГОНЫ (без булевых операций, вершины остаются точными)
//   1. Полигоны полей переводятся в мировые координаты (поворот и сдвиг тайла),
//      обход колец нормализуется: внешние против часовой, дырки по часовой (внутренность слева).
//   2. Рёбра на линиях сетки доски режутся в точках всех вершин, лежащих на той же линии
//      (чтобы рёбра соседей, у которых вершины стоят по-разному, всё равно совпали).
//   3. Ребро A→B и ребро B→A у разных полигонов — это шов: оба рёбра отбрасываются,
//      а полигоны объединяются в один регион (union-find).
//   4. Из оставшихся рёбер региона собираются кольца: в каждой вершине берётся самый «левый»
//      поворот, поэтому касания в одной точке не склеивают кольца в восьмёрку.
//   5. Кольца делятся на внешние и дырки; дырка достаётся внешнему кольцу, которое её содержит.
//
// 🔑 Идентификатор региона — наименьший ключ фичи `col,row:featureId` (формат RegionManager).
//    Подпись региона (signature) меняется при любом изменении состава, поворота или бандла тайла —
//    по ней кэшируются меши: при постановке тайла перестраиваются только затронутые регионы.
// ============================================
import type { Point, Polygon, Ring } from '@fiefdom/shared/core/geometry.types';
import { HALF } from './generators/sides';
import { pointInPolygon } from './geometryPointInPolygon';
import {
    buildFieldRegionMesh,
    resolveMeshParams,
    type FieldPolygonRef,
    type MeshParamsInput,
    type TileMeshData,
} from './tileMesh';

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
// 🧩 ТИПЫ
// ============================================

/** Тайл на доске с его полями (из TileBundle.fieldPolygons) */
export interface FieldRegionTile {
    /** Уникальный ключ клетки (для подписи) */
    readonly key: string;
    readonly col: number;
    readonly row: number;
    /** Поворот по часовой стрелке, градусы */
    readonly rotation: number;
    /** id бандла: разные бандлы в одной клетке — разные регионы */
    readonly tileId: string;
    readonly fields: readonly FieldPolygonRef[];
}

export interface FieldRegion {
    /** Наименьший ключ фичи региона */
    readonly id: string;
    /** Ключи фич `col,row:featureId` (формат RegionManager) */
    readonly featureKeys: readonly string[];
    /** Объединённые полигоны в мировых координатах: [внешнее кольцо, ...дырки] */
    readonly polygons: readonly Polygon[];
    /** Подпись состава: меняется при любом изменении региона */
    readonly signature: string;
}

// ============================================
// 🧮 ГЕОМЕТРИЯ КОЛЕЦ
// ============================================

const SNAP = 1e6;
const snap = (v: number): number => Math.round(v * SNAP);
const pointKey = (p: Point): string => `${snap(p[0])},${snap(p[1])}`;

function signedArea(ring: readonly Point[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        a += x1 * y2 - x2 * y1;
    }
    return a / 2;
}

/** Убирает подряд идущие дубликаты и замыкающую копию первой точки */
function cleanRing(ring: readonly Point[]): Point[] {
    const out: Point[] = [];
    for (const p of ring) {
        const last = out[out.length - 1];
        if (!last || pointKey(last) !== pointKey(p)) out.push(p);
    }
    while (out.length > 1 && pointKey(out[0]) === pointKey(out[out.length - 1])) out.pop();
    return out;
}

/** Убирает вершины, лежащие точно на прямой между соседями (не меняет форму) */
function removeCollinear(ring: readonly Point[]): Point[] {
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
function onGridLine(v: number): boolean {
    const t = (v - HALF) / BOARD_TILE_SIZE;
    return Math.abs(t - Math.round(t)) * BOARD_TILE_SIZE < 1e-6;
}

// ============================================
// 🧵 СШИВАНИЕ
// ============================================

interface Item {
    readonly key: string;
    readonly tile: FieldRegionTile;
    readonly rings: Point[][];
}

interface Edge {
    readonly item: number;
    readonly a: Point;
    readonly b: Point;
    cancelled: boolean;
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
function assemblePolygons(rings: readonly Point[][]): Polygon[] {
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

/**
 * Собирает регионы полей доски: поля соседних тайлов, сходящиеся по общему шву, — один регион.
 * Тайлы без полей пропускаются. Порядок регионов детерминирован (по id).
 */
export function buildFieldRegions(tiles: readonly FieldRegionTile[]): FieldRegion[] {
    // 1) Полигоны в мировых координатах, внутренность слева от рёбер
    const items: Item[] = [];
    for (const tile of tiles) {
        for (const field of tile.fields) {
            const rings: Point[][] = [];
            field.polygon.forEach((ring, index) => {
                const world = cleanRing(ring.map(([x, z]) => tileToWorld(tile.col, tile.row, tile.rotation, x, z)));
                if (world.length < 3 || Math.abs(signedArea(world)) < 1e-9) return;
                const wantPositive = index === 0;
                rings.push((signedArea(world) > 0) === wantPositive ? world : [...world].reverse());
            });
            if (rings.length === 0 || signedArea(rings[0]) <= 0) continue;
            items.push({ key: `${tile.col},${tile.row}:${field.featureId}`, tile, rings });
        }
    }
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
                    edges.push({ item: itemIndex, a, b, cancelled: false });
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
                    edges.push({ item: itemIndex, a: prev, b: next, cancelled: false });
                    prev = next;
                }
                edges.push({ item: itemIndex, a: prev, b, cancelled: false });
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

    const regions: FieldRegion[] = [];
    for (const members of groups.values()) {
        const memberSet = new Set(members);
        const remaining = edges.filter((e) => !e.cancelled && memberSet.has(e.item));
        const polygons = assemblePolygons(traceRings(remaining));
        if (polygons.length === 0) continue;

        const featureKeys = members.map((i) => items[i].key).sort();
        const signature = members
            .map((i) => `${items[i].key}@${items[i].tile.rotation}#${items[i].tile.tileId}`)
            .sort()
            .join(';');
        regions.push({ id: featureKeys[0], featureKeys, polygons, signature });
    }
    return regions.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

// ============================================
// 🧊 МЕШИ РЕГИОНОВ
// ============================================

export interface FieldRegionMesh {
    readonly id: string;
    readonly featureKeys: readonly string[];
    readonly signature: string;
    /** Один меш, одна группа (featureId = id региона, surface = 'field'), мировые координаты */
    readonly mesh: TileMeshData;
}

/** Кэш мешей регионов: при постановке тайла перестраиваются только изменившиеся регионы */
export class FieldRegionMeshCache {
    private readonly entries = new Map<string, FieldRegionMesh>();

    get(key: string): FieldRegionMesh | undefined {
        return this.entries.get(key);
    }

    set(key: string, value: FieldRegionMesh): void {
        this.entries.set(key, value);
    }

    /** Забывает всё, чего нет в списке (регион исчез или изменился) */
    retain(keys: ReadonlySet<string>): void {
        for (const key of this.entries.keys()) if (!keys.has(key)) this.entries.delete(key);
    }

    get size(): number {
        return this.entries.size;
    }
}

/**
 * Регионы полей доски → меши. С кэшем перестраиваются только изменившиеся регионы.
 * Параметры берутся как у тайловых мешей (mesh.terrain, цвета, высоты).
 */
export function buildFieldRegionMeshes(
    tiles: readonly FieldRegionTile[],
    params?: MeshParamsInput,
    cache?: FieldRegionMeshCache
): FieldRegionMesh[] {
    const paramsKey = JSON.stringify(resolveMeshParams(params));
    const used = new Set<string>();
    const result: FieldRegionMesh[] = [];

    for (const region of buildFieldRegions(tiles)) {
        const key = `${region.signature}|${paramsKey}`;
        used.add(key);

        let entry = cache?.get(key);
        if (!entry) {
            entry = {
                id: region.id,
                featureKeys: region.featureKeys,
                signature: region.signature,
                mesh: buildFieldRegionMesh(region.polygons, region.id, params),
            };
            cache?.set(key, entry);
        }
        result.push(entry);
    }

    cache?.retain(used);
    return result;
}

// ============================================
// 🎯 КАКАЯ ФИЧА ПОД ТОЧКОЙ
// ============================================

export interface LocatedFieldFeature {
    readonly col: number;
    readonly row: number;
    readonly featureId: string;
    /** `col,row:featureId` */
    readonly featureKey: string;
}

/**
 * Какое поле (фича конкретного тайла) региона лежит под мировой точкой.
 * Для hover/клика по общему мешу региона: меш знает только регион, а игре нужна фича тайла.
 */
export function locateFieldFeature(
    region: Pick<FieldRegionMesh, 'featureKeys'>,
    tiles: readonly FieldRegionTile[],
    worldX: number,
    worldZ: number
): LocatedFieldFeature | null {
    const col = Math.round(worldX / BOARD_TILE_SIZE);
    const row = Math.round(worldZ / BOARD_TILE_SIZE);
    const tile = tiles.find((t) => t.col === col && t.row === row);
    if (!tile) return null;

    const local = worldToTile(tile.col, tile.row, tile.rotation, worldX, worldZ);
    for (const field of tile.fields) {
        const featureKey = `${tile.col},${tile.row}:${field.featureId}`;
        if (!region.featureKeys.includes(featureKey)) continue;
        if (pointInPolygon(local, field.polygon)) return { col, row, featureId: field.featureId, featureKey };
    }
    return null;
}
