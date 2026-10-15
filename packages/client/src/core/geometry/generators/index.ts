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
//   • needsGeometry включает monastery
//   • Убраны импорты RngFactory и createSeededRandom
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
export { generatePlazas } from './plaza';
export { computeFieldPolygons, assignFieldFeatures } from './field';

// ============================================
// ⚙️ ОПЦИИ (БЕЗ seed и jitter)
// ============================================
export interface GenerateOptions {
    /** Перегенерировать фичи с уже нарисованной геометрией */
    readonly overwrite?: boolean;
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

/**
 * 🌟 ИСПРАВЛЕНО: добавлен 'monastery'.
 * Раньше монастыри не проходили проверку.
 */
const needsGeometry = (f: TileFeature, overwrite: boolean): boolean =>
    (f.type === 'city' || f.type === 'road' || f.type === 'monastery') &&
    (overwrite || !f.geometry || f.geometry.kind === 'derived');

// ============================================
// 📤 ГЕНЕРАЦИЯ
// ============================================
export function generateFeatureGeometries(
    features: readonly TileFeature[],
    options: GenerateOptions = {},
): GeneratedGeometries {
    const overwrite = options.overwrite ?? false;
    const width = options.roadWidth ?? ROAD_PARAMS.width;
    const ctx = buildContext(features);

    const geometries = new Map<string, AreaGeometry | LineGeometry>();
    const warnings: string[] = [];
    const arcDepth = new Map<Side, number>();

    // 1. Города
    for (const f of features) {
        if (f.type !== 'city' || !needsGeometry(f, overwrite)) continue;
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
        if (f.type !== 'road' || !needsGeometry(f, overwrite)) continue;
        const res = generateRoad(f, ctx, width, arcDepth);
        if (!res) {
            warnings.push(`road "${f.id}": неподдерживаемые порты [${f.ports.join(', ')}]`);
            continue;
        }
        geometries.set(f.id, res.geometry);
    }

    // 3. Монастыри
    for (const f of features) {
        if (f.type !== 'monastery' || !needsGeometry(f, overwrite)) continue;
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