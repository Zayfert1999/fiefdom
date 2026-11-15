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
