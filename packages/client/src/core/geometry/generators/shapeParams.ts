// packages/client/src/core/geometry/generators/shapeParams.ts
// ============================================
// 🏗️ ПАРАМЕТРЫ ФОРМ: ГОРОД, МОНАСТЫРЬ, ДОРОГА
// ============================================
// Раньше эти числа были зашиты константами в генераторах
// (CITY_PARAMS, MONASTERY_PARAMS, ROAD_PARAMS). Теперь они — часть
// geometryParams.json и передаются генераторам аргументом.
//
// Границы допустимых значений (SHAPE_PARAM_LIMITS) выбраны так, чтобы форма
// оставалась простой (без самопересечений) на любом тайле набора при любом
// одиночном значении из диапазона; тесты проверяют это на краях диапазонов.
// Они же задают минимумы и максимумы ползунков в песочнице.
//
// Модуль чистый: без зависимостей.
// ============================================

export interface CityShapeParams {
    /** Глубина «шапки» и выреза города, когда у вреза нет дороги (юниты от края тайла) */
    capDepth: number;
    /** Глубина выреза города под тупиковую дорогу (юниты от края тайла) */
    roadArcDepth: number;
    /** Изгиб диагональной границы города между соседними сторонами (юниты) */
    diagBulge: number;
}

export interface MonasteryShapeParams {
    /** Половина стороны монастыря (размер 2×) */
    halfExtent: number;
    /** Радиус скругления углов; не больше halfExtent */
    cornerRadius: number;
}

export interface RoadShapeParams {
    /** Ширина дороги (юниты) */
    width: number;
    /**
     * Радиус поворота дороги (юниты): дуга идёт от (0, R) до (R, 0), а у обоих краёв тайла
     * остаются прямые хвосты длиной 50 − R. Не меньше половины ширины + 15 (см.
     * roadCornerRadiusFloor): при меньшем радиусе внутренний край поворота самопересекается,
     * поэтому значение подтягивается автоматически.
     */
    cornerRadius: number;
    /**
     * Натяжение дуги: вынос контрольных точек в долях радиуса. 0.55 — круговая дуга,
     * меньше — «срезанный» угол, больше — «раздутый». Диапазон 0.45–0.65 безопасен при любой ширине.
     */
    cornerTension: number;
    /**
     * Заход тупиковой дороги ПОД город или монастырь. Дорога всё равно вычитается из их
     * контура, но без захода шум оставляет щель у торца; заход должен перекрывать амплитуду шума.
     */
    endOverlap: number;
}

export interface ShapeParams {
    city: CityShapeParams;
    monastery: MonasteryShapeParams;
    road: RoadShapeParams;
}

export interface ShapeParamsInput {
    city?: Partial<CityShapeParams>;
    monastery?: Partial<MonasteryShapeParams>;
    road?: Partial<RoadShapeParams>;
}

export const DEFAULT_SHAPE_PARAMS: Readonly<ShapeParams> = {
    city: { capDepth: 20, roadArcDepth: 30, diagBulge: 20 },
    monastery: { halfExtent: 20, cornerRadius: 5 },
    road: { width: 20, cornerRadius: 25, cornerTension: 0.6, endOverlap: 14 },
};

/** [минимум, максимум] каждого параметра */
export const SHAPE_PARAM_LIMITS: Readonly<{
    city: Record<keyof CityShapeParams, readonly [number, number]>;
    monastery: Record<keyof MonasteryShapeParams, readonly [number, number]>;
    road: Record<keyof RoadShapeParams, readonly [number, number]>;
}> = {
    city: { capDepth: [5, 45], roadArcDepth: [5, 45], diagBulge: [0, 45] },
    monastery: { halfExtent: [5, 40], cornerRadius: [0, 20] },
    road: { width: [2, 40], cornerRadius: [5, 45], cornerTension: [0.45, 0.65], endOverlap: [0, 30] },
};

/**
 * Наименьший допустимый радиус поворота дороги для данной ширины.
 * Проверено на сетке радиусов, натяжений и ширин: при радиусе ≥ ширина/2 + 15 и натяжении
 * 0.45–0.65 контур поворота остаётся простым, при меньшем радиусе внутренний край самопересекается.
 */
export function roadCornerRadiusFloor(width: number): number {
    return Math.min(SHAPE_PARAM_LIMITS.road.cornerRadius[1], width / 2 + 15);
}

const pick = (value: unknown, fallback: number, [min, max]: readonly [number, number]): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Достраивает частичные параметры значениями по умолчанию и приводит к допустимым диапазонам */
export function resolveShapeParams(input?: ShapeParamsInput): ShapeParams {
    const d = DEFAULT_SHAPE_PARAMS;
    const L = SHAPE_PARAM_LIMITS;

    const halfExtent = pick(input?.monastery?.halfExtent, d.monastery.halfExtent, L.monastery.halfExtent);
    const roadWidth = pick(input?.road?.width, d.road.width, L.road.width);

    return {
        city: {
            capDepth: pick(input?.city?.capDepth, d.city.capDepth, L.city.capDepth),
            roadArcDepth: pick(input?.city?.roadArcDepth, d.city.roadArcDepth, L.city.roadArcDepth),
            diagBulge: pick(input?.city?.diagBulge, d.city.diagBulge, L.city.diagBulge),
        },
        monastery: {
            halfExtent,
            // Скругление не может быть больше половины стороны
            cornerRadius: Math.min(
                halfExtent,
                pick(input?.monastery?.cornerRadius, d.monastery.cornerRadius, L.monastery.cornerRadius)
            ),
        },
        road: {
            width: roadWidth,
            // Радиус не меньше порога для текущей ширины (иначе внутренний край поворота самопересекается)
            cornerRadius: Math.max(
                roadCornerRadiusFloor(roadWidth),
                pick(input?.road?.cornerRadius, d.road.cornerRadius, L.road.cornerRadius)
            ),
            cornerTension: pick(input?.road?.cornerTension, d.road.cornerTension, L.road.cornerTension),
            endOverlap: pick(input?.road?.endOverlap, d.road.endOverlap, L.road.endOverlap),
        },
    };
}
