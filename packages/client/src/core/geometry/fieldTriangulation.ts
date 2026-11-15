// packages/client/src/core/geometry/fieldTriangulation.ts
// ============================================
// 🔷 РОВНАЯ СЕТКА ВЕРХА ПОЛЯ (для рельефа)
// ============================================
// earcut строит треугольники только из точек контура: длинные веера и тонкие
// «иглы». Для плоской крышки это не страшно, а для рельефа — плохо: высота
// считается в вершинах, и там, где вершин мало или они вытянуты, поверхность
// получается рваной и со складками.
//
// 🌟 КАК ЭТО РАБОТАЕТ
//   1. Контур. Каждое ребро кольца делится на равные отрезки не длиннее `step`.
//      Исходные вершины колец сохраняют свои индексы (первые в списке).
//   2. Внутренность. Берётся треугольная (гексагональная) решётка с шагом `step`;
//      оставляются точки внутри полигона, не ближе 0.6·step к контуру. Решётка чуть
//      «дрожит» детерминированно — так нет идеально сферических четвёрок точек,
//      на которых ломается Делоне, и сетка выглядит живее.
//   3. Делоне. Все точки триангулируются (delaunay.ts) — получаются близкие к
//      равносторонним треугольники.
//   4. Границы. Рёбра контура могут не попасть в Делоне. Каждый пропавший отрезок
//      делится пополам, середина добавляется в ту же триангуляцию — и так до тех пор,
//      пока все отрезки контура не станут рёбрами (рёбра сетки не пересекают контур).
//   5. Отбор. Остаются треугольники, чей центр лежит внутри полигона
//      (even-odd по всем кольцам, дырки учтены).
//   6. Проверка. Сумма площадей должна совпасть с площадью полигона; иначе функция
//      возвращает null, и вызывающий код берёт запасной путь (earcut + измельчение).
//
// 🧱 Результат содержит `chains`: для каждого ребра каждого кольца — цепочка вершин
//    вдоль него. По ним стены поля стыкуются с верхом без щелей.
// ============================================
import type { Point } from '@fiefdom/shared/core/geometry.types';
import { DelaunayMesh } from './delaunay';
import { distanceToSegments } from './terrainSurface';

type Ring = Point[];

export interface UniformFieldSurface {
    /** Плоский массив [x0, z0, …]; первые вершины — вершины колец подряд (как во flat у earcut) */
    readonly xz: number[];
    /** Индексы треугольников; обход — как у плоской крышки (нормаль вверх при cross < 0 в x, z) */
    readonly triangles: number[];
    /** [кольцо][ребро] → вершины вдоль ребра от начала до конца (включая оба конца) */
    readonly chains: number[][][];
    /** Относительное отклонение площади сетки от площади полигона (контроль) */
    readonly areaDeviation: number;
}

const MAX_RECOVERY_PASSES = 14;
const MIN_SEGMENT = 1e-4;
const EDGE_STRIDE = 4194304;

const edgeKey = (a: number, b: number): number => (a < b ? a * EDGE_STRIDE + b : b * EDGE_STRIDE + a);

function ringArea(ring: Ring): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        a += x1 * y2 - x2 * y1;
    }
    return a / 2;
}

/** even-odd по всем кольцам: внутри полигона с дырками */
function insidePolygon(x: number, y: number, rings: readonly Ring[]): boolean {
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
    }
    return inside;
}

/** Детерминированный «шум» 0..1 из целых координат решётки */
function hash01(i: number, j: number, salt: number): number {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(salt, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

interface Segment {
    a: number;
    b: number;
    chain: number[];
}

export function triangulateFieldUniform(
    polygon: readonly Ring[],
    step: number,
    maxVertices: number
): UniformFieldSurface | null {
    const rings = polygon.filter((r) => r.length >= 3);
    if (rings.length === 0 || !(step > 0)) return null;

    // --- Масштаб сетки: не больше maxVertices точек ---
    const polygonArea = rings.reduce((sum, ring, i) => sum + (i === 0 ? 1 : -1) * Math.abs(ringArea(ring)), 0);
    if (!(polygonArea > 1e-9)) return null;
    let perimeter = 0;
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
        }
    }
    let h = step;
    const estimate = (s: number): number => polygonArea / (0.866 * s * s) + perimeter / s;
    for (let guard = 0; guard < 8 && estimate(h) > maxVertices; guard++) {
        h *= Math.sqrt(estimate(h) / maxVertices) * 1.05;
    }

    // --- Габариты и сетка Делоне ---
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of rings[0]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    const mesh = new DelaunayMesh(minX, minY, maxX, maxY);
    const xz: number[] = [];

    const addPoint = (x: number, y: number): number => {
        const v = mesh.insert(x, y);
        if (v < 0) return -1;
        // индексы в mesh и в xz должны совпадать
        if (v !== xz.length / 2) return -1;
        xz.push(x, y);
        return v;
    };

    // 1) Вершины колец — первыми, в порядке flat (индексы совпадают с earcut)
    const ringStart: number[] = [];
    for (const ring of rings) {
        ringStart.push(xz.length / 2);
        for (const [x, y] of ring) if (addPoint(x, y) < 0) return null;
    }

    // 2) Равномерное деление рёбер
    const segments: Segment[] = [];
    const chains: number[][][] = rings.map((ring, r) =>
        ring.map((_, i) => {
            const next = (i + 1) % ring.length;
            return [ringStart[r] + i, ringStart[r] + next];
        })
    );
    // Сначала все исходные вершины вставлены; теперь добавляем промежуточные
    for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const pieces = Math.max(1, Math.ceil(length / h - 1e-9));
            const chain = chains[r][i];
            const ids: number[] = [chain[0]];
            for (let k = 1; k < pieces; k++) {
                const t = k / pieces;
                const v = addPoint(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
                if (v < 0) return null;
                ids.push(v);
            }
            ids.push(chain[chain.length - 1]);
            chains[r][i] = ids;
            for (let k = 0; k + 1 < ids.length; k++) segments.push({ a: ids[k], b: ids[k + 1], chain: ids });
        }
    }

    // 3) Внутренняя решётка
    const edgeSegments: number[] = [];
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            edgeSegments.push(a[0], a[1], b[0], b[1]);
        }
    }
    const rowHeight = h * 0.8660254;
    const margin = 0.6 * h;
    const jitter = 0.06 * h;
    const rowFrom = Math.floor(minY / rowHeight) - 1;
    const rowTo = Math.ceil(maxY / rowHeight) + 1;
    for (let row = rowFrom; row <= rowTo; row++) {
        const y0 = row * rowHeight;
        const shift = (row & 1) * 0.5;
        const colFrom = Math.floor(minX / h - shift) - 1;
        const colTo = Math.ceil(maxX / h - shift) + 1;
        for (let col = colFrom; col <= colTo; col++) {
            const x = (col + shift) * h + (hash01(col, row, 1) - 0.5) * 2 * jitter;
            const y = y0 + (hash01(col, row, 2) - 0.5) * 2 * jitter;
            if (x < minX || x > maxX || y < minY || y > maxY) continue;
            if (!insidePolygon(x, y, rings)) continue;
            if (distanceToSegments(x, y, edgeSegments) < margin) continue;
            if (addPoint(x, y) < 0) return null;
        }
    }

    // 4) Восстановление отрезков контура
    for (let pass = 0; pass < MAX_RECOVERY_PASSES; pass++) {
        const edges = mesh.edgeKeys();
        const missing = segments.filter((s) => !edges.has(edgeKey(s.a, s.b)));
        if (missing.length === 0) break;
        if (pass === MAX_RECOVERY_PASSES - 1) return null;

        for (const seg of missing) {
            const ax = xz[seg.a * 2], ay = xz[seg.a * 2 + 1];
            const bx = xz[seg.b * 2], by = xz[seg.b * 2 + 1];
            if (Math.hypot(bx - ax, by - ay) < MIN_SEGMENT) return null;
            const mid = addPoint((ax + bx) / 2, (ay + by) / 2);
            if (mid < 0) return null;

            const at = seg.chain.indexOf(seg.a);
            seg.chain.splice(at + 1, 0, mid);
            segments.push({ a: seg.a, b: mid, chain: seg.chain }, { a: mid, b: seg.b, chain: seg.chain });
            seg.a = -1; // помечаем замещённый отрезок
        }
        for (let i = segments.length - 1; i >= 0; i--) if (segments[i].a < 0) segments.splice(i, 1);
    }

    // 5) Отбор внутренних треугольников
    const raw = mesh.triangles();
    const triangles: number[] = [];
    let area = 0;
    for (let t = 0; t < raw.length; t += 3) {
        const a = raw[t], b = raw[t + 1], c = raw[t + 2];
        const ax = xz[a * 2], ay = xz[a * 2 + 1];
        const bx = xz[b * 2], by = xz[b * 2 + 1];
        const cx = xz[c * 2], cy = xz[c * 2 + 1];
        if (!insidePolygon((ax + bx + cx) / 3, (ay + by + cy) / 3, rings)) continue;
        const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); // > 0: против часовой
        area += Math.abs(cross) / 2;
        // Обход как у плоской крышки: нормаль вверх при cross < 0
        if (cross > 0) triangles.push(a, c, b);
        else triangles.push(a, b, c);
    }
    if (triangles.length === 0) return null;

    // 6) Контроль площади
    const areaDeviation = Math.abs(area - polygonArea) / polygonArea;
    if (areaDeviation > 1e-6) return null;

    return { xz, triangles, chains, areaDeviation };
}

