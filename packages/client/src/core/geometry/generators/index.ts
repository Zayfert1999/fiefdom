// packages/client/src/core/geometry/generators/index.ts
// ============================================
// 🧩 ГЕНЕРАЦИЯ ГЕОМЕТРИИ ИЗ ПОРТОВ
// ============================================
// Генераторы производят ЧИСТЫЕ формы.
// Органическая неровность добавляется пост-процессором
// шума Перлина в geometryProcessor.
//
// 🌟 ИЗМЕНЕНО:
//   • Убраны seed и jitter из GenerateOptions
//   • Убран переключатель `overwrite`: геометрия городов, дорог и монастырей
//     ВСЕГДА генерируется из портов. Нарисованная вручную `feature.geometry`
//     в данных была устаревшим снимком старого генератора (после правок
//     генератора она расходилась с ним: дороги без захода под город, монастырь
//     без скруглений) и давала артефакты. Она остаётся только запасным вариантом:
//     если генератор не смог построить форму (неподдерживаемые порты), фича
//     сохраняет то, что в ней нарисовано.
// ============================================
import type {
    AreaGeometry,
    LineGeometry,
} from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { generateCity } from './city';
import { generateRoad, ROAD_PARAMS } from './road';
import { generateMonastery } from './monastery';
import { buildContext, type Side } from './sides';

// ============================================
// 📤 ЭКСПОРТЫ
// ============================================
export { CITY_PARAMS } from './city';
export { ROAD_PARAMS } from './road';
export { MONASTERY_PARAMS } from './monastery';
export { generatePlazas, DEFAULT_PLAZA_PARAMS, resolvePlazaParams } from './plaza';
export type { PlazaParams } from './plaza';
export { computeFieldPolygons, assignFieldFeatures } from './field';

// ============================================
// ⚙️ ОПЦИИ (БЕЗ seed и jitter)
// ============================================
export interface GenerateOptions {
    /** Заход тупиковых дорог под город/монастырь (юниты). Должен перекрывать амплитуду шума на их контуре */
    readonly roadEndOverlap?: number;
    /** Ширина дорог. По умолчанию 20 */
    readonly roadWidth?: number;
}

export interface GeneratedGeometries {
    readonly geometries: ReadonlyMap<string, AreaGeometry | LineGeometry>;
    readonly warnings: readonly string[];
}

// ============================================
// 🛠️ ХЕЛПЕРЫ
// ============================================

/** Какие фичи получают сгенерированную форму (поля вычисляются отдельно, как остаток) */
const needsGeometry = (f: TileFeature): boolean =>
    f.type === 'city' || f.type === 'road' || f.type === 'monastery';

// ============================================
// 📤 ГЕНЕРАЦИЯ
// ============================================
export function generateFeatureGeometries(
    features: readonly TileFeature[],
    options: GenerateOptions = {},
): GeneratedGeometries {
    const width = options.roadWidth ?? ROAD_PARAMS.width;
    const ctx = buildContext(features);

    const geometries = new Map<string, AreaGeometry | LineGeometry>();
    const warnings: string[] = [];
    const arcDepth = new Map<Side, number>();

    // 1. Города
    for (const f of features) {
        if (f.type !== 'city' || !needsGeometry(f)) continue;
        const res = generateCity(f, ctx);
        if (!res) {
            warnings.push(`city "${f.id}": неподдерживаемые порты [${f.ports.join(', ')}]`);
            continue;
        }
        geometries.set(f.id, res.geometry);
        for (const [side, depth] of res.arcDepth) arcDepth.set(side, depth);
    }

    // 2. Дороги
    for (const f of features) {
        if (f.type !== 'road' || !needsGeometry(f)) continue;
        const res = generateRoad(f, ctx, width, arcDepth, options.roadEndOverlap);
        if (!res) {
            warnings.push(`road "${f.id}": неподдерживаемые порты [${f.ports.join(', ')}]`);
            continue;
        }
        geometries.set(f.id, res.geometry);
    }

    // 3. Монастыри
    for (const f of features) {
        if (f.type !== 'monastery' || !needsGeometry(f)) continue;
        const res = generateMonastery(f);
        if (!res) {
            warnings.push(`monastery "${f.id}": ошибка генерации`);
            continue;
        }
        geometries.set(f.id, res.geometry);
        console.log(`⛪ [Generator] Монастырь "${f.id}": ${res.halfExtent * 2}×${res.halfExtent * 2}`);
    }

    return { geometries, warnings };
}

/**
 * Возвращает копию фич с сгенерированной геометрией.
 */
export function withGeneratedGeometry(
    features: readonly TileFeature[],
    options: GenerateOptions = {},
    onWarning?: (message: string) => void,
): TileFeature[] {
    const { geometries, warnings } = generateFeatureGeometries(features, options);
    if (onWarning) warnings.forEach(onWarning);
    return features.map(f => {
        const geometry = geometries.get(f.id);
        return geometry ? { ...f, geometry } : f;
    });
}