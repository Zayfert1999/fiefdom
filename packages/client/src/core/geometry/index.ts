// packages/client/src/core/geometry/index.ts
// ============================================
// 📦 ЭКСПОРТ ГЕОМЕТРИЧЕСКИХ МОДУЛЕЙ
// ============================================
// Единая точка импорта для клиентских компонентов:
//   import { processTileGeometry, toPathD } from '@/core/geometry';

export { processTileGeometry, computeTileGeometry } from './geometryProcessor';
export type {
  TileGeometryResult,
  TessellationResult,
  DecorationResult,
  ClippingResult,
  FieldComputationResult,
  AssignmentResult,
} from './geometryProcessor';

export { toPathD, ringToPathD } from './geometryToSvg';

export {
  subtractPolygons,
  subtractOne,
  unionPolygons,
  intersectPolygons,
  TILE_SQUARE,
} from './booleanOps';

export {
  tessellateArea,
  tessellateLine,
  tessellateFeature,
  TESSELLATION,
} from './tessellate';
export type { TessellatedLine } from './tessellate';

export { generatePlazas } from './proceduralGeometry';

export {
  pointInRing,
  pointInPolygon,
  multiPolygonContainsPoint,
} from './geometryPointInPolygon';

// Типы реэкспортируем из shared для удобства
export type {
  Point,
  Ring,
  Polygon,
  MultiPolygon,
  AreaGeometry,
  LineGeometry,
  FeatureGeometry,
} from '@fiefdom/shared/core/geometry.types';