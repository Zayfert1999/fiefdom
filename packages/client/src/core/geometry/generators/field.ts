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
// 2. assignFieldFeatures: привязка полигонов к фичам по meepleSpot
// ============================================
import type { Point, Polygon, MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import type { TileFeature, Spot } from '@fiefdom/shared/core/types';
import { subtractPolygons, TILE_SQUARE } from '../booleanOps';
import { pointInPolygon } from '../geometryPointInPolygon';

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
// 🔗 ПРИВЯЗКА ПОЛЕЙ К ФИЧАМ (ПО СПОТАМ)
// ============================================
/**
 * Привязывает вычисленные полигоны полей к конкретным фичам типа 'field'.
 * Использует meepleSpot фичи для определения, какому полигону она принадлежит.
 * 
 * @param features Все фичи тайла
 * @param fieldPolygons Вычисленные полигоны полей
 * @returns Map<featureId, MultiPolygon>
 */
export function assignFieldFeatures(
    features: readonly TileFeature[],
    fieldPolygons: MultiPolygon
): Map<string, MultiPolygon> {
    const fieldGeometries = new Map<string, MultiPolygon>();
    const used = new Set<number>();

    const fieldFeatures = features.filter(
        f => f.type === 'field' && f.geometry?.kind === 'derived'
    );

    if (fieldFeatures.length === 0 || fieldPolygons.length === 0) {
        console.log(
            `🔗 [FieldGenerator] Пропуск привязки: ` +
            `${fieldFeatures.length} полей, ${fieldPolygons.length} полигонов`
        );
        return fieldGeometries;
    }

    console.log(
        `🔗 [FieldGenerator] Привязка ${fieldFeatures.length} полей к ` +
        `${fieldPolygons.length} полигонам`
    );

    for (const field of fieldFeatures) {
        // Поддержка обоих форматов спота (массив или объект)
        const rawSpot = field.meepleSpot;
        const spot: Spot = Array.isArray(rawSpot) ? rawSpot[0] : rawSpot;
        const spotPoint: Point = [spot.x, spot.y];

        let assigned = false;

        for (let i = 0; i < fieldPolygons.length; i++) {
            if (used.has(i)) continue;

            if (pointInPolygon(spotPoint, fieldPolygons[i])) {
                fieldGeometries.set(field.id, [fieldPolygons[i]]);
                used.add(i);
                assigned = true;
                console.log(
                    `🔗 [FieldGenerator] Поле "${field.id}" → полигон #${i} ` +
                    `(spot: ${spot.x}, ${spot.y})`
                );
                break;
            }
        }

        if (!assigned) {
            console.warn(
                `⚠️ [FieldGenerator] Не найден полигон для поля "${field.id}" ` +
                `(spot: ${spot.x}, ${spot.y}). Проверьте геометрию.`
            );
        }
    }

    const unusedCount = fieldPolygons.length - used.size;
    if (unusedCount > 0) {
        console.warn(
            `⚠️ [FieldGenerator] Осталось нераспределённых полигонов: ${unusedCount}`
        );
    }

    return fieldGeometries;
}