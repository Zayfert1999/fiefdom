// packages/client/src/core/geometry/generators/field.ts
// ============================================
// 🌾 ГЕНЕРАЦИЯ И ПРИВЯЗКА ПОЛЕЙ
// ============================================
// Поля не имеют явной геометрии в base.json.
// Они вычисляются как "остаток" тайла после вычитания всех остальных фич
// (городов, дорог, площадей).
//
// Пайплайн:
// 1. computeFieldPolygons: TILE_SQUARE - obstacles = поля
// 2. assignFieldFeatures: привязка полигонов к фичам
//    • ОСНОВНОЙ способ — по ПОРТАМ: поле владеет полигоном, который касается
//      границы тайла там, где лежат порты поля. Не зависит от meepleSpot,
//      поэтому споты можно считать автоматически (spots.ts), а не рисовать вручную.
//    • ЗАПАСНОЙ способ — по meepleSpot (для полей без совпавших портов).
// ============================================
import type { Point, Polygon, MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import type { TileFeature, Spot } from '@fiefdom/shared/core/types';
import { subtractPolygons, TILE_SQUARE } from '../booleanOps';
import { pointInPolygon } from '../geometryPointInPolygon';
import { getPortPoint } from './sides';

// ============================================
// 🧮 ВЫЧИСЛЕНИЕ ПОЛИГОНОВ ПОЛЕЙ
// ============================================
/**
 * Вычисляет геометрию полей как остаток от квадрата тайла
 * после вычитания всех препятствий (городов, дорог, площадей).
 * 
 * @param obstacles Массив полигонов всех непроходимых фич
 * @returns MultiPolygon оставшихся полей
 */
export function computeFieldPolygons(obstacles: Polygon[]): MultiPolygon {
    const tileMultiPolygon: MultiPolygon = [[TILE_SQUARE]];
    
    if (obstacles.length === 0) {
        console.log(`🌾 [FieldGenerator] Нет препятствий, всё поле — одно целое`);
        return tileMultiPolygon;
    }

    const fieldPolygons = subtractPolygons(tileMultiPolygon, obstacles);
    
    console.log(
        `🌾 [FieldGenerator] Вычислены поля: ` +
        `вычтено ${obstacles.length} препятствий, ` +
        `осталось ${fieldPolygons.length} полигон(ов)`
    );
    
    return fieldPolygons;
}

// ============================================
// 🔗 ПРИВЯЗКА ПОЛЕЙ К ФИЧАМ
// ============================================

/** Как поле нашло свой полигон */
export type FieldBindingMethod = 'ports' | 'spot';

export interface FieldAssignment {
    readonly fieldGeometries: Map<string, MultiPolygon>;
    /** Способ привязки каждого поля (нет записи — поле не привязано) */
    readonly methods: Map<string, FieldBindingMethod>;
}

/** Насколько близко граница полигона должна подойти к точке порта (юниты) */
export const PORT_TOUCH_EPS = 0.75;

/** Расстояние от точки до ближайшего ребра полигона (всех его колец) */
function distanceToPolygonEdges(p: Point, polygon: Polygon): number {
    let min = Infinity;
    for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const lengthSq = dx * dx + dy * dy;
            const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
            min = Math.min(min, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
        }
    }
    return min;
}

/**
 * Привязывает вычисленные полигоны полей к фичам типа 'field'.
 *
 * Шаг 1 (порты): полигон принадлежит полю, если его граница проходит
 *   через точку одного из портов поля на границе тайла. Полю достаются все
 *   такие полигоны (поле может оказаться разрезанным на части).
 * Шаг 2 (споты): для полей, не нашедших полигон по портам, —
 *   прежний способ по meepleSpot.
 */
export function assignFieldFeaturesDetailed(
    features: readonly TileFeature[],
    fieldPolygons: MultiPolygon
): FieldAssignment {
    const fieldGeometries = new Map<string, MultiPolygon>();
    const methods = new Map<string, FieldBindingMethod>();
    const used = new Set<number>();

    const fieldFeatures = features.filter(
        f => f.type === 'field' && f.geometry?.kind === 'derived'
    );

    if (fieldFeatures.length === 0 || fieldPolygons.length === 0) {
        console.log(
            `🔗 [FieldGenerator] Пропуск привязки: ` +
            `${fieldFeatures.length} полей, ${fieldPolygons.length} полигонов`
        );
        return { fieldGeometries, methods };
    }

    console.log(
        `🔗 [FieldGenerator] Привязка ${fieldFeatures.length} полей к ` +
        `${fieldPolygons.length} полигонам`
    );

    // --- Шаг 1: по портам ---
    for (const field of fieldFeatures) {
        const matched: number[] = [];
        for (const port of field.ports) {
            const point = getPortPoint(port);
            fieldPolygons.forEach((polygon, i) => {
                if (matched.includes(i) || used.has(i)) return;
                if (distanceToPolygonEdges(point, polygon) <= PORT_TOUCH_EPS) matched.push(i);
            });
        }
        if (matched.length === 0) continue;

        fieldGeometries.set(field.id, matched.map(i => fieldPolygons[i]));
        methods.set(field.id, 'ports');
        matched.forEach(i => used.add(i));
        console.log(
            `🔗 [FieldGenerator] Поле "${field.id}" → полигоны #${matched.join(', #')} (по портам ${field.ports.join(',')})`
        );
    }

    // --- Шаг 2: запасной вариант по спотам ---
    for (const field of fieldFeatures) {
        if (fieldGeometries.has(field.id)) continue;

        // Поддержка обоих форматов спота (массив или объект)
        const rawSpot = field.meepleSpot;
        const spot: Spot | undefined = Array.isArray(rawSpot) ? rawSpot[0] : rawSpot;
        const spotPoint: Point | null = spot ? [spot.x, spot.y] : null;

        let assigned = false;
        if (spotPoint) {
            for (let i = 0; i < fieldPolygons.length; i++) {
                if (used.has(i)) continue;
                if (pointInPolygon(spotPoint, fieldPolygons[i])) {
                    fieldGeometries.set(field.id, [fieldPolygons[i]]);
                    methods.set(field.id, 'spot');
                    used.add(i);
                    assigned = true;
                    console.log(
                        `🔗 [FieldGenerator] Поле "${field.id}" → полигон #${i} ` +
                        `(запасной способ, spot: ${spot!.x}, ${spot!.y})`
                    );
                    break;
                }
            }
        }

        if (!assigned) {
            console.warn(
                `⚠️ [FieldGenerator] Не найден полигон для поля "${field.id}" ` +
                `(порты: ${field.ports.join(',')}). Проверьте геометрию.`
            );
        }
    }

    const unusedCount = fieldPolygons.length - used.size;
    if (unusedCount > 0) {
        console.warn(
            `⚠️ [FieldGenerator] Осталось нераспределённых полигонов: ${unusedCount}`
        );
    }

    return { fieldGeometries, methods };
}

/** Привязка полей; тот же результат, что у assignFieldFeaturesDetailed, без способов привязки */
export function assignFieldFeatures(
    features: readonly TileFeature[],
    fieldPolygons: MultiPolygon
): Map<string, MultiPolygon> {
    return assignFieldFeaturesDetailed(features, fieldPolygons).fieldGeometries;
}
