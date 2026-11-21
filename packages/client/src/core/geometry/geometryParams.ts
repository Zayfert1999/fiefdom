// packages/client/src/core/geometry/geometryParams.ts
// ============================================
// 🎛 ЕДИНЫЙ НАБОР ПАРАМЕТРОВ ГЕОМЕТРИИ
// ============================================
// Всё, что влияет на форму тайлов, собрано в один объект и хранится
// в geometryParams.json. Песочница редактирует его и сохраняет обратно.
//
//   {
//     version, shapes, tessellation, noise,
//     noiseByType: { city?, monastery?, road? },   ← свои настройки шума для типа фичи
//     plaza, spots, mesh,
//     walls,                                        ← городские стены (не влияют на геометрию тайлов)
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
// 🏗 `shapes` — параметры форм городов, монастырей и дорог (раньше константы
//    CITY_PARAMS / MONASTERY_PARAMS / ROAD_PARAMS в генераторах). Старая секция
//    `generation` (roadWidth, roadEndOverlap) при чтении молча переносится в
//    shapes.road.width / shapes.road.endOverlap.
// ============================================
import {
    resolveShapeParams,
    DEFAULT_SHAPE_PARAMS,
    type ShapeParams,
    type ShapeParamsInput,
} from './generators/shapeParams';
import { DEFAULT_PLAZA_PARAMS, resolvePlazaParams, type PlazaParams } from './generators/plaza';
import {
    DEFAULT_SPOT_PARAMS,
    SHIELD_ANCHORS,
    resolveSpotParams,
    type ShieldAnchor,
    type SpotParams,
} from './spots';
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
import {
    DEFAULT_WALL_PARAMS,
    resolveWallParams,
    type WallParams,
    type WallParamsInput,
} from './wallParams';

export const GEOMETRY_PARAMS_VERSION = 1;

// ============================================
// 📦 ТИПЫ
// ============================================

/** Настройки конкретного тайла (ключ — artId) */
export interface TileParamOverride {
    /** Seed шума вместо artId: «этот тайл вышел некрасивым — берём другой seed» */
    seed?: string;
    /** Куда поставить щит: угол тайла (NW, NE, SE, SW) или середина стороны (N, E, S, W). Без этого — автоматически */
    shieldAnchor?: ShieldAnchor;
    /** Свои настройки шума поверх общих */
    noise?: Partial<NoiseSettings>;
}

export interface GeometryParams {
    version: typeof GEOMETRY_PARAMS_VERSION;
    /** Формы городов, монастырей и дорог */
    shapes: ShapeParams;
    tessellation: TessellationParams;
    noise: NoiseSettings;
    noiseByType: NoiseByType;
    plaza: PlazaParams;
    spots: SpotParams;
    mesh: MeshParams;
    /** Городские стены: башни, ворота, зубцы. В хэш бандлов тайлов не входят */
    walls: WallParams;
    tiles: Record<string, TileParamOverride>;
}

/** Любая часть параметров: недостающее достраивается значениями по умолчанию */
export interface GeometryParamsInput {
    version?: number;
    shapes?: ShapeParamsInput;
    tessellation?: Partial<TessellationParams>;
    noise?: Partial<NoiseSettings>;
    noiseByType?: NoiseByType;
    plaza?: Partial<PlazaParams>;
    spots?: Partial<SpotParams>;
    mesh?: MeshParamsInput;
    walls?: WallParamsInput;
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
        const shieldAnchor = SHIELD_ANCHORS.includes(raw?.shieldAnchor as ShieldAnchor)
            ? (raw!.shieldAnchor as ShieldAnchor)
            : undefined;
        if (seed === undefined && tileNoise === undefined && shieldAnchor === undefined) continue;
        tiles[artId] = {
            ...(seed !== undefined ? { seed } : {}),
            ...(shieldAnchor !== undefined ? { shieldAnchor } : {}),
            ...(tileNoise ? { noise: tileNoise } : {}),
        };
    }

    return {
        version: GEOMETRY_PARAMS_VERSION,
        shapes: resolveShapeParams(input.shapes),
        tessellation: resolveTessellationParams(input.tessellation),
        noise,
        noiseByType,
        plaza: resolvePlazaParams(input.plaza),
        spots: resolveSpotParams(input.spots),
        mesh: resolveMeshParams(input.mesh),
        walls: resolveWallParams(input.walls),
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
        'version', 'shapes', 'generation', 'tessellation', 'noise', 'noiseByType', 'plaza', 'spots', 'mesh', 'walls', 'tiles',
    ]);
    for (const key of Object.keys(raw)) {
        if (!topLevel.has(key)) warnings.push(`${key}: неизвестная секция, проигнорирована`);
    }

    const input: GeometryParamsInput = {
        shapes: sanitizeSection('shapes', raw.shapes, DEFAULT_SHAPE_PARAMS, warnings) as GeometryParamsInput['shapes'],
        tessellation: sanitizeSection('tessellation', raw.tessellation, DEFAULT_TESSELLATION_PARAMS, warnings) as
            GeometryParamsInput['tessellation'],
        noise: sanitizeSection('noise', raw.noise, NOISE_PARAMS, warnings) as GeometryParamsInput['noise'],
        plaza: sanitizeSection('plaza', raw.plaza, DEFAULT_PLAZA_PARAMS, warnings) as GeometryParamsInput['plaza'],
        spots: sanitizeSection('spots', raw.spots, DEFAULT_SPOT_PARAMS, warnings) as GeometryParamsInput['spots'],
        mesh: sanitizeSection('mesh', raw.mesh, DEFAULT_MESH_PARAMS, warnings) as GeometryParamsInput['mesh'],
        walls: sanitizeSection('walls', raw.walls, DEFAULT_WALL_PARAMS, warnings) as GeometryParamsInput['walls'],
    };

    // Старая секция generation: roadWidth и roadEndOverlap переехали в shapes.road, overwrite удалён
    if (raw.generation !== undefined) {
        if (!isRecord(raw.generation)) {
            warnings.push('generation: ожидался объект, секция пропущена');
        } else {
            const legacy: Record<string, string> = { roadWidth: 'width', roadEndOverlap: 'endOverlap' };
            for (const [key, value] of Object.entries(raw.generation)) {
                if (key === 'overwrite') continue;
                const target = legacy[key];
                if (!target) {
                    warnings.push(`generation.${key}: неизвестный параметр, проигнорирован`);
                } else if (typeof value === 'number' && Number.isFinite(value)) {
                    // Значение из новой секции shapes.road важнее перенесённого
                    const shapes: ShapeParamsInput = input.shapes ?? {};
                    const road: Record<string, number> = { ...(shapes.road as Record<string, number> | undefined) };
                    if (road[target] === undefined) road[target] = value;
                    input.shapes = { ...shapes, road };
                } else {
                    warnings.push(`generation.${key}: ожидалось число, получено ${JSON.stringify(value)}`);
                }
            }
        }
    }

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

    // Цвета стен тоже #rrggbb
    const wallColors = input.walls?.colors as Record<string, unknown> | undefined;
    if (wallColors) {
        for (const [part, value] of Object.entries(wallColors)) {
            if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
                warnings.push(`walls.colors.${part}: ожидался цвет #rrggbb, получено ${JSON.stringify(value)}`);
                delete wallColors[part];
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
                    if (key !== 'seed' && key !== 'noise' && key !== 'shieldAnchor') {
                        warnings.push(`tiles.${artId}.${key}: неизвестный параметр, проигнорирован`);
                    }
                }
                if (value.shieldAnchor !== undefined && !SHIELD_ANCHORS.includes(value.shieldAnchor as ShieldAnchor)) {
                    warnings.push(
                        `tiles.${artId}.shieldAnchor: допустимо ${SHIELD_ANCHORS.join(' | ')}, получено ${JSON.stringify(value.shieldAnchor)}`
                    );
                }
                if (value.seed !== undefined && typeof value.seed !== 'string') {
                    warnings.push(`tiles.${artId}.seed: ожидалась строка`);
                }
                tiles[artId] = {
                    seed: typeof value.seed === 'string' ? value.seed : undefined,
                    shieldAnchor: value.shieldAnchor as ShieldAnchor | undefined,
                    noise: sanitizeSection(`tiles.${artId}.noise`, value.noise, NOISE_PARAMS, warnings) as
                        Partial<NoiseSettings> | undefined,
                };
            }
            input.tiles = tiles;
        }
    }

    const params = resolveGeometryParams(input);

    // Значения, которые пришлось обрезать до допустимых
    reportClamped('shapes', input.shapes, params.shapes, warnings);
    reportClamped('tessellation', input.tessellation, params.tessellation, warnings);
    reportClamped('noise', input.noise, params.noise, warnings);
    reportClamped('plaza', input.plaza, params.plaza, warnings);
    reportClamped('spots', input.spots, params.spots, warnings);
    reportClamped('mesh', input.mesh, params.mesh, warnings);
    reportClamped('walls', input.walls, params.walls, warnings);
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

function canonicalObject(
    params: GeometryParams,
    onlyTile?: string,
    includeWalls: boolean = onlyTile === undefined
): unknown {
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
            ...(override.shieldAnchor !== undefined ? { shieldAnchor: override.shieldAnchor } : {}),
            ...(override.noise ? { noise: orderNoise(override.noise) } : {}),
        };
    }

    return {
        version: params.version,
        shapes: params.shapes,
        tessellation: params.tessellation,
        noise: params.noise,
        noiseByType,
        plaza: params.plaza,
        spots: params.spots,
        mesh: params.mesh,
        // Стены не влияют на геометрию тайлов: в хэш одного тайла они не попадают,
        // иначе ползунок стены сбрасывал бы кэш бандлов
        ...(includeWalls ? { walls: params.walls } : {}),
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

export interface HashGeometryParamsOptions {
    /**
     * Учитывать ли городские стены. По умолчанию — только для общего хэша (без artId):
     * хэш одного тайла от стен не зависит, потому что стены не влияют на его геометрию.
     * `false` нужен, чтобы пересчитывать геометрию тайлов только при правке того, что её меняет.
     */
    readonly includeWalls?: boolean;
}

/**
 * Хэш параметров для ключей кэша.
 * С `artId` учитываются только настройки этого тайла: правка seed
 * одного тайла не сбрасывает кэш остальных.
 */
export function hashGeometryParams(
    params: GeometryParams,
    artId?: string,
    options: HashGeometryParamsOptions = {}
): string {
    return fnv1a(JSON.stringify(canonicalObject(params, artId ?? undefined, options.includeWalls)));
}

// ============================================
// 🎯 ПАРАМЕТРЫ ДЛЯ КОНКРЕТНОГО ТАЙЛА
// ============================================

export interface ResolvedTileParams {
    /** Зафиксированный seed тайла (если задан) */
    readonly seed?: string;
    /** Заданная привязка щита (если задана) */
    readonly shieldAnchor?: ShieldAnchor;
    /** Общие настройки шума с учётом tiles[artId].noise */
    readonly noise: NoiseSettings;
    /** Переопределения по типу фичи (применяются поверх noise) */
    readonly noiseByType: NoiseByType;
}

export function resolveTileParams(params: GeometryParams, artId: string): ResolvedTileParams {
    const override = params.tiles[artId];
    return {
        seed: override?.seed,
        shieldAnchor: override?.shieldAnchor,
        noise: override?.noise ? resolveNoiseSettings({ ...params.noise, ...override.noise }) : params.noise,
        noiseByType: params.noiseByType,
    };
}
