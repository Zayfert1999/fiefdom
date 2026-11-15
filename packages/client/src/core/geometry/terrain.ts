// packages/client/src/core/geometry/terrain.ts
// ============================================
// ⛰️ РЕЛЬЕФ ПОЛЕЙ: ФУНКЦИЯ ВЫСОТЫ
// ============================================
// Чистый модуль (без three, React и DOM). Отвечает на один вопрос:
// «насколько поверхность поля поднята в точке (x, y) тайла?».
//
// 🌟 ИСТОЧНИК ВЫСОТЫ
//   fBm на perlin.ts, seed = seed тайла (artId или закреплённый seed) —
//   рельеф детерминирован и одинаков у всех экземпляров тайла.
//
// 🧩 СОГЛАСОВАНИЕ С СОСЕДЯМИ (рельеф считается внутри тайла, а тайлы
//    ставятся рядом в любой ориентации, поэтому стык надо обеспечить явно)
//   • edgeMode 'flat'   — у границы тайла рельеф плавно сходит в 0
//   • edgeMode 'shared' — у границы рельеф стягивается к ОБЩЕМУ профилю
//                         g(|t|), который не зависит от тайла, seed и
//                         поворота: оба соседа дают на стыке одну высоту
//
// 🎚 ЭЛЕВАЦИЯ — безразмерная величина 0..1. Высота в юнитах:
//    offset = amplitude · elevation · featureFactor(расстояние до дороги/города)
// ============================================
import { createFBM, createNoise2D, type Noise2D } from './generators/perlin';
import { HALF } from './generators/sides';

// ============================================
// ⚙️ ПАРАМЕТРЫ
// ============================================

export const TERRAIN_EDGE_MODES = ['flat', 'shared'] as const;
export type TerrainEdgeMode = (typeof TERRAIN_EDGE_MODES)[number];

export interface TerrainParams {
    /** Рельеф включён (выключен — поля плоские, как раньше) */
    enabled: boolean;
    /** Максимальный подъём поля над плоским уровнем (юниты) */
    amplitude: number;
    /** Частота шума (1/юнит): 0.03 ≈ три холма на тайл */
    frequency: number;
    octaves: number;
    lacunarity: number;
    gain: number;
    /** Степень кривой высоты: >1 — плоские низины и острые вершины, <1 — плато */
    contrast: number;
    /** Как стыковать рельеф с соседними тайлами */
    edgeMode: TerrainEdgeMode;
    /** Расстояние от границы тайла, на котором рельеф достигает полной силы (юниты) */
    edgeFade: number;
    /** Масштаб общего профиля на границе тайла в режиме 'shared' (0..1): 1 — край такой же высоты, как и внутренность */
    edgeLevel: number;
    /** Расстояние от рёбер дорог и городов, на котором рельеф затухает до 0 (юниты) */
    featureFade: number;
    /** Шаг сетки верха поля (юниты): ребра треугольников ≈ этой длины. Меньше — детальнее и тяжелее */
    gridStep: number;
    /** Лимит вершин верха одного полигона поля (защита от взрыва числа треугольников) */
    maxVertices: number;
    /** Осветление вершин на возвышенностях (0 — без подсветки рельефа цветом) */
    heightTint: number;
}

export const DEFAULT_TERRAIN_PARAMS: Readonly<TerrainParams> = {
    enabled: true,
    amplitude: 5,
    frequency: 0.03,
    octaves: 2,
    lacunarity: 2,
    gain: 0.5,
    contrast: 1.2,
    edgeMode: 'shared',
    edgeFade: 14,
    edgeLevel: 0.9,
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
    const edgeMode = (TERRAIN_EDGE_MODES as readonly unknown[]).includes(partial?.edgeMode)
        ? partial!.edgeMode!
        : d.edgeMode;

    return {
        enabled: typeof partial?.enabled === 'boolean' ? partial.enabled : d.enabled,
        amplitude: clamp(finite(partial?.amplitude, d.amplitude), 0, 40),
        frequency: clamp(finite(partial?.frequency, d.frequency), 0.002, 0.3),
        octaves: Math.round(clamp(finite(partial?.octaves, d.octaves), 1, 6)),
        lacunarity: clamp(finite(partial?.lacunarity, d.lacunarity), 1, 4),
        gain: clamp(finite(partial?.gain, d.gain), 0.1, 0.9),
        contrast: clamp(finite(partial?.contrast, d.contrast), 0.3, 4),
        edgeMode,
        edgeFade: clamp(finite(partial?.edgeFade, d.edgeFade), 0, HALF),
        edgeLevel: clamp(finite(partial?.edgeLevel, d.edgeLevel), 0, 1),
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

/** Общий профиль края: один и тот же для всех тайлов (seed фиксирован) */
const EDGE_PROFILE_SEED = 'fiefdom-terrain-edge';
let edgeNoiseBase: Noise2D | null = null;
const edgeNoise = (): Noise2D => (edgeNoiseBase ??= createNoise2D(EDGE_PROFILE_SEED));

/** Шум Перлина ≈ [−0.7, 0.7] → [0, 1] */
const noiseTo01 = (n: number): number => clamp(0.5 + n * 0.7, 0, 1);

export interface TerrainField {
    /** Относительная высота 0..1 в точке тайла (локальные координаты −HALF..HALF), без учёта дорог и городов */
    elevation(x: number, y: number): number;
}

/** Множитель 0..1 по расстоянию до ближайшего ребра дороги/города/площади */
export function featureFactor(distance: number, fade: number): number {
    return fade <= 0 ? 1 : smoothstep(distance / fade);
}

/**
 * Создаёт поле высоты тайла.
 * @param seed seed тайла (artId или закреплённый seed)
 */
export function createTerrainField(params: TerrainParams, seed: string): TerrainField {
    const shape = (v: number): number => Math.pow(clamp(v, 0, 1), params.contrast);

    const base = createFBM(createNoise2D(seed), params.octaves, params.lacunarity, params.gain);
    const interior = (x: number, y: number): number => noiseTo01(base(x * params.frequency, y * params.frequency));

    // Общий 1D-профиль вдоль стороны: симметричен (зависит от |t|), поэтому не зависит от поворота и отражения
    const edgeFbm = createFBM(edgeNoise(), params.octaves, params.lacunarity, params.gain);
    const profile = (t: number): number => shape(noiseTo01(edgeFbm(Math.abs(t) * params.frequency, 0.37)));

    /**
     * Профиль края в точке: у стороны y = ±HALF берётся g(|x|), у стороны x = ±HALF — g(|y|);
     * в углу оба совпадают (g(HALF)). Веса обратно пропорциональны расстоянию до сторон;
     * сглаживающая добавка ε растягивает переход, чтобы на диагоналях углов не было складок.
     * Формула симметрична по осям, поэтому у соседа (повёрнутого на 90°) на стыке получается то же число.
     */
    const blendEps = Math.max(2, params.edgeFade * 0.6);
    const edgeProfile = (x: number, y: number): number => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        const wH = 1 / (Math.max(0, HALF - ay) + blendEps);
        const wV = 1 / (Math.max(0, HALF - ax) + blendEps);
        return (wH * profile(ax) + wV * profile(ay)) / (wH + wV);
    };

    return {
        elevation(x: number, y: number): number {
            const distToBorder = Math.max(0, HALF - Math.max(Math.abs(x), Math.abs(y)));
            const w = params.edgeFade > 0 ? smoothstep(distToBorder / params.edgeFade) : 1;
            const inner = shape(interior(x, y));

            if (params.edgeMode === 'flat') return inner * w;
            const edge = params.edgeLevel * edgeProfile(x, y);
            return edge + (inner - edge) * w;
        },
    };
}
