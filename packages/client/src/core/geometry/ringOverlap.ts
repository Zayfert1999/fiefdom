// packages/client/src/core/geometry/ringOverlap.ts
// ============================================
// 🔍 ПЕРЕКРЫВАЮТСЯ ЛИ ДВА КОЛЬЦА
// ============================================
// Быстрая проверка без булевых операций. «Перекрытие» — общая площадь:
// касание по вершине или по общему ребру перекрытием не считается.
// Нужна, чтобы понять, можно ли обойтись без вычитания одного полигона из другого.
// ============================================
import type { Point, Ring } from '@fiefdom/shared/core/geometry.types';
import { pointInRing } from './geometryPointInPolygon';

const orient = (a: Point, b: Point, c: Point): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Рёбра пересекаются «по-настоящему»: пересечение внутри обоих рёбер, не в концах и не вдоль */
function crossProperly(a: Point, b: Point, c: Point, d: Point): boolean {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Точка внутри кольца и дальше `margin` от его границы */
function strictlyInside(p: Point, ring: Ring, margin: number): boolean {
    if (!pointInRing(p, ring)) return false;
    for (let i = 0; i < ring.length; i++) {
        if (distanceToSegment(p, ring[i], ring[(i + 1) % ring.length]) <= margin) return false;
    }
    return true;
}

/**
 * Есть ли у колец общая площадь.
 * @param margin Вершина ближе этого расстояния к границе другого кольца считается лежащей на ней
 */
export function ringsOverlap(a: Ring, b: Ring, margin = 1e-6): boolean {
    for (let i = 0; i < a.length; i++) {
        const a1 = a[i];
        const a2 = a[(i + 1) % a.length];
        for (let j = 0; j < b.length; j++) {
            if (crossProperly(a1, a2, b[j], b[(j + 1) % b.length])) return true;
        }
    }
    // Рёбра не пересекаются: перекрытие возможно, только если одно кольцо лежит внутри другого
    return a.some((p) => strictlyInside(p, b, margin)) || b.some((p) => strictlyInside(p, a, margin));
}

// ============================================
// 📦 ОГРАНИЧИВАЮЩИЕ ПРЯМОУГОЛЬНИКИ
// ============================================
export interface Bounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

export function ringBounds(ring: Ring): Bounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Могут ли кольца иметь общую площадь. Ответ «нет» точный: фигуры с непересекающимися
 * прямоугольниками не пересекаются. Ответ «да» — только «возможно».
 */
export function boundsOverlap(a: Bounds, b: Bounds, pad = 1e-6): boolean {
    return a.minX <= b.maxX + pad && b.minX <= a.maxX + pad && a.minY <= b.maxY + pad && b.minY <= a.maxY + pad;
}
