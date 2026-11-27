// packages/client/src/core/geometry/townMesh.ts
// ============================================
// 🧱 МЕШ ЗАСТРОЙКИ ГОРОДА ИЗ РАСКЛАДКИ
// ============================================
// Чистый модуль (без three и React). Строит меши в формате TileMeshData (тот же материал
// и те же буферы, что у тайлов и стен): вершинные цвета, плоские нормали.
//
// Два вида мешей:
//   • ground — площадь и улицы: плоские накладки чуть выше поверхности города; не растут;
//   • buckets — дома, разбитые на части по расстоянию от площади. Каждая часть растёт
//     «из земли» своим масштабом по y со своей задержкой: получается волна от центра к краям
//     без шейдеров (и тени растут вместе с домами, как у стен).
//
// Координаты — мировые по x и z; y отсчитывается от поверхности города (0 — поверхность).
// При отрисовке группа ставится на высоту поверхности города.
//
// Дом: параллелепипед без дна и верха + четырёхскатная пирамида со свесом. Вершина пирамиды
// слегка смещена, поэтому крыши разные.
// ============================================

import { hexToLinear, type MeshGroup, type TileMeshData } from './tileMesh';
import type { TownHouse, TownLayout, TownStreet } from './townGeometry';
import type { TownParams } from './townParams';

type V3 = readonly [number, number, number];

/** Высоты плоских накладок над поверхностью города: выше — главные улицы и площадь (без z-fighting) */
const SIDE_STREET_Y = 0.3;
const MAIN_STREET_Y = 0.36;
const SQUARE_Y = 0.42;
const UP: V3 = [0, 1, 0];

// ============================================
// 🧰 СБОРЩИК БУФЕРОВ
// ============================================

class MeshBuilder {
    private readonly pos: number[] = [];
    private readonly nor: number[] = [];
    private readonly col: number[] = [];
    private readonly idx: number[] = [];
    private readonly groups: MeshGroup[] = [];
    private groupId = '';
    private groupStart = 0;
    private color: V3 = [1, 1, 1];

    begin(featureId: string): void {
        this.groupId = featureId;
        this.groupStart = this.idx.length;
    }

    end(): void {
        const count = this.idx.length - this.groupStart;
        if (count > 0) this.groups.push({ featureId: this.groupId, surface: 'city', start: this.groupStart, count });
    }

    /** Цвет следующих вершин (линейный), с множителем оттенка */
    paint(hex: string, tone = 1): void {
        const c = hexToLinear(hex);
        this.color = [Math.min(1, c[0] * tone), Math.min(1, c[1] * tone), Math.min(1, c[2] * tone)];
    }

    vertex(p: V3, n: V3): number {
        this.pos.push(p[0], p[1], p[2]);
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        this.nor.push(n[0] / len, n[1] / len, n[2] / len);
        this.col.push(this.color[0], this.color[1], this.color[2]);
        return this.pos.length / 3 - 1;
    }

    /** Треугольник; порядок вершин подбирается так, чтобы лицевая сторона смотрела в сторону hint */
    tri(a: number, b: number, c: number, hint: V3): void {
        const p = this.pos;
        const ax = p[b * 3] - p[a * 3];
        const ay = p[b * 3 + 1] - p[a * 3 + 1];
        const az = p[b * 3 + 2] - p[a * 3 + 2];
        const bx = p[c * 3] - p[a * 3];
        const by = p[c * 3 + 1] - p[a * 3 + 1];
        const bz = p[c * 3 + 2] - p[a * 3 + 2];
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) this.idx.push(a, c, b);
        else this.idx.push(a, b, c);
    }

    /** Плоский треугольник: нормаль считается по вершинам, лицом в сторону hint */
    flatTri(pa: V3, pb: V3, pc: V3, hint: V3): void {
        const n = faceNormal(pa, pb, pc);
        const facing = n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0 ? ([-n[0], -n[1], -n[2]] as V3) : n;
        const a = this.vertex(pa, facing);
        const b = this.vertex(pb, facing);
        const c = this.vertex(pc, facing);
        this.tri(a, b, c, facing);
    }

    /** Плоский четырёхугольник a-b-c-d (обход по контуру) с одной нормалью n */
    flatQuad(pa: V3, pb: V3, pc: V3, pd: V3, n: V3): void {
        const a = this.vertex(pa, n);
        const b = this.vertex(pb, n);
        const c = this.vertex(pc, n);
        const d = this.vertex(pd, n);
        this.tri(a, b, c, n);
        this.tri(a, c, d, n);
    }

    get empty(): boolean {
        return this.idx.length === 0;
    }

    finish(): TileMeshData {
        return {
            positions: new Float32Array(this.pos),
            normals: new Float32Array(this.nor),
            colors: new Float32Array(this.col),
            indices: new Uint32Array(this.idx),
            groups: this.groups,
            stats: {
                vertices: this.pos.length / 3,
                triangles: this.idx.length / 3,
                topTriangles: 0,
                wallQuads: 0,
                maxTopDeviation: 0,
                skippedBoundaryEdges: 0,
            },
        };
    }
}

function faceNormal(a: V3, b: V3, c: V3): V3 {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
}

// ============================================
// 🛣 ПЛОЩАДЬ И УЛИЦЫ (плоские накладки)
// ============================================

/** Многоугольник-«блин» на высоте y: веер из центра */
function addDisc(b: MeshBuilder, x: number, z: number, radius: number, segments: number, y: number): void {
    const center = b.vertex([x, y, z], UP);
    const ring: number[] = [];
    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        ring.push(b.vertex([x + Math.cos(a) * radius, y, z + Math.sin(a) * radius], UP));
    }
    for (let i = 0; i < segments; i++) b.tri(center, ring[i], ring[(i + 1) % segments], UP);
}

/** Лента улицы: полоса вдоль ломаной с miter-стыками и круглыми концами (закрывают стыки у перекрёстков) */
function addStreet(b: MeshBuilder, street: TownStreet, y: number): void {
    const pts = street.points;
    const m = pts.length;
    if (m < 2) return;
    const hw = street.width / 2;

    const dir: [number, number][] = [];
    for (let i = 0; i < m - 1; i++) {
        const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) || 1;
        dir.push([(pts[i + 1][0] - pts[i][0]) / len, (pts[i + 1][1] - pts[i][1]) / len]);
    }

    const left: V3[] = [];
    const right: V3[] = [];
    for (let i = 0; i < m; i++) {
        const prev = dir[Math.max(i - 1, 0)];
        const next = dir[Math.min(i, m - 2)];
        // Левые нормали соседних отрезков (в плоскости x–z)
        const n0: [number, number] = [-prev[1], prev[0]];
        const n1: [number, number] = [-next[1], next[0]];
        const sx = n0[0] + n1[0];
        const sz = n0[1] + n1[1];
        const len = Math.hypot(sx, sz);
        let n: [number, number] = n1;
        let scale = 1;
        if (len > 1e-6) {
            n = [sx / len, sz / len];
            // Предел растяжения: острый излом не должен давать шип
            scale = 1 / Math.max(n[0] * n1[0] + n[1] * n1[1], 0.5);
        }
        left.push([pts[i][0] + n[0] * hw * scale, y, pts[i][1] + n[1] * hw * scale]);
        right.push([pts[i][0] - n[0] * hw * scale, y, pts[i][1] - n[1] * hw * scale]);
    }
    for (let i = 0; i < m - 1; i++) b.flatQuad(left[i], left[i + 1], right[i + 1], right[i], UP);

    addDisc(b, pts[0][0], pts[0][1], hw, 8, y);
    addDisc(b, pts[m - 1][0], pts[m - 1][1], hw, 8, y);
}

// ============================================
// 🏠 ДОМ
// ============================================

/** Стены дома: четыре боковые грани от основания (заглублено) до верха стен */
function addHouseWalls(b: MeshBuilder, h: TownHouse, params: TownParams): void {
    const c = Math.cos(h.yaw);
    const s = Math.sin(h.yaw);
    const hw = h.width / 2;
    const hd = h.depth / 2;
    const bottom = -params.houses.sink;
    const top = h.wallHeight;

    const corner = (su: number, sv: number, y: number): V3 => [
        h.x + c * su * hw - s * sv * hd,
        y,
        h.z + s * su * hw + c * sv * hd,
    ];
    const sides: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
    ];
    for (let i = 0; i < 4; i++) {
        const a = sides[i];
        const d = sides[(i + 1) % 4];
        // Наружная нормаль грани — от центра дома к середине ребра
        const mx = (a[0] + d[0]) / 2;
        const mz = (a[1] + d[1]) / 2;
        const n: V3 = [c * mx - s * mz, 0, s * mx + c * mz];
        b.flatQuad(corner(a[0], a[1], bottom), corner(d[0], d[1], bottom), corner(d[0], d[1], top), corner(a[0], a[1], top), n);
    }
}

/** Крыша: четырёхскатная пирамида со свесом и смещённой вершиной */
function addHouseRoof(b: MeshBuilder, h: TownHouse, params: TownParams): void {
    const c = Math.cos(h.yaw);
    const s = Math.sin(h.yaw);
    const k = 1 + params.houses.roofOverhang;
    const hw = (h.width / 2) * k;
    const hd = (h.depth / 2) * k;
    const base = h.wallHeight;

    const corner = (su: number, sv: number): V3 => [h.x + c * su * hw - s * sv * hd, base, h.z + s * su * hw + c * sv * hd];
    const apex: V3 = [h.x + c * h.apexU - s * h.apexV, base + h.roofHeight, h.z + s * h.apexU + c * h.apexV];
    const ring: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
    ];
    for (let i = 0; i < 4; i++) {
        const a = corner(ring[i][0], ring[i][1]);
        const d = corner(ring[(i + 1) % 4][0], ring[(i + 1) % 4][1]);
        // Грань смотрит наружу и вверх: подсказка — от вершины к середине ребра, приподнятая
        const hint: V3 = [(a[0] + d[0]) / 2 - apex[0], 1, (a[2] + d[2]) / 2 - apex[2]];
        b.flatTri(a, d, apex, hint);
    }
}

// ============================================
// 🚀 ТОЧКА ВХОДА
// ============================================

export interface TownMeshes {
    /** Площадь и улицы (null — их нет) */
    readonly ground: TileMeshData | null;
    /** Дома по частям роста: от центра города к краям */
    readonly buckets: readonly TownBucket[];
}

export interface TownBucket {
    readonly mesh: TileMeshData;
    /** Средняя задержка роста частей (0–1): расстояние от площади */
    readonly delay: number;
    readonly houses: number;
}

/** Меши застройки города или null, если строить нечего */
export function buildTownMeshes(layout: TownLayout, params: TownParams): TownMeshes | null {
    const C = params.colors;

    // --- Площадь и улицы ---
    const g = new MeshBuilder();
    // Сначала второстепенные, затем главные и площади: порядок индексов не важен (разные y),
    // но так группы читаются сверху вниз
    g.begin('town-street-side');
    g.paint(C.sideStreet);
    for (const street of layout.streets) if (street.kind === 'side') addStreet(g, street, SIDE_STREET_Y);
    g.end();
    g.begin('town-street-main');
    g.paint(C.mainStreet);
    for (const street of layout.streets) if (street.kind === 'main') addStreet(g, street, MAIN_STREET_Y);
    g.end();
    g.begin('town-square');
    g.paint(C.square);
    for (const sq of layout.squares) addDisc(g, sq.x, sq.z, sq.radius, params.square.segments, SQUARE_Y);
    g.end();

    // --- Дома: разбиваем на части по расстоянию от площади ---
    const count = Math.max(1, params.animation.buckets);
    const parts: TownHouse[][] = Array.from({ length: count }, () => []);
    for (const house of layout.houses) parts[Math.min(count - 1, Math.floor(house.delay * count))].push(house);

    const roofColors = [C.roofA, C.roofB, C.roofC];
    const buckets: TownBucket[] = [];
    for (const part of parts) {
        if (part.length === 0) continue;
        const b = new MeshBuilder();
        b.begin('town-house-wall');
        for (const h of part) {
            b.paint(C.wall, h.tone);
            addHouseWalls(b, h, params);
        }
        b.end();
        b.begin('town-house-roof');
        for (const h of part) {
            b.paint(roofColors[h.roof % roofColors.length], h.tone);
            addHouseRoof(b, h, params);
        }
        b.end();
        buckets.push({
            mesh: b.finish(),
            delay: part.reduce((sum, h) => sum + h.delay, 0) / part.length,
            houses: part.length,
        });
    }

    if (g.empty && buckets.length === 0) return null;
    return { ground: g.empty ? null : g.finish(), buckets };
}
