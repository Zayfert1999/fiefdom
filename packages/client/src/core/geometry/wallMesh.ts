// packages/client/src/core/geometry/wallMesh.ts
// ============================================
// 🧱 МЕШ ГОРОДСКИХ СТЕН ИЗ РАСКЛАДКИ
// ============================================
// Чистый модуль (без three и React). Строит ОДИН меш на город в формате TileMeshData
// (тот же материал и те же буферы, что у тайлов): вершинные цвета, плоские и сглаженные
// нормали, группы `wall`, `tower`, `gate`, `merlon`.
//
// Координаты — мировые по x и z; высота y отсчитывается от поверхности города:
// 0 — поверхность, −sink — заглублённое основание. При отрисовке меш ставится на высоту
// поверхности города, а анимация «из земли» — это масштаб по y вокруг этой точки.
//
// Примитивы:
//   • стена     — лента по контуру (выдавленный контур) с miter-стыками; повороты острее
//                 порога creaseAngle получают чёткий угол, мягче — сглаженную нормаль;
//   • башня     — цилиндр с плоской крышей;
//   • ворота    — блок с проходом: прямые стойки, полукруглый свод, без пола;
//   • зубец     — бокс без дна.
// ============================================
import { hexToLinear, type MeshGroup, type TileMeshData } from './tileMesh';
import type { GateSpec, MerlonSpec, TowerSpec, WallLayout, WallRun } from './wallLayout';
import type { GateParams, WallBodyParams, WallParams } from './wallParams';

type V3 = readonly [number, number, number];

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

    begin(featureId: string, hex: string): void {
        this.groupId = featureId;
        this.groupStart = this.idx.length;
        this.color = hexToLinear(hex);
    }

    end(): void {
        const count = this.idx.length - this.groupStart;
        if (count > 0) this.groups.push({ featureId: this.groupId, surface: 'city', start: this.groupStart, count });
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

    /** Четырёхугольник a-b-c-d (обход по контуру) с вершинными нормалями na..nd */
    quad(pa: V3, pb: V3, pc: V3, pd: V3, na: V3, nb: V3, nc: V3, nd: V3, hint: V3): void {
        const a = this.vertex(pa, na);
        const b = this.vertex(pb, nb);
        const c = this.vertex(pc, nc);
        const d = this.vertex(pd, nd);
        this.tri(a, b, c, hint);
        this.tri(a, c, d, hint);
    }

    /** Плоский четырёхугольник: одна нормаль на все вершины */
    flatQuad(pa: V3, pb: V3, pc: V3, pd: V3, n: V3): void {
        this.quad(pa, pb, pc, pd, n, n, n, n, n);
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

const UP: V3 = [0, 1, 0];

// ============================================
// 🧱 СТЕНА: ЛЕНТА ПО КОНТУРУ
// ============================================

/** Предел растяжения miter: острый излом не должен давать длинный шип */
const MIN_MITER_COS = 0.35;

function addRibbon(b: MeshBuilder, run: WallRun, wall: WallBodyParams): void {
    const pts = run.points;
    const m = pts.length;
    const closed = run.closed;
    const edgeCount = closed ? m : m - 1;
    if (edgeCount < 1) return;

    // Направления и левые нормали рёбер
    const dir: [number, number][] = [];
    const nrm: [number, number][] = [];
    for (let e = 0; e < edgeCount; e++) {
        const a = pts[e];
        const c = pts[(e + 1) % m];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
        const d: [number, number] = [(c[0] - a[0]) / len, (c[1] - a[1]) / len];
        dir.push(d);
        nrm.push([-d[1], d[0]]);
    }

    // Miter-смещение и тип угла в каждой вершине
    const hw = wall.width / 2;
    const leftPts: [number, number][] = [];
    const rightPts: [number, number][] = [];
    const vertexNormal: [number, number][] = [];
    const hard: boolean[] = [];
    for (let i = 0; i < m; i++) {
        const prev = closed ? (i - 1 + m) % m : i - 1;
        const next = closed ? i : i < edgeCount ? i : -1;
        let n: [number, number];
        let scale = 1;
        let isHard = false;
        if (prev >= 0 && next >= 0) {
            const n0 = nrm[prev];
            const n1 = nrm[next];
            const sx = n0[0] + n1[0];
            const sz = n0[1] + n1[1];
            const len = Math.hypot(sx, sz);
            if (len < 1e-6) {
                n = n1;
            } else {
                n = [sx / len, sz / len];
                scale = 1 / Math.max(n[0] * n1[0] + n[1] * n1[1], MIN_MITER_COS);
            }
            const cosTurn = Math.max(-1, Math.min(1, dir[prev][0] * dir[next][0] + dir[prev][1] * dir[next][1]));
            isHard = (Math.acos(cosTurn) * 180) / Math.PI > wall.creaseAngle;
        } else {
            n = nrm[prev >= 0 ? prev : next];
        }
        vertexNormal.push(n);
        hard.push(isHard);
        leftPts.push([pts[i][0] + n[0] * hw * scale, pts[i][1] + n[1] * hw * scale]);
        rightPts.push([pts[i][0] - n[0] * hw * scale, pts[i][1] - n[1] * hw * scale]);
    }

    const top = wall.height;
    const bottom = -wall.sink;
    const at = (xz: readonly [number, number], y: number): V3 => [xz[0], y, xz[1]];

    for (let e = 0; e < edgeCount; e++) {
        const i = e;
        const j = (e + 1) % m;
        const edgeN = nrm[e];
        const ni: [number, number] = hard[i] ? edgeN : vertexNormal[i];
        const nj: [number, number] = hard[j] ? edgeN : vertexNormal[j];

        // Левая сторона
        b.quad(
            at(leftPts[i], bottom), at(leftPts[j], bottom), at(leftPts[j], top), at(leftPts[i], top),
            [ni[0], 0, ni[1]], [nj[0], 0, nj[1]], [nj[0], 0, nj[1]], [ni[0], 0, ni[1]],
            [edgeN[0], 0, edgeN[1]]
        );
        // Правая сторона (нормали наружу в противоположную сторону)
        b.quad(
            at(rightPts[i], bottom), at(rightPts[j], bottom), at(rightPts[j], top), at(rightPts[i], top),
            [-ni[0], 0, -ni[1]], [-nj[0], 0, -nj[1]], [-nj[0], 0, -nj[1]], [-ni[0], 0, -ni[1]],
            [-edgeN[0], 0, -edgeN[1]]
        );
        // Верх
        b.flatQuad(at(leftPts[i], top), at(leftPts[j], top), at(rightPts[j], top), at(rightPts[i], top), UP);
    }

    // Торцы открытых участков (обычно скрыты в башнях ворот)
    if (!closed) {
        const d0 = dir[0];
        b.flatQuad(
            at(leftPts[0], bottom), at(rightPts[0], bottom), at(rightPts[0], top), at(leftPts[0], top),
            [-d0[0], 0, -d0[1]]
        );
        const last = m - 1;
        const d1 = dir[edgeCount - 1];
        b.flatQuad(
            at(leftPts[last], bottom), at(rightPts[last], bottom), at(rightPts[last], top), at(leftPts[last], top),
            [d1[0], 0, d1[1]]
        );
    }
}

// ============================================
// 🗼 БАШНЯ: ЦИЛИНДР
// ============================================

function addCylinder(b: MeshBuilder, tower: TowerSpec, sink: number, segments: number): void {
    const { x: cx, z: cz, radius: r, height: h } = tower;
    const ring: { x: number; z: number; c: number; s: number }[] = [];
    for (let k = 0; k < segments; k++) {
        const angle = (k / segments) * 2 * Math.PI;
        ring.push({ x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r, c: Math.cos(angle), s: Math.sin(angle) });
    }

    // Бок: сглаженные радиальные нормали
    for (let k = 0; k < segments; k++) {
        const p = ring[k];
        const q = ring[(k + 1) % segments];
        const mid: V3 = [p.c + q.c, 0, p.s + q.s];
        b.quad(
            [p.x, -sink, p.z], [q.x, -sink, q.z], [q.x, h, q.z], [p.x, h, p.z],
            [p.c, 0, p.s], [q.c, 0, q.s], [q.c, 0, q.s], [p.c, 0, p.s],
            mid
        );
    }

    // Крыша: веер из центра
    const center = b.vertex([cx, h, cz], UP);
    const rim = ring.map((p) => b.vertex([p.x, h, p.z], UP));
    for (let k = 0; k < segments; k++) b.tri(center, rim[k], rim[(k + 1) % segments], UP);
}

// ============================================
// 📦 ЗУБЕЦ: БОКС БЕЗ ДНА
// ============================================

function addBox(b: MeshBuilder, m: MerlonSpec): void {
    const hl = m.length / 2;
    const ht = m.thickness / 2;
    const vx = -m.uz;
    const vz = m.ux;
    const y0 = m.y - 0.3; // чуть вглубь, чтобы на изгибе стены не было щелей
    const y1 = m.y + m.height;

    const corner = (su: number, sv: number, y: number): V3 => [
        m.x + m.ux * su * hl + vx * sv * ht,
        y,
        m.z + m.uz * su * hl + vz * sv * ht,
    ];
    const face = (a: [number, number], c: [number, number], n: V3): void =>
        b.flatQuad(corner(a[0], a[1], y0), corner(c[0], c[1], y0), corner(c[0], c[1], y1), corner(a[0], a[1], y1), n);

    face([1, -1], [1, 1], [m.ux, 0, m.uz]);
    face([-1, 1], [-1, -1], [-m.ux, 0, -m.uz]);
    face([1, 1], [-1, 1], [vx, 0, vz]);
    face([-1, -1], [1, -1], [-vx, 0, -vz]);
    b.flatQuad(corner(-1, -1, y1), corner(1, -1, y1), corner(1, 1, y1), corner(-1, 1, y1), UP);
}

// ============================================
// 🚪 ВОРОТА: БЛОК С ПРОХОДОМ
// ============================================

function addGate(b: MeshBuilder, g: GateSpec, gate: GateParams, sink: number): void {
    const W = g.width;
    const D = g.depth;
    const H = gate.height;
    const r = Math.min(gate.archWidth / 2, W / 2 - 0.5);
    const ys = Math.max(0, gate.archHeight - r); // уровень начала свода
    const S = gate.archSegments;

    // (вдоль стены p, высота y, поперёк стены a) → мир
    const P = (p: number, y: number, a: number): V3 => [g.cx + g.px * p + g.ax * a, y, g.cz + g.pz * p + g.az * a];
    const N = (np: number, ny: number, na: number): V3 => [g.px * np + g.ax * na, ny, g.pz * np + g.az * na];

    // Точки свода слева направо: от (−r, ys) до (r, ys)
    const arch: { p: number; y: number; np: number; ny: number }[] = [];
    for (let k = 0; k <= S; k++) {
        const theta = Math.PI - (k / S) * Math.PI;
        const p = r * Math.cos(theta);
        const y = ys + r * Math.sin(theta);
        // Нормаль внутрь прохода — к центру дуги
        const len = Math.hypot(p, y - ys) || 1;
        arch.push({ p, y, np: -p / len, ny: (ys - y) / len });
    }

    // Лицевая и тыловая стороны (a = ±D/2): две стойки и кладка над сводом
    for (const side of [-1, 1]) {
        const a = (side * D) / 2;
        const n = N(0, 0, side);
        b.flatQuad(P(-W / 2, -sink, a), P(-r, -sink, a), P(-r, H, a), P(-W / 2, H, a), n);
        b.flatQuad(P(r, -sink, a), P(W / 2, -sink, a), P(W / 2, H, a), P(r, H, a), n);
        for (let k = 0; k < S; k++) {
            const p0 = arch[k];
            const p1 = arch[k + 1];
            b.flatQuad(P(p0.p, p0.y, a), P(p1.p, p1.y, a), P(p1.p, H, a), P(p0.p, H, a), n);
        }
    }

    // Проход: боковые стенки и свод (без пола), нормали внутрь прохода
    if (ys > 0) {
        b.flatQuad(P(-r, -sink, -D / 2), P(-r, -sink, D / 2), P(-r, ys, D / 2), P(-r, ys, -D / 2), N(1, 0, 0));
        b.flatQuad(P(r, -sink, D / 2), P(r, -sink, -D / 2), P(r, ys, -D / 2), P(r, ys, D / 2), N(-1, 0, 0));
    }
    for (let k = 0; k < S; k++) {
        const p0 = arch[k];
        const p1 = arch[k + 1];
        const n0 = N(p0.np, p0.ny, 0);
        const n1 = N(p1.np, p1.ny, 0);
        const mid = N((p0.np + p1.np) / 2, (p0.ny + p1.ny) / 2, 0);
        b.quad(P(p0.p, p0.y, -D / 2), P(p1.p, p1.y, -D / 2), P(p1.p, p1.y, D / 2), P(p0.p, p0.y, D / 2), n0, n1, n1, n0, mid);
    }

    // Торцы блока (по бокам скрыты башнями, но замыкают объём)
    b.flatQuad(P(-W / 2, -sink, D / 2), P(-W / 2, -sink, -D / 2), P(-W / 2, H, -D / 2), P(-W / 2, H, D / 2), N(-1, 0, 0));
    b.flatQuad(P(W / 2, -sink, -D / 2), P(W / 2, -sink, D / 2), P(W / 2, H, D / 2), P(W / 2, H, -D / 2), N(1, 0, 0));

    // Верх
    b.flatQuad(P(-W / 2, H, -D / 2), P(W / 2, H, -D / 2), P(W / 2, H, D / 2), P(-W / 2, H, D / 2), UP);
}

// ============================================
// 🏰 ВСЁ ВМЕСТЕ
// ============================================

/** Меш стен города из раскладки; null — строить нечего */
export function buildWallMesh(layout: WallLayout, params: WallParams): TileMeshData | null {
    if (layout.runs.length === 0 && layout.towers.length === 0 && layout.gates.length === 0) return null;

    const b = new MeshBuilder();

    b.begin('wall', params.colors.wall);
    for (const run of layout.runs) addRibbon(b, run, params.wall);
    b.end();

    b.begin('tower', params.colors.tower);
    for (const tower of layout.towers) addCylinder(b, tower, params.wall.sink, params.tower.segments);
    b.end();

    b.begin('gate', params.colors.gate);
    for (const gate of layout.gates) addGate(b, gate, params.gate, params.wall.sink);
    b.end();

    b.begin('merlon', params.colors.merlon);
    for (const merlon of layout.merlons) addBox(b, merlon);
    b.end();

    return b.finish();
}
