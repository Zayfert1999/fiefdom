// packages/client/src/core/geometry/terrainSurface.ts
// ============================================
// 🔺 ИЗМЕЛЬЧЕНИЕ ТРЕУГОЛЬНИКОВ ДЛЯ РЕЛЬЕФА
// ============================================
// earcut строит треугольники только из точек контура: внутри поля вершин нет,
// и рельефу негде «жить». Здесь треугольники режутся по длинным рёбрам, пока
// все рёбра не станут не длиннее `maxEdge`.
//
// 🌟 КАК ЭТО РАБОТАЕТ
//   Проход: все рёбра длиннее порога получают среднюю точку (одна на ребро,
//   поэтому ОБА соседних треугольника режут его одинаково — трещин нет).
//   Затем каждый треугольник пересобирается по числу разрезанных рёбер:
//     0 → остаётся, 1 → 2 треугольника, 2 → 3, 3 → 4.
//   Проходы повторяются, пока есть длинные рёбра или не упёрлись в лимит.
//
// 🧭 СВОЙСТВА
//   • Индексы исходных вершин не меняются — новые дописываются в конец.
//   • Обход (ориентация) треугольников сохраняется.
//   • `splits` помнит, какое ребро какой точкой разрезано: по нему стены
//     стыкуются с верхом поля без щелей (см. edgeChain).
// ============================================

const EDGE_STRIDE = 1 << 22;
const MAX_PASSES = 14;

/** Ключ ребра, не зависящий от направления */
export const edgeKey = (a: number, b: number): number => (a < b ? a * EDGE_STRIDE + b : b * EDGE_STRIDE + a);

export interface RefinedSurface {
    /** Плоский массив [x0, z0, x1, z1, …]; первые вершины — исходные */
    readonly xz: number[];
    /** Индексы треугольников (тот же обход, что у входа) */
    readonly triangles: number[];
    /** ребро (по edgeKey) → индекс средней точки */
    readonly splits: ReadonlyMap<number, number>;
    /** Лимит вершин остановил измельчение раньше, чем рёбра стали короткими */
    readonly limited: boolean;
}

export function refineTriangles(
    xzIn: readonly number[],
    trianglesIn: ArrayLike<number>,
    maxEdge: number,
    maxVertices: number
): RefinedSurface {
    const xz = Array.from(xzIn);
    let triangles = Array.from(trianglesIn);
    const splits = new Map<number, number>();
    const maxSq = maxEdge * maxEdge;
    let limited = false;

    const lengthSq = (a: number, b: number): number => {
        const dx = xz[a * 2] - xz[b * 2];
        const dz = xz[a * 2 + 1] - xz[b * 2 + 1];
        return dx * dx + dz * dz;
    };

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        // 1) Какие рёбра режем в этом проходе
        const mids = new Map<number, number>();
        let stop = false;
        const mark = (a: number, b: number): void => {
            if (stop || lengthSq(a, b) <= maxSq) return;
            const key = edgeKey(a, b);
            if (mids.has(key)) return;
            if (xz.length / 2 >= maxVertices) {
                stop = true;
                limited = true;
                return;
            }
            const mid = xz.length / 2;
            xz.push((xz[a * 2] + xz[b * 2]) / 2, (xz[a * 2 + 1] + xz[b * 2 + 1]) / 2);
            mids.set(key, mid);
            splits.set(key, mid);
        };
        for (let t = 0; t < triangles.length; t += 3) {
            const a = triangles[t];
            const b = triangles[t + 1];
            const c = triangles[t + 2];
            mark(a, b);
            mark(b, c);
            mark(c, a);
        }
        if (mids.size === 0) break;

        // 2) Пересборка треугольников
        const next: number[] = [];
        for (let t = 0; t < triangles.length; t += 3) {
            const v = [triangles[t], triangles[t + 1], triangles[t + 2]];
            const m = [
                mids.get(edgeKey(v[0], v[1])) ?? -1,
                mids.get(edgeKey(v[1], v[2])) ?? -1,
                mids.get(edgeKey(v[2], v[0])) ?? -1,
            ];
            const count = (m[0] >= 0 ? 1 : 0) + (m[1] >= 0 ? 1 : 0) + (m[2] >= 0 ? 1 : 0);

            if (count === 0) {
                next.push(v[0], v[1], v[2]);
            } else if (count === 1) {
                // Поворачиваем так, чтобы разрезанным было ребро (a, b)
                const i = m[0] >= 0 ? 0 : m[1] >= 0 ? 1 : 2;
                const a = v[i];
                const b = v[(i + 1) % 3];
                const c = v[(i + 2) % 3];
                const mid = m[i];
                next.push(a, mid, c, mid, b, c);
            } else if (count === 2) {
                // Поворачиваем так, чтобы целым осталось ребро (c, a)
                const j = m[0] < 0 ? 0 : m[1] < 0 ? 1 : 2;
                const c = v[j];
                const a = v[(j + 1) % 3];
                const b = v[(j + 2) % 3];
                const mab = m[(j + 1) % 3];
                const mbc = m[(j + 2) % 3];
                next.push(mab, b, mbc);
                // Четырёхугольник (a, mab, mbc, c) режем по короткой диагонали
                if (lengthSq(a, mbc) <= lengthSq(mab, c)) {
                    next.push(a, mab, mbc, a, mbc, c);
                } else {
                    next.push(a, mab, c, mab, mbc, c);
                }
            } else {
                next.push(v[0], m[0], m[2], m[0], v[1], m[1], m[2], m[1], v[2], m[0], m[1], m[2]);
            }
        }
        triangles = next;
        if (stop) break;
    }

    return { xz, triangles, splits, limited };
}

/**
 * Упорядоченная цепочка вершин от a до b вдоль ребра с учётом всех его разрезов.
 * Для неразрезанного ребра — [a, b].
 */
export function edgeChain(a: number, b: number, splits: ReadonlyMap<number, number>): number[] {
    const mid = splits.get(edgeKey(a, b));
    if (mid === undefined) return [a, b];
    const left = edgeChain(a, mid, splits);
    const right = edgeChain(mid, b, splits);
    return [...left, ...right.slice(1)];
}

/** Расстояние от точки до ближайшего из отрезков [ax, az, bx, bz, …] */
export function distanceToSegments(x: number, z: number, segments: readonly number[]): number {
    let best = Infinity;
    for (let i = 0; i < segments.length; i += 4) {
        const ax = segments[i];
        const az = segments[i + 1];
        const dx = segments[i + 2] - ax;
        const dz = segments[i + 3] - az;
        const lenSq = dx * dx + dz * dz;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lenSq));
        const px = ax + t * dx - x;
        const pz = az + t * dz - z;
        const d = px * px + pz * pz;
        if (d < best) best = d;
    }
    return Math.sqrt(best);
}

/**
 * Индекс отрезков для быстрого «расстояния до ближайшего отрезка не дальше cap».
 * Нужен для больших регионов: перебор всех отрезков для каждой вершины сетки
 * (десятки тысяч вершин × тысячи рёбер) слишком медленный.
 *
 * Сетка ячеек размером cap: отрезок записывается во все ячейки своего габарита, запрос смотрит
 * 3×3 ячейки вокруг точки — этого хватает для любого отрезка ближе cap.
 */
export class SegmentGrid {
    private readonly cell: number;
    private readonly cells = new Map<number, number[]>();
    private readonly segments: readonly number[];

    /** @param segments плоский массив [ax, az, bx, bz, …] */
    constructor(segments: readonly number[], cap: number) {
        this.segments = segments;
        this.cell = Math.max(cap, 1e-6);
        for (let i = 0; i < segments.length; i += 4) {
            const x0 = Math.floor(Math.min(segments[i], segments[i + 2]) / this.cell);
            const x1 = Math.floor(Math.max(segments[i], segments[i + 2]) / this.cell);
            const z0 = Math.floor(Math.min(segments[i + 1], segments[i + 3]) / this.cell);
            const z1 = Math.floor(Math.max(segments[i + 1], segments[i + 3]) / this.cell);
            for (let cx = x0; cx <= x1; cx++) {
                for (let cz = z0; cz <= z1; cz++) {
                    const key = SegmentGrid.key(cx, cz);
                    const list = this.cells.get(key);
                    if (list) list.push(i);
                    else this.cells.set(key, [i]);
                }
            }
        }
    }

    private static key(cx: number, cz: number): number {
        return (cx + 524288) * 1048576 + (cz + 524288);
    }

    /** Расстояние до ближайшего отрезка, если оно ≤ cap; иначе Infinity */
    distance(x: number, z: number, cap: number): number {
        const cx = Math.floor(x / this.cell);
        const cz = Math.floor(z / this.cell);
        let best = Infinity;
        const S = this.segments;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const list = this.cells.get(SegmentGrid.key(cx + dx, cz + dz));
                if (!list) continue;
                for (const i of list) {
                    const ax = S[i], az = S[i + 1];
                    const ex = S[i + 2] - ax, ez = S[i + 3] - az;
                    const lenSq = ex * ex + ez * ez;
                    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / lenSq));
                    const px = ax + t * ex - x;
                    const pz = az + t * ez - z;
                    const d = px * px + pz * pz;
                    if (d < best) best = d;
                }
            }
        }
        const dist = Math.sqrt(best);
        return dist <= cap ? dist : Infinity;
    }
}
