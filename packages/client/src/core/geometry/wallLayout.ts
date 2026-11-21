// packages/client/src/core/geometry/wallLayout.ts
// ============================================
// 🧭 РАСКЛАДКА СТЕН ГОРОДА: УЧАСТКИ, БАШНИ, ВОРОТА, ЗУБЦЫ
// ============================================
// Чистый модуль (без three, React и clipper). Превращает регион города (кольца контура
// и места ворот из cityRegions.ts) в список примитивов; сами меши строит wallMesh.ts.
//
//   • участки стены  — кольца контура, разрезанные в местах ворот (без ворот — замкнутое кольцо);
//   • башни          — на углах тайлов (точках сетки), через которые проходит контур,
//                      и по бокам ворот;
//   • ворота         — луч от конца дороги наружу до ближайшего кольца даёт центр ворот;
//                      блок ориентируется вдоль стены, арка идёт поперёк;
//   • зубцы (мерлоны) — равномерно вдоль участков, по кругу на башнях, поверх ворот.
// ============================================
import type { Point, Polygon } from '@fiefdom/shared/core/geometry.types';
import type { CityRegion } from './cityRegions';
import { HALF } from './generators/sides';
import { BOARD_TILE_SIZE } from './regionStitch';
import type { WallParams } from './wallParams';

// ============================================
// 🧩 ТИПЫ
// ============================================

export interface WallRun {
    readonly points: readonly Point[];
    /** true — замкнутое кольцо без разрывов */
    readonly closed: boolean;
}

export interface TowerSpec {
    readonly x: number;
    readonly z: number;
    readonly radius: number;
    readonly height: number;
    /** corner — на стыке тайлов, gate — по бокам ворот */
    readonly kind: 'corner' | 'gate';
}

export interface GateSpec {
    /** Центр блока ворот на контуре */
    readonly cx: number;
    readonly cz: number;
    /** Единичный вектор вдоль стены */
    readonly px: number;
    readonly pz: number;
    /** Единичный вектор поперёк стены: вдоль него идёт проход */
    readonly ax: number;
    readonly az: number;
    /** Длина блока вдоль стены (расстояние между осями боковых башен) */
    readonly width: number;
    /** Толщина блока (стена + extraDepth) */
    readonly depth: number;
}

export interface MerlonSpec {
    readonly x: number;
    readonly z: number;
    /** Единичный вектор вдоль длины зубца */
    readonly ux: number;
    readonly uz: number;
    readonly length: number;
    readonly thickness: number;
    /** Высота, на которой зубец стоит (верх стены, башни или ворот) */
    readonly y: number;
    readonly height: number;
    readonly part: 'wall' | 'tower' | 'gate';
}

export interface WallLayout {
    readonly runs: readonly WallRun[];
    readonly towers: readonly TowerSpec[];
    readonly gates: readonly GateSpec[];
    readonly merlons: readonly MerlonSpec[];
    /** Что не удалось разложить (ворота без пересечения с контуром и т. п.) */
    readonly warnings: readonly string[];
}

// ============================================
// 📏 ПУТИ ВДОЛЬ ЛОМАНОЙ
// ============================================

interface Path {
    readonly pts: Point[];
    /** cum[i] — длина дуги от pts[0] до pts[i] */
    readonly cum: number[];
    readonly length: number;
    readonly closed: boolean;
}

const DUPLICATE = 1e-6;
const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function makePath(points: readonly Point[], closed: boolean): Path | null {
    const pts: Point[] = [];
    for (const p of points) {
        const last = pts[pts.length - 1];
        if (!last || dist(last, p) > DUPLICATE) pts.push(p);
    }
    if (closed && pts.length > 1 && dist(pts[0], pts[pts.length - 1]) <= DUPLICATE) pts.pop();
    if (pts.length < (closed ? 3 : 2)) return null;

    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const length = cum[pts.length - 1] + (closed ? dist(pts[pts.length - 1], pts[0]) : 0);
    return length > DUPLICATE ? { pts, cum, length, closed } : null;
}

/** Индекс сегмента, на котором лежит дуга t (0 ≤ t ≤ length) */
function segmentAt(path: Path, t: number): number {
    let lo = 0;
    let hi = path.pts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (path.cum[mid] <= t) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function normalizeS(path: Path, s: number): number {
    return path.closed ? ((s % path.length) + path.length) % path.length : Math.min(path.length, Math.max(0, s));
}

function pointAt(path: Path, s: number): Point {
    const t = normalizeS(path, s);
    const i = segmentAt(path, t);
    const n = path.pts.length;
    const a = path.pts[i];
    if (!path.closed && i === n - 1) return a;
    const b = path.pts[(i + 1) % n];
    const end = i < n - 1 ? path.cum[i + 1] : path.length;
    const segLen = end - path.cum[i];
    const u = segLen > 0 ? (t - path.cum[i]) / segLen : 0;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** Единичная касательная в точке дуги s (по хорде ±halfSpan) */
function tangentAt(path: Path, s: number, halfSpan: number): Point {
    const p0 = pointAt(path, s - halfSpan);
    const p1 = pointAt(path, s + halfSpan);
    const len = dist(p0, p1);
    if (len > DUPLICATE) return [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
    const i = segmentAt(path, normalizeS(path, s));
    const a = path.pts[i];
    const b = path.pts[Math.min(i + 1, path.pts.length - 1)] ?? path.pts[0];
    const l = dist(a, b) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}

/** Участок замкнутого пути от дуги s0 до s1 (s1 > s0, длина участка ≤ длины кольца) */
function sliceClosed(path: Path, s0: number, s1: number): Point[] {
    const L = path.length;
    const start = ((s0 % L) + L) % L;
    const len = s1 - s0;
    const inner: { pos: number; p: Point }[] = [];
    for (let lap = 0; lap < 2; lap++) {
        path.pts.forEach((p, i) => {
            const pos = path.cum[i] + lap * L;
            if (pos > start + 1e-6 && pos < start + len - 1e-6) inner.push({ pos, p });
        });
    }
    inner.sort((a, b) => a.pos - b.pos);
    return [pointAt(path, start), ...inner.map((e) => e.p), pointAt(path, start + len)];
}

/** Ближайшее расстояние от точки до ломаной */
function distanceToPath(p: Point, path: Path): number {
    let best = Infinity;
    const n = path.pts.length;
    const count = path.closed ? n : n - 1;
    for (let i = 0; i < count; i++) {
        const a = path.pts[i];
        const b = path.pts[(i + 1) % n];
        const abx = b[0] - a[0];
        const abz = b[1] - a[1];
        const len2 = abx * abx + abz * abz;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
        best = Math.min(best, Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t)));
    }
    return best;
}

interface RayHit {
    readonly ring: number;
    /** Расстояние вдоль луча */
    readonly t: number;
    /** Дуга на кольце */
    readonly s: number;
}

/** Ближайшее пересечение луча (origin + t·dir, t > 0) с кольцами */
function castRay(paths: readonly Path[], origin: Point, dir: Point, maxT: number): RayHit | null {
    let best: RayHit | null = null;
    paths.forEach((path, ring) => {
        const n = path.pts.length;
        for (let i = 0; i < n; i++) {
            const a = path.pts[i];
            const b = path.pts[(i + 1) % n];
            const ex = b[0] - a[0];
            const ez = b[1] - a[1];
            const denom = dir[0] * ez - dir[1] * ex;
            if (Math.abs(denom) < 1e-12) continue;
            const ox = a[0] - origin[0];
            const oz = a[1] - origin[1];
            const t = (ox * ez - oz * ex) / denom;
            const u = (ox * dir[1] - oz * dir[0]) / denom;
            if (t <= 1e-6 || t > maxT || u < 0 || u >= 1) continue;
            if (!best || t < best.t) {
                const end = i < n - 1 ? path.cum[i + 1] : path.length;
                best = { ring, t, s: path.cum[i] + u * (end - path.cum[i]) };
            }
        }
    });
    return best;
}

/** Пересечение ломаной (в порядке обхода) с кольцами: первое от её начала */
function castPolyline(paths: readonly Path[], polyline: readonly Point[]): (RayHit & { point: Point }) | null {
    for (let i = 0; i + 1 < polyline.length; i++) {
        const a = polyline[i];
        const b = polyline[i + 1];
        const len = dist(a, b);
        if (len < DUPLICATE) continue;
        const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        const hit = castRay(paths, a, dir, len);
        if (hit) return { ...hit, point: [a[0] + dir[0] * hit.t, a[1] + dir[1] * hit.t] };
    }
    return null;
}

/** Дуга ближайшей к точке точки кольца */
function nearestS(path: Path, p: Point): number {
    let best = Infinity;
    let bestS = 0;
    const n = path.pts.length;
    for (let i = 0; i < n; i++) {
        const a = path.pts[i];
        const b = path.pts[(i + 1) % n];
        const abx = b[0] - a[0];
        const abz = b[1] - a[1];
        const len2 = abx * abx + abz * abz;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
        const d = Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
        if (d < best) {
            const end = i < n - 1 ? path.cum[i + 1] : path.length;
            best = d;
            bestS = path.cum[i] + t * (end - path.cum[i]);
        }
    }
    return bestS;
}

// ============================================
// 🧭 РАСКЛАДКА
// ============================================

/** Дальше этого от конца дороги пересечение с контуром не ищется */
const MAX_GATE_REACH = 120;
/** Угол тайла считается лежащим на контуре, если расстояние до контура не больше */
const CORNER_TOLERANCE = 0.75;
/** Колец короче этой длины стены не получают (вырожденные огрызки) */
const MIN_RING_LENGTH_FACTOR = 4;

export function layoutCityWalls(
    region: Pick<CityRegion, 'polygons' | 'gates' | 'cells'>,
    params: WallParams
): WallLayout {
    const warnings: string[] = [];
    const { wall, tower, gate: gateParams, merlon } = params;

    // 1) Кольца
    const paths: Path[] = [];
    for (const polygon of region.polygons as readonly Polygon[]) {
        const rings = params.innerRings ? polygon : polygon.slice(0, 1);
        for (const ring of rings) {
            const path = makePath(ring, true);
            if (path && path.length >= wall.width * MIN_RING_LENGTH_FACTOR) paths.push(path);
        }
    }

    // 2) Ворота
    const towers: TowerSpec[] = [];
    const gates: GateSpec[] = [];
    // from..to — участок кольца, вырезаемый под ворота; center — дуга, где ось дороги пересекает контур
    const cuts: { ring: number; center: number; from: number; to: number }[] = [];
    for (const site of region.gates) {
        // Центр ворот — там, где ОСЬ ДОРОГИ (а не её прямое продолжение от конца) выходит на контур.
        // После шума ось изгибается, и луч по направлению конца промахивается мимо неё на единицы длины.
        const hit =
            (site.path && castPolyline(paths, site.path)) ||
            (() => {
                const ray = castRay(paths, [site.x, site.z], [-site.dirX, -site.dirZ], MAX_GATE_REACH);
                return ray && { ...ray, point: [site.x - site.dirX * ray.t, site.z - site.dirZ * ray.t] as Point };
            })();
        if (!hit) {
            warnings.push(`Ворота у (${site.x.toFixed(1)}, ${site.z.toFixed(1)}): дорога не пересекает контур города`);
            continue;
        }
        const path = paths[hit.ring];
        const half = gateParams.width / 2;
        const clearance = gateParams.width + 2 * gateParams.towerRadius;
        if (path.length < 2 * clearance) {
            warnings.push(`Ворота у (${site.x.toFixed(1)}, ${site.z.toFixed(1)}): кольцо слишком короткое`);
            continue;
        }
        const tooClose = cuts.some((c) => {
            if (c.ring !== hit.ring) return false;
            const d = Math.abs(c.center - hit.s);
            return Math.min(d, path.length - d) < clearance;
        });
        if (tooClose) {
            warnings.push(`Ворота у (${site.x.toFixed(1)}, ${site.z.toFixed(1)}): слишком близко к другим воротам`);
            continue;
        }

        // Направление блока — по хорде контура вокруг центра; блок стоит ровно на контуре в точке
        // пересечения с осью дороги, а не на середине хорды (она смещена внутрь изгиба и уходит
        // вбок, когда контур несимметричен)
        const chordA = pointAt(path, hit.s - half);
        const chordB = pointAt(path, hit.s + half);
        const chord = dist(chordA, chordB);
        if (chord < 1) continue;
        const px = (chordB[0] - chordA[0]) / chord;
        const pz = (chordB[1] - chordA[1]) / chord;
        const [cx, cz] = hit.point;

        // Боковые башни — на расстоянии half от центра вдоль блока; стена обрезается по ближайшим к ним точкам контура
        const left: Point = [cx - px * half, cz - pz * half];
        const right: Point = [cx + px * half, cz + pz * half];
        const L = path.length;
        const unwrap = (s: number): number => hit.s + ((((s - hit.s + L / 2) % L) + L) % L) - L / 2;
        let from = unwrap(nearestS(path, left));
        let to = unwrap(nearestS(path, right));
        if (!(from < hit.s && to > hit.s)) {
            from = hit.s - half;
            to = hit.s + half;
        }

        cuts.push({ ring: hit.ring, center: hit.s, from, to });
        gates.push({
            cx,
            cz,
            px,
            pz,
            ax: -pz,
            az: px,
            width: gateParams.width,
            depth: wall.width + gateParams.extraDepth,
        });
        for (const p of [left, right]) {
            towers.push({ x: p[0], z: p[1], radius: gateParams.towerRadius, height: gateParams.towerHeight, kind: 'gate' });
        }
    }

    // 3) Участки стены: кольцо, разрезанное воротами
    const runs: WallRun[] = [];
    const runPaths: Path[] = [];
    paths.forEach((path, ring) => {
        const ringCuts = cuts.filter((c) => c.ring === ring).sort((a, b) => a.center - b.center);
        if (ringCuts.length === 0) {
            runs.push({ points: path.pts, closed: true });
            runPaths.push(path);
            return;
        }
        ringCuts.forEach((cut, k) => {
            const from = cut.to;
            const next = k + 1 < ringCuts.length ? ringCuts[k + 1].from : ringCuts[0].from + path.length;
            const to = next;
            if (to - from < 1) return;
            const points = sliceClosed(path, from, to);
            const run = makePath(points, false);
            if (!run) return;
            runs.push({ points: run.pts, closed: false });
            runPaths.push(run);
        });
    });

    // 4) Башни на углах тайлов, через которые проходит контур
    const seenCorners = new Set<string>();
    for (const cell of region.cells) {
        for (const dx of [-1, 1]) {
            for (const dz of [-1, 1]) {
                const x = cell.col * BOARD_TILE_SIZE + dx * HALF;
                const z = cell.row * BOARD_TILE_SIZE + dz * HALF;
                const key = `${Math.round(x)},${Math.round(z)}`;
                if (seenCorners.has(key)) continue;
                seenCorners.add(key);

                const onWall = runPaths.some((path) => distanceToPath([x, z], path) <= CORNER_TOLERANCE);
                if (!onWall) continue;
                // Ворота приоритетнее: башня не должна пересекаться с воротами и их башнями
                const blocked =
                    gates.some((g) => Math.hypot(x - g.cx, z - g.cz) < g.width / 2 + tower.radius) ||
                    towers.some((t) => Math.hypot(x - t.x, z - t.z) < t.radius + tower.radius);
                if (blocked) continue;
                towers.push({ x, z, radius: tower.radius, height: tower.height, kind: 'corner' });
            }
        }
    }

    // 5) Зубцы
    const merlons: MerlonSpec[] = [];
    if (merlon.enabled) {
        const pitch = merlon.width + merlon.gap;
        const wallThickness = wall.width * merlon.depth;

        // 5а) Вдоль участков стены
        for (const run of runPaths) {
            let count: number;
            if (run.closed) {
                count = Math.max(3, Math.round(run.length / pitch));
                if (run.length / count < merlon.width * 1.15) count = Math.floor(run.length / (merlon.width * 1.15));
            } else {
                count = Math.floor((run.length + merlon.gap) / pitch);
            }
            if (count < 1) continue;
            const step = run.length / count;
            if (step < merlon.width) continue;

            for (let k = 0; k < count; k++) {
                const s = (k + 0.5) * step;
                const [x, z] = pointAt(run, s);
                const covered = towers.some((t) => Math.hypot(x - t.x, z - t.z) < t.radius + merlon.width * 0.35);
                if (covered) continue;
                const [ux, uz] = tangentAt(run, s, merlon.width / 2);
                merlons.push({
                    x, z, ux, uz,
                    length: merlon.width,
                    thickness: wallThickness,
                    y: wall.height,
                    height: merlon.height,
                    part: 'wall',
                });
            }
        }

        // 5б) По кругу на башнях
        for (const t of towers) {
            const thickness = Math.min(wallThickness, t.radius * 0.45);
            const r = t.radius - thickness / 2;
            const count = Math.max(6, Math.floor((2 * Math.PI * r) / pitch));
            for (let k = 0; k < count; k++) {
                const angle = (k / count) * 2 * Math.PI;
                merlons.push({
                    x: t.x + Math.cos(angle) * r,
                    z: t.z + Math.sin(angle) * r,
                    ux: -Math.sin(angle),
                    uz: Math.cos(angle),
                    length: Math.min(merlon.width, (2 * Math.PI * r) / count * 0.8),
                    thickness,
                    y: t.height,
                    height: merlon.height,
                    part: 'tower',
                });
            }
        }

        // 5в) Поверх ворот, между боковыми башнями
        for (const g of gates) {
            const usable = Math.max(0, g.width / 2 - gateParams.towerRadius * 0.5);
            const count = Math.floor((2 * usable + merlon.gap) / pitch);
            if (count < 1) continue;
            const cell = (2 * usable) / count;
            for (let k = 0; k < count; k++) {
                const offset = -usable + (k + 0.5) * cell;
                merlons.push({
                    x: g.cx + g.px * offset,
                    z: g.cz + g.pz * offset,
                    ux: g.px,
                    uz: g.pz,
                    length: Math.min(merlon.width, cell * 0.9),
                    thickness: g.depth * merlon.depth,
                    y: gateParams.height,
                    height: merlon.height,
                    part: 'gate',
                });
            }
        }
    }

    return { runs, towers, gates, merlons, warnings };
}
