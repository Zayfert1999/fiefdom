// packages/client/src/core/geometry/generators/index.ts
// ============================================
// 🧩 ГЕНЕРАЦИЯ ГЕОМЕТРИИ ГОРОДОВ, ДОРОГ, МОНАСТЫРЕЙ, ПЛОЩАДЕЙ И ПОЛЕЙ
// ============================================
import type {
  AreaGeometry,
  LineGeometry,
} from '@fiefdom/shared/core/geometry.types';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { createSeededRandom } from '@fiefdom/shared/prng/seedRandom';
import { generateCity } from './city';
import { generateRoad, ROAD_PARAMS } from './road';
import { generateMonastery, MONASTERY_PARAMS } from './monastery';
import { buildContext, type RngFactory, type Side } from './sides';

// ============================================
// 📤 ЭКСПОРТЫ ГЕНЕРАТОРОВ И ПАРАМЕТРОВ
// ============================================
export { CITY_PARAMS } from './city';
export { ROAD_PARAMS } from './road';
export { MONASTERY_PARAMS } from './monastery';

// 🌟 ЭКСПОРТЫ ГЕНЕРАТОРОВ ДЕКОРАЦИЙ И ПОЛЕЙ
export { generatePlazas } from './plaza';
export { computeFieldPolygons, assignFieldFeatures } from './field';

// ============================================
// ⚙️ ОПЦИИ И РЕЗУЛЬТАТЫ
// ============================================
export interface GenerateOptions {
  readonly seed: string;
  readonly jitter?: number;
  readonly overwrite?: boolean;
  readonly roadWidth?: number;
}

export interface GeneratedGeometries {
  readonly geometries: ReadonlyMap<string, AreaGeometry | LineGeometry>;
  readonly warnings: readonly string[];
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 🌟 Нужна ли фиче сгенерированная геометрия */
const needsGeometry = (f: TileFeature, overwrite: boolean): boolean =>
  (f.type === 'city' || f.type === 'road' || f.type === 'monastery') &&
  (overwrite || !f.geometry || f.geometry.kind === 'derived');

/** Генерирует геометрию городов, дорог и монастырей. Порядок: города → дороги → монастыри. */
export function generateFeatureGeometries(
  features: readonly TileFeature[],
  options: GenerateOptions,
): GeneratedGeometries {
  const amp = clamp01(options.jitter ?? 1);
  const overwrite = options.overwrite ?? false;
  const width = options.roadWidth ?? ROAD_PARAMS.width;
  const ctx = buildContext(features);

  const geometries = new Map<string, AreaGeometry | LineGeometry>();
  const warnings: string[] = [];
  const arcDepth = new Map<Side, number>();

  const rngFor = (f: TileFeature): RngFactory =>
    () => createSeededRandom(`${options.seed}|${f.id}`);

  // 1. Города
  for (const f of features) {
    if (f.type !== 'city' || !needsGeometry(f, overwrite)) continue;

    const res = generateCity(f, ctx, rngFor(f), amp);
    if (!res) {
      warnings.push(`city "${f.id}": неподдерживаемые порты [${f.ports.join(', ')}]`);
      continue;
    }
    if (res.fallback) {
      warnings.push(`city "${f.id}": метки вне контура, использована эталонная форма`);
    }

    geometries.set(f.id, res.geometry);
    for (const [side, depth] of res.arcDepth) {
      arcDepth.set(side, depth);
    }
  }

  // 2. Дороги
  for (const f of features) {
    if (f.type !== 'road' || !needsGeometry(f, overwrite)) continue;

    const res = generateRoad(f, ctx, rngFor(f), amp, width, arcDepth);
    if (!res) {
      warnings.push(`road "${f.id}": неподдерживаемые порты [${f.ports.join(', ')}]`);
      continue;
    }
    if (res.fallback) {
      warnings.push(`road "${f.id}": метка мипла вне дороги, использована эталонная форма`);
    }

    geometries.set(f.id, res.geometry);
  }

  // 3. 🌟 Монастыри (без рандомизации)
  for (const f of features) {
    if (f.type !== 'monastery' || !needsGeometry(f, overwrite)) continue;

    const res = generateMonastery(f);
    if (!res) {
      warnings.push(`monastery "${f.id}": ошибка генерации`);
      continue;
    }

    geometries.set(f.id, res.geometry);
    console.log(
      `⛪ [Generator] Монастырь "${f.id}": ` +
      `размер=${res.halfExtent * 2}×${res.halfExtent * 2}`
    );
  }

  return { geometries, warnings };
}

/**
 * Возвращает копию списка фич, где у городов, дорог и монастырей
 * без геометрии она сгенерирована.
 */
export function withGeneratedGeometry(
  features: readonly TileFeature[],
  options: GenerateOptions,
  onWarning?: (message: string) => void,
): TileFeature[] {
  const { geometries, warnings } = generateFeatureGeometries(features, options);
  if (onWarning) warnings.forEach(onWarning);
  return features.map(f => {
    const geometry = geometries.get(f.id);
    return geometry ? { ...f, geometry } : f;
  });
}