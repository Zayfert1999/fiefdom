// packages/client/src/core/geometry/terrain.ts
// ============================================
// ⛰️ РЕЛЬЕФ ПОЛЕЙ: ФУНКЦИЯ ВЫСОТЫ В МИРОВЫХ КООРДИНАТАХ
// ============================================
// Чистый модуль (без three, React и DOM). Отвечает на вопрос:
// «насколько поверхность поля поднята в точке доски (x, z)?».
//
// 🌟 ОДИН ШУМ НА ВСЮ ДОСКУ
//   Высота — fBm на perlin.ts от МИРОВЫХ координат с единым seed доски. Поэтому
//   рельеф непрерывен через границы тайлов, не зависит от поворота тайла и одинаков
//   у всех регионов — ландшафт выглядит однородным. Никаких «швов» и специальных
//   профилей края тайла больше нет: поля соседних тайлов собираются в общий меш
//   региона (fieldRegions.ts), а шум просто считается в мировых координатах.
//
// 🎚 ЭЛЕВАЦИЯ — безразмерная величина 0..1. Высота в юнитах:
//    offset = amplitude · elevation · featureFactor(расстояние до дороги/города)
// ============================================
import { createFBM, createNoise2D } from './generators/perlin';

// ============================================
// ⚙️ ПАРАМЕТРЫ
// ============================================

export interface TerrainParams {
    /** Рельеф включён (выключен — поля плоские, как раньше) */
    enabled: boolean;
    /** Seed шума: один на доску. Другой seed — другой ландшафт */
    seed: string;
    /** Максимальный подъём поля над плоским уровнем (юниты) */
    amplitude: number;
    /** Частота шума (1/юнит): 0.03 ≈ три холма на тайл */
    frequency: number;
    octaves: number;
    lacunarity: number;
    gain: number;
    /** Степень кривой высоты: >1 — плоские низины и острые вершины, <1 — плато */
    contrast: number;
    /** Расстояние от рёбер дорог и городов, на котором рельеф затухает до 0 (юниты) */
    featureFade: number;
    /** Шаг сетки верха поля (юниты): рёбра треугольников ≈ этой длины. Меньше — детальнее и тяжелее */
    gridStep: number;
    /** Лимит вершин верха на площадь одного тайла (для региона из N тайлов лимит растёт в N раз) */
    maxVertices: number;
    /** Осветление вершин на возвышенностях (0 — без подсветки рельефа цветом) */
    heightTint: number;
}

export const DEFAULT_TERRAIN_PARAMS: Readonly<TerrainParams> = {
    enabled: true,
    seed: 'fiefdom',
    amplitude: 5,
    frequency: 0.03,
    octaves: 2,
    lacunarity: 2,
    gain: 0.5,
    contrast: 1.2,
    featureFade: 8,
    gridStep: 3.5,
    maxVertices: 6000,
    heightTint: 0.3,
};

const finite = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function resolveTerrainParams(partial?: Partial<TerrainParams>): TerrainParams {
    const d = DEFAULT_TERRAIN_PARAMS;
    const seed = typeof partial?.seed === 'string' ? partial.seed.trim() : '';

    return {
        enabled: typeof partial?.enabled === 'boolean' ? partial.enabled : d.enabled,
        seed: seed || d.seed,
        amplitude: clamp(finite(partial?.amplitude, d.amplitude), 0, 40),
        frequency: clamp(finite(partial?.frequency, d.frequency), 0.002, 0.3),
        octaves: Math.round(clamp(finite(partial?.octaves, d.octaves), 1, 6)),
        lacunarity: clamp(finite(partial?.lacunarity, d.lacunarity), 1, 4),
        gain: clamp(finite(partial?.gain, d.gain), 0.1, 0.9),
        contrast: clamp(finite(partial?.contrast, d.contrast), 0.3, 4),
        featureFade: clamp(finite(partial?.featureFade, d.featureFade), 0, 30),
        gridStep: clamp(finite(partial?.gridStep, d.gridStep), 1.5, 25),
        maxVertices: Math.round(clamp(finite(partial?.maxVertices, d.maxVertices), 500, 30000)),
        heightTint: clamp(finite(partial?.heightTint, d.heightTint), 0, 1),
    };
}

// ============================================
// 🌊 ПОЛЕ ВЫСОТЫ
// ============================================

const smoothstep = (t: number): number => {
    const c = clamp(t, 0, 1);
    return c * c * (3 - 2 * c);
};

/** Шум Перлина ≈ [−0.7, 0.7] → [0, 1] */
const noiseTo01 = (n: number): number => clamp(0.5 + n * 0.7, 0, 1);

export interface TerrainField {
    /** Относительная высота 0..1 в точке доски (мировые координаты), без учёта дорог и городов */
    elevation(x: number, z: number): number;
}

/** Множитель 0..1 по расстоянию до ближайшего ребра дороги/города/площади */
export function featureFactor(distance: number, fade: number): number {
    return fade <= 0 ? 1 : smoothstep(distance / fade);
}

/** Создаёт поле высоты доски: чистая функция мировых координат */
export function createTerrainField(params: TerrainParams): TerrainField {
    const base = createFBM(createNoise2D(params.seed), params.octaves, params.lacunarity, params.gain);
    return {
        elevation(x: number, z: number): number {
            const v = noiseTo01(base(x * params.frequency, z * params.frequency));
            return Math.pow(v, params.contrast);
        },
    };
}
