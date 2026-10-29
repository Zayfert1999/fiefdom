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
    TESSELLATION_CONFIG, DEFAULT_TESSELLATION_PARAMS,
    resolveTessellationParams, computeLineNormals,
} from './tessellate';
export type { TessellatedLine, TessellationParams } from './tessellate';
export {
    pointInRing, pointInPolygon, multiPolygonContainsPoint,
} from './geometryPointInPolygon';

// 🌊 Шум Перлина
export { createNoise2D, createFBM } from './generators/perlin';
export type { Noise2D } from './generators/perlin';

// 🔧 Пост-процессор
export {
    applyGeometryNoise, NOISE_PARAMS, resolveNoiseSettings, measureOutOfTile,
} from './geometryPostProcessor';
export type {
    NoiseOptions, NoiseSettings, EdgeFadeCurve, NoiseByType, NoiseFeatureType,
} from './geometryPostProcessor';

// 📍 Споты мипла и щита (вычисляются из геометрии)
export {
    DEFAULT_SPOT_PARAMS,
    resolveSpotParams,
    computeTileSpots,
    poleOfInaccessibility,
    bestPole,
    maximizeDistance,
    signedDistanceToPolygon,
} from './spots';
export type { SpotParams, FeatureSpot, SpotMethod, PoleResult } from './spots';

// 🎛 Единый набор параметров (geometryParams.json)
export {
    GEOMETRY_PARAMS_VERSION,
    DEFAULT_GEOMETRY_PARAMS,
    NOISE_FEATURE_TYPES,
    resolveGeometryParams,
    parseGeometryParams,
    serializeGeometryParams,
    hashGeometryParams,
    resolveTileParams,
    cloneGeometryParams,
} from './geometryParams';
export type {
    GeometryParams,
    GeometryParamsInput,
    GenerationParams,
    TileParamOverride,
    ResolvedTileParams,
    ParseGeometryParamsResult,
} from './geometryParams';

// Генераторы
export {
    withGeneratedGeometry,
    generateFeatureGeometries,
    CITY_PARAMS,
    ROAD_PARAMS,
    MONASTERY_PARAMS,
    generatePlazas,
    DEFAULT_PLAZA_PARAMS,
    resolvePlazaParams,
    computeFieldPolygons,
    assignFieldFeatures,
} from './generators';
export type { GenerateOptions, GeneratedGeometries, PlazaParams } from './generators';

// Типы из shared
export type {
    Point, Ring, Polygon, MultiPolygon,
    AreaGeometry, LineGeometry, FeatureGeometry,
} from '@fiefdom/shared/core/geometry.types';