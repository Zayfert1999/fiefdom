// packages/client/src/core/geometry/geometryParams.ts
// ============================================
// 🎛 ЕДИНЫЙ НАБОР ПАРАМЕТРОВ ГЕОМЕТРИИ
// ============================================
// Всё, что влияет на форму тайлов, собрано в один объект и хранится
// в geometryParams.json. Песочница редактирует его и сохраняет обратно.
//
//   {
//     version, generation, tessellation, noise,
//     noiseByType: { city?, monastery?, road? },   ← свои настройки шума для типа фичи
//     plaza, spots, mesh,
//     tiles: { "<artId>": { seed?, noise? } }      ← настройки конкретного тайла
//   }
//
// Порядок применения шума для фичи: noise → tiles[artId].noise → noiseByType[тип].
//
// Модуль чистый: без React и без three. Умеет:
//   • parseGeometryParams — толерантный разбор с понятными предупреждениями
//   • serializeGeometryParams — канонический текст (стабильный порядок ключей)
//   • hashGeometryParams — хэш для ключей кэша (можно по одному тайлу)
//   • resolveTileParams — что реально применяется к тайлу с данным artId
//
// 🚧 ЧЕГО ЗДЕСЬ ПОКА НЕТ: параметров формы городов, монастырей и дорог
//    (CITY_PARAMS, MONASTERY_PARAMS, ROAD_PARAMS). Только ширина дороги.
// ============================================
import { ROAD_PARAMS } from './generators/road';
import { DEFAULT_PLAZA_PARAMS, resolvePlazaParams, type PlazaParams } from './generators/plaza';
import { DEFAULT_SPOT_PARAMS, resolveSpotParams, type SpotParams } from './spots';
import {
    EDGE_FADE_CURVES,
    NOISE_PARAMS,
    resolveNoiseSettings,
    type NoiseByType,
    type NoiseFeatureType,
    type NoiseSettings,
} from './geometryPostProcessor';
import {
    DEFAULT_TESSELLATION_PARAMS,
    resolveTessellationParams,
    type TessellationParams,
} from './tessellate';
import {
    DEFAULT_MESH_PARAMS,
    resolveMeshParams,
    type MeshParams,
    type MeshParamsInput,
} from './tileMesh';

export const GEOMETRY_PARAMS_VERSION = 1;

// ============================================
// 📦 ТИПЫ
// ============================================

/** Параметры генерации исходных контуров из портов */
export interface GenerationParams {
    /** Перегенерировать контуры поверх ручных (из base.json) */
    overwrite: boolean;
    /** Ширина дорог (юниты) */
    roadWidth: number;
}

/** Настройки конкретного тайла (ключ — artId) */
export interface TileParamOverride {
    /** Seed шума вместо artId: «этот тайл вышел некрасивым — берём другой seed» */
    seed?: string;
    /** Свои настройки шума поверх общих */
    noise?: Partial<NoiseSettings>;
}

export interface GeometryParams {
    version: typeof GEOMETRY_PARAMS_VERSION;
    generation: GenerationParams;
    tessellation: TessellationParams;
    noise: NoiseSettings;
    noiseByType: NoiseByType;
    plaza: PlazaParams;
    spots: SpotParams;
    mesh: MeshParams;
    tiles: Record<string, TileParamOverride>;
}

/** Любая часть параметров: недостающее достраивается значениями по умолчанию */
export interface GeometryParamsInput {
    version?: number;
    generation?: Partial<GenerationParams>;
    tessellation?: Partial<TessellationParams>;
    noise?: Partial<NoiseSettings>;
    noiseByType?: NoiseByType;
    plaza?: Partial<PlazaParams>;
    spots?: Partial<SpotParams>;
    mesh?: MeshParamsInput;
    tiles?: Record<string, TileParamOverride>;
}

export const NOISE_FEATURE_TYPES: readonly NoiseFeatureType[] = ['city', 'monastery', 'road'];

const NOISE_KEYS = Object.keys(NOISE_PARAMS) as (keyof NoiseSettings)[];

// ============================================
// 🔧 НОРМАЛИЗАЦИЯ
// ============================================

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Приводит частичные настройки шума к допустимым диапазонам,
 * сохраняя только те ключи, которые были заданы.
 */
function normalizeNoisePartial(
    partial: Partial<NoiseSettings> | undefined,
    base: NoiseSettings
): Partial<NoiseSettings> | undefined {
    if (!partial) return undefined;

    const resolved = resolveNoiseSettings({ ...base, ...partial });
    const result: Record<string, unknown> = {};
    for (const key of NOISE_KEYS) {
        if (partial[key] !== undefined) result[key] = resolved[key];
    }
    return Object.keys(result).length > 0 ? (result as Partial<NoiseSettings>) : undefined;
}

/** Достраивает любой ввод до полного набора параметров */
export function resolveGeometryParams(input: GeometryParamsInput = {}): GeometryParams {
    const noise = resolveNoiseSettings(input.noise);

    const noiseByType: NoiseByType = {};
    for (const type of NOISE_FEATURE_TYPES) {
        const normalized = normalizeNoisePartial(input.noiseByType?.[type], noise);
        if (normalized) noiseByType[type] = normalized;
    }

    const tiles: Record<string, TileParamOverride> = {};
    for (const artId of Object.keys(input.tiles ?? {}).sort()) {
        const raw = input.tiles![artId];
        const seed = typeof raw?.seed === 'string' && raw.seed.trim() ? raw.seed.trim() : undefined;
        const tileNoise = normalizeNoisePartial(raw?.noise, noise);
        if (seed === undefined && tileNoise === undefined) continue;
        tiles[artId] = {
            ...(seed !== undefined ? { seed } : {}),
            ...(tileNoise ? { noise: tileNoise } : {}),
        };
    }

    const roadWidth = input.generation?.roadWidth;

    return {
        version: GEOMETRY_PARAMS_VERSION,
        generation: {
            overwrite: input.generation?.overwrite ?? false,
            roadWidth:
                typeof roadWidth === 'number' && Number.isFinite(roadWidth)
                    ? Math.min(60, Math.max(2, roadWidth))
                    : ROAD_PARAMS.width,
        },
        tessellation: resolveTessellationParams(input.tessellation),
        noise,
        noiseByType,
        plaza: resolvePlazaParams(input.plaza),
        spots: resolveSpotParams(input.spots),
        mesh: resolveMeshParams(input.mesh),
        tiles,
    };
}

export const DEFAULT_GEOMETRY_PARAMS: Readonly<GeometryParams> = resolveGeometryParams();

export const cloneGeometryParams = (params: GeometryParams): GeometryParams => structuredClone(params);

// ============================================
// 🔍 РАЗБОР ВНЕШНЕГО JSON
// ============================================

export interface ParseGeometryParamsResult {
    readonly params: GeometryParams;
    /** Что в файле не так: неизвестные ключи, неверные типы, значения вне диапазона */
    readonly warnings: string[];
}

/** Оставляет у секции только известные ключи нужного типа, остальное — в предупреждения */
function sanitizeSection(
    path: string,
    input: unknown,
    defaults: object,
    warnings: string[]
): Record<string, unknown> | undefined {
    if (input === undefined) return undefined;
    if (!isRecord(input)) {
        warnings.push(`${path}: ожидался объект, секция пропущена`);
        return undefined;
    }

    const defaultsRecord = defaults as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        if (!(key in defaultsRecord)) {
            warnings.push(`${path}.${key}: неизвестный параметр, проигнорирован`);
            continue;
        }
        const expected = defaultsRecord[key];
        if (isRecord(expected)) {
            const nested = sanitizeSection(`${path}.${key}`, value, expected, warnings);
            if (nested) result[key] = nested;
            continue;
        }
        if (typeof value !== typeof expected || (typeof value === 'number' && !Number.isFinite(value))) {
            warnings.push(`${path}.${key}: ожидался ${typeof expected}, получено ${JSON.stringify(value)}`);
            continue;
        }
        if (key === 'edgeFadeCurve' && !(EDGE_FADE_CURVES as readonly unknown[]).includes(value)) {
            warnings.push(`${path}.${key}: допустимо ${EDGE_FADE_CURVES.join(' | ')}, получено ${JSON.stringify(value)}`);
            continue;
        }
        result[key] = value;
    }
    return result;
}

/** Сообщает о числах, которые resolve* привёл к допустимому диапазону */
function reportClamped(path: string, input: unknown, output: unknown, warnings: string[]): void {
    if (typeof input === 'number' && typeof output === 'number') {
        if (Math.abs(input - output) > 1e-9) warnings.push(`${path}: значение ${input} приведено к ${output}`);
        return;
    }
    if (isRecord(input) && isRecord(output)) {
        for (const key of Object.keys(input)) reportClamped(`${path}.${key}`, input[key], output[key], warnings);
    }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Разбирает произвольные данные (например, содержимое JSON) в полный набор параметров */
export function parseGeometryParams(raw: unknown): ParseGeometryParamsResult {
    const warnings: string[] = [];

    if (!isRecord(raw)) {
        warnings.push('Корень должен быть объектом, используются значения по умолчанию');
        return { params: resolveGeometryParams(), warnings };
    }

    if (raw.version !== GEOMETRY_PARAMS_VERSION) {
        warnings.push(
            `version: ожидалась ${GEOMETRY_PARAMS_VERSION}, в файле ${JSON.stringify(raw.version)}`
        );
    }

    const topLevel = new Set([
        'version', 'generation', 'tessellation', 'noise', 'noiseByType', 'plaza', 'spots', 'mesh', 'tiles',
    ]);
    for (const key of Object.keys(raw)) {
        if (!topLevel.has(key)) warnings.push(`${key}: неизвестная секция, проигнорирована`);
    }

    const input: GeometryParamsInput = {
        generation: sanitizeSection('generation', raw.generation, { overwrite: false, roadWidth: 0 }, warnings) as
            GeometryParamsInput['generation'],
        tessellation: sanitizeSection('tessellation', raw.tessellation, DEFAULT_TESSELLATION_PARAMS, warnings) as
            GeometryParamsInput['tessellation'],
        noise: sanitizeSection('noise', raw.noise, NOISE_PARAMS, warnings) as GeometryParamsInput['noise'],
        plaza: sanitizeSection('plaza', raw.plaza, DEFAULT_PLAZA_PARAMS, warnings) as GeometryParamsInput['plaza'],
        spots: sanitizeSection('spots', raw.spots, DEFAULT_SPOT_PARAMS, warnings) as GeometryParamsInput['spots'],
        mesh: sanitizeSection('mesh', raw.mesh, DEFAULT_MESH_PARAMS, warnings) as GeometryParamsInput['mesh'],
    };

    // Цвета меша должны быть #rrggbb
    const colors = input.mesh?.colors as Record<string, unknown> | undefined;
    if (colors) {
        for (const [surface, value] of Object.entries(colors)) {
            if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
                warnings.push(`mesh.colors.${surface}: ожидался цвет #rrggbb, получено ${JSON.stringify(value)}`);
                delete colors[surface];
            }
        }
    }

    // Настройки шума по типу фичи
    if (raw.noiseByType !== undefined) {
        if (!isRecord(raw.noiseByType)) {
            warnings.push('noiseByType: ожидался объект, секция пропущена');
        } else {
            const byType: NoiseByType = {};
            for (const [type, value] of Object.entries(raw.noiseByType)) {
                if (!(NOISE_FEATURE_TYPES as readonly string[]).includes(type)) {
                    warnings.push(`noiseByType.${type}: неизвестный тип фичи, проигнорирован`);
                    continue;
                }
                const section = sanitizeSection(`noiseByType.${type}`, value, NOISE_PARAMS, warnings);
                if (section) byType[type as NoiseFeatureType] = section as Partial<NoiseSettings>;
            }
            input.noiseByType = byType;
        }
    }

    // Настройки конкретных тайлов
    if (raw.tiles !== undefined) {
        if (!isRecord(raw.tiles)) {
            warnings.push('tiles: ожидался объект, секция пропущена');
        } else {
            const tiles: Record<string, TileParamOverride> = {};
            for (const [artId, value] of Object.entries(raw.tiles)) {
                if (!isRecord(value)) {
                    warnings.push(`tiles.${artId}: ожидался объект, пропущено`);
                    continue;
                }
                for (const key of Object.keys(value)) {
                    if (key !== 'seed' && key !== 'noise') {
                        warnings.push(`tiles.${artId}.${key}: неизвестный параметр, проигнорирован`);
                    }
                }
                if (value.seed !== undefined && typeof value.seed !== 'string') {
                    warnings.push(`tiles.${artId}.seed: ожидалась строка`);
                }
                tiles[artId] = {
                    seed: typeof value.seed === 'string' ? value.seed : undefined,
                    noise: sanitizeSection(`tiles.${artId}.noise`, value.noise, NOISE_PARAMS, warnings) as
                        Partial<NoiseSettings> | undefined,
                };
            }
            input.tiles = tiles;
        }
    }

    const params = resolveGeometryParams(input);

    // Значения, которые пришлось обрезать до допустимых
    reportClamped('generation', input.generation, params.generation, warnings);
    reportClamped('tessellation', input.tessellation, params.tessellation, warnings);
    reportClamped('noise', input.noise, params.noise, warnings);
    reportClamped('plaza', input.plaza, params.plaza, warnings);
    reportClamped('spots', input.spots, params.spots, warnings);
    reportClamped('mesh', input.mesh, params.mesh, warnings);
    for (const type of NOISE_FEATURE_TYPES) {
        reportClamped(`noiseByType.${type}`, input.noiseByType?.[type], params.noiseByType[type], warnings);
    }
    for (const [artId, override] of Object.entries(input.tiles ?? {})) {
        reportClamped(`tiles.${artId}.noise`, override.noise, params.tiles[artId]?.noise, warnings);
    }

    return { params, warnings };
}

// ============================================
// 📝 КАНОНИЧЕСКАЯ СЕРИАЛИЗАЦИЯ
// ============================================

/** Упорядочивает ключи настроек шума по порядку NOISE_PARAMS */
function orderNoise(partial: Partial<NoiseSettings> | undefined): Partial<NoiseSettings> | undefined {
    if (!partial) return undefined;
    const ordered: Record<string, unknown> = {};
    for (const key of NOISE_KEYS) {
        if (partial[key] !== undefined) ordered[key] = partial[key];
    }
    return ordered as Partial<NoiseSettings>;
}

function canonicalObject(params: GeometryParams, onlyTile?: string): unknown {
    const noiseByType: Record<string, unknown> = {};
    for (const type of NOISE_FEATURE_TYPES) {
        const ordered = orderNoise(params.noiseByType[type]);
        if (ordered) noiseByType[type] = ordered;
    }

    const tiles: Record<string, unknown> = {};
    for (const artId of Object.keys(params.tiles).sort()) {
        if (onlyTile !== undefined && artId !== onlyTile) continue;
        const override = params.tiles[artId];
        tiles[artId] = {
            ...(override.seed !== undefined ? { seed: override.seed } : {}),
            ...(override.noise ? { noise: orderNoise(override.noise) } : {}),
        };
    }

    return {
        version: params.version,
        generation: params.generation,
        tessellation: params.tessellation,
        noise: params.noise,
        noiseByType,
        plaza: params.plaza,
        spots: params.spots,
        mesh: params.mesh,
        tiles,
    };
}

/** Текст для geometryParams.json: стабильный порядок ключей, 2 пробела, перевод строки в конце */
export function serializeGeometryParams(params: GeometryParams): string {
    return JSON.stringify(canonicalObject(params), null, 2) + '\n';
}

// ============================================
// #️⃣ ХЭШ
// ============================================

function fnv1a(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/**
 * Хэш параметров для ключей кэша.
 * С `artId` учитываются только настройки этого тайла: правка seed
 * одного тайла не сбрасывает кэш остальных.
 */
export function hashGeometryParams(params: GeometryParams, artId?: string): string {
    return fnv1a(JSON.stringify(canonicalObject(params, artId ?? undefined)));
}

// ============================================
// 🎯 ПАРАМЕТРЫ ДЛЯ КОНКРЕТНОГО ТАЙЛА
// ============================================

export interface ResolvedTileParams {
    /** Зафиксированный seed тайла (если задан) */
    readonly seed?: string;
    /** Общие настройки шума с учётом tiles[artId].noise */
    readonly noise: NoiseSettings;
    /** Переопределения по типу фичи (применяются поверх noise) */
    readonly noiseByType: NoiseByType;
}

export function resolveTileParams(params: GeometryParams, artId: string): ResolvedTileParams {
    const override = params.tiles[artId];
    return {
        seed: override?.seed,
        noise: override?.noise ? resolveNoiseSettings({ ...params.noise, ...override.noise }) : params.noise,
        noiseByType: params.noiseByType,
    };
}
