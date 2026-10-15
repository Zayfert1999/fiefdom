// packages/client/src/core/geometry/index.ts
// ============================================
// 📦 ЭКСПОРТ ГЕОМЕТРИЧЕСКИХ МОДУЛЕЙ
// ============================================
export { processTileGeometry, computeTileGeometry } from './geometryProcessor';
export type { ProcessOptions } from './geometryProcessor';

// 🌟 Типы из нового файла
export type {
    TileGeometryResult,
    TessellationResult,
    DecorationResult,
    ClippingResult,
    FieldComputationResult,
    AssignmentResult,
} from './types';

export { toPathD, ringToPathD } from './geometryToSvg';
export {
    subtractPolygons, subtractOne, unionPolygons, intersectPolygons, TILE_SQUARE,
} from './booleanOps';
export {
    tessellateArea, tessellateLine, tessellateFeature, TESSELLATION,
} from './tessellate';
export type { TessellatedLine } from './tessellate';
export {
    pointInRing, pointInPolygon, multiPolygonContainsPoint,
} from './geometryPointInPolygon';

// 🌊 Шум Перлина
export { createNoise2D, createFBM } from './generators/perlin';
export type { Noise2D } from './generators/perlin';

// 🔧 Пост-процессор
export { applyGeometryNoise, NOISE_PARAMS } from './geometryPostProcessor';
export type { NoiseOptions } from './geometryPostProcessor';

// Генераторы
export {
    withGeneratedGeometry,
    generateFeatureGeometries,
    CITY_PARAMS,
    ROAD_PARAMS,
    MONASTERY_PARAMS,
    generatePlazas,
    computeFieldPolygons,
    assignFieldFeatures,
} from './generators';
export type { GenerateOptions, GeneratedGeometries } from './generators';

// Типы из shared
export type {
    Point, Ring, Polygon, MultiPolygon,
    AreaGeometry, LineGeometry, FeatureGeometry,
} from '@fiefdom/shared/core/geometry.types';