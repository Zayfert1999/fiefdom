// packages/shared/src/core/tessellate.ts
// ============================================
// 📐 ТЕССЕЛЯЦИЯ КРИВЫХ В ПОЛИЛИНИИ
// ============================================
// Единый модуль преобразования геометрии в дискретные точки.
// Используется:
//   • fieldGeometry.ts — для булевых операций
//   • рендерер — для <polygon points=...>
//   • песочница — для отладки осевой линии
// ============================================
import type {
    Point,
    AreaGeometry,
    LineGeometry,
    OutlineSegment,
    PathSegment,
} from './geometry.types';

/** Количество сегментов на одну кривую Безье */
export const TESSELLATION = 8;

// ============================================
// 📐 ПРИВАТНЫЕ ХЕЛПЕРЫ: точка на кривой
// ============================================

/** Точка на квадратичной Безье при параметре t ∈ [0, 1] */
const quadAt = (p0: Point, cp: Point, p1: Point, t: number): Point => {
    const mt = 1 - t;
    return [
        mt * mt * p0[0] + 2 * mt * t * cp[0] + t * t * p1[0],
        mt * mt * p0[1] + 2 * mt * t * cp[1] + t * t * p1[1],
    ];
};

/** Точка на кубической Безье при параметре t ∈ [0, 1] */
const cubicAt = (p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point => {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return [
        mt2 * mt * p0[0] + 3 * mt2 * t * c1[0] + 3 * mt * t2 * c2[0] + t2 * t * p1[0],
        mt2 * mt * p0[1] + 3 * mt2 * t * c1[1] + 3 * mt * t2 * c2[1] + t2 * t * p1[1],
    ];
};

// ============================================
// 🧩 ОБЩИЙ ИТЕРАТОР ПО СЕГМЕНТАМ
// ============================================

/**
 * Развёртывает массив сегментов в плоский массив точек.
 * Кривые Безье заменяются на TESSELLATION промежуточных точек.
 * @param segments Массив сегментов (outline или path)
 * @param start    Начальная точка
 * @returns Массив точек (включая start)
 */
function tessellateSegments(
    segments: readonly (OutlineSegment | PathSegment)[],
    start: Point
): Point[] {
    const points: Point[] = [start];
    let current = start;

    for (const seg of segments) {
        switch (seg.type) {
            case 'line':
                points.push(seg.to);
                current = seg.to;
                break;
            case 'quadratic':
                for (let i = 1; i <= TESSELLATION; i++) {
                    points.push(quadAt(current, seg.cp, seg.to, i / TESSELLATION));
                }
                current = seg.to;
                break;
            case 'bezier':
                for (let i = 1; i <= TESSELLATION; i++) {
                    points.push(cubicAt(current, seg.cp1, seg.cp2, seg.to, i / TESSELLATION));
                }
                current = seg.to;
                break;
            case 'close':
                // Замыкание не добавляет точку — polygon замкнётся автоматически
                break;
            case 'arc':
                // TODO: тесселяция дуги (пока не используется в base.json)
                points.push(seg.to);
                current = seg.to;
                break;
        }
    }

    return points;
}

// ============================================
// 🏛️ AREA: замкнутая область → полигон
// ============================================

/**
 * Преобразует `AreaGeometry` в плоский массив точек.
 * Полученный полигон автоматически замкнут (первая = последняя точка не нужна).
 */
export function tessellateArea(geo: AreaGeometry): Point[] {
    return tessellateSegments(geo.outline, geo.start);
}

// ============================================
// 🛤️ LINE: путь → три полилинии (лево/право/центр)
// ============================================

/** Результат тесселяции дороги */
export interface TessellatedLine {
    /** Центральная осевая линия (для отладки) */
    center: Point[];
    /** Левый контур (смещён на +lineWidth/2 по нормали) */
    left: Point[];
    /** Правый контур (смещён на -lineWidth/2 по нормали) */
    right: Point[];
}

/**
 * Преобразует `LineGeometry` в три полилинии.
 * Используется и для рендеринга (left+right → полигон дороги),
 * и для отладки (center → пунктирная осевая).
 */
export function tessellateLine(geo: LineGeometry): TessellatedLine {
    // 1. Центральная осевая (чистая тесселяция пути)
    const center = tessellateSegments(geo.path, geo.start);

    // 2. Смещённые контуры (лево/право от направления)
    const halfWidth = geo.lineWidth / 2;
    const left: Point[] = [];
    const right: Point[] = [];

    for (let i = 0; i < center.length; i++) {
        // Берём соседние точки для вычисления касательной
        const prev = center[Math.max(0, i - 1)];
        const next = center[Math.min(center.length - 1, i + 1)];
        const curr = center[i];

        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.sqrt(dx * dx + dy * dy);

        // Дегенеративный случай: две совпадающие точки
        if (len === 0) {
            left.push(curr);
            right.push(curr);
            continue;
        }

        // Нормаль (перпендикуляр к касательной)
        const nx = -dy / len;
        const ny = dx / len;

        left.push([curr[0] + nx * halfWidth, curr[1] + ny * halfWidth]);
        right.push([curr[0] - nx * halfWidth, curr[1] - ny * halfWidth]);
    }

    return { center, left, right };
}

// ============================================
// 🏗️ УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ ЛЮБОЙ ФИЧИ
// ============================================

/**
 * Тесселирует любую фичу в полигон (замкнутый контур).
 * Для `area` — возвращает outline.
 * Для `line` — возвращает left + reverse(right).
 * Для `derived` — возвращает null (вычисляется отдельно).
 */
export function tessellateFeature(
    geometry: AreaGeometry | LineGeometry
): Point[] {
    if (geometry.kind === 'area') {
        return tessellateArea(geometry);
    }

    // kind === 'line'
    const { left, right } = tessellateLine(geometry);
    // Замкнутый полигон: левая сторона вперёд + правая назад
    const reversedRight = [...right].reverse();
    return [...left, ...reversedRight];
}