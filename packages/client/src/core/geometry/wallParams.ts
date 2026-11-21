// packages/client/src/core/geometry/wallParams.ts
// ============================================
// 🏰 ПАРАМЕТРЫ ГОРОДСКИХ СТЕН
// ============================================
// Секция `walls` файла geometryParams.json. Чистый модуль (без three и React).
//
// Единицы — мировые (сторона тайла = 100). Высоты считаются от поверхности города
// вверх; `sink` — на сколько основание заглублено ниже поверхности, чтобы на неровностях
// полей у границы города не оставалось щелей.
//
// Параметры стен НЕ входят в хэш бандлов тайлов (см. hashGeometryParams): ползунок стены
// не пересобирает геометрию тайлов.
// ============================================

export interface WallBodyParams {
    /** Толщина стены */
    width: number;
    /** Высота стены над поверхностью города */
    height: number;
    /** Заглубление основания под поверхность */
    sink: number;
    /** Углы поворота контура мягче порога сглаживаются, острее — остаются чёткими (°) */
    creaseAngle: number;
}

export interface TowerParams {
    radius: number;
    height: number;
    /** Число граней цилиндра */
    segments: number;
}

export interface GateParams {
    /**
     * Длина ворот вдоль стены: расстояние между осями боковых башен.
     * Не меньше, чем проём + два радиуса башни + стойка (иначе башни перекрыли бы проход).
     */
    width: number;
    /** Высота воротной арки-блока над поверхностью */
    height: number;
    /** Ширина проёма */
    archWidth: number;
    /** Полная высота проёма (прямые стенки + полукруглый свод) */
    archHeight: number;
    /** Сколько граней у свода */
    archSegments: number;
    /** На сколько ворота толще стены (суммарно, по половине с каждой стороны) */
    extraDepth: number;
    /** Боковые башни ворот */
    towerRadius: number;
    towerHeight: number;
}

export interface MerlonParams {
    enabled: boolean;
    /** Длина зубца вдоль стены */
    width: number;
    /** Желаемый просвет между зубцами (реальный подгоняется под длину участка) */
    gap: number;
    height: number;
    /** Толщина зубца в долях толщины стены */
    depth: number;
}

export interface WallColors {
    wall: string;
    tower: string;
    gate: string;
    merlon: string;
}

export interface WallParams {
    /** Строить ли стены вообще */
    enabled: boolean;
    /** Обносить стеной и внутренние кольца города (вокруг полей и монастырей внутри него) */
    innerRings: boolean;
    /** Доля анимации завершения региона, за которую стены вырастают из земли */
    riseFraction: number;
    wall: WallBodyParams;
    tower: TowerParams;
    gate: GateParams;
    merlon: MerlonParams;
    colors: WallColors;
}

/** Любая часть параметров: недостающее достраивается значениями по умолчанию */
export interface WallParamsInput {
    enabled?: boolean;
    innerRings?: boolean;
    riseFraction?: number;
    wall?: Partial<WallBodyParams>;
    tower?: Partial<TowerParams>;
    gate?: Partial<GateParams>;
    merlon?: Partial<MerlonParams>;
    colors?: Partial<WallColors>;
}

export const DEFAULT_WALL_PARAMS: Readonly<WallParams> = {
    enabled: true,
    innerRings: true,
    riseFraction: 0.7,
    wall: { width: 5, height: 14, sink: 1.5, creaseAngle: 35 },
    tower: { radius: 7.5, height: 22, segments: 16 },
    gate: {
        width: 24,
        height: 17,
        archWidth: 8,
        archHeight: 10,
        archSegments: 8,
        extraDepth: 3,
        towerRadius: 6.5,
        towerHeight: 24,
    },
    merlon: { enabled: true, width: 3, gap: 2.5, height: 3, depth: 0.7 },
    colors: { wall: '#b8aa8f', tower: '#a99b82', gate: '#9d8f77', merlon: '#c2b69c' },
};

/** Допустимые диапазоны (для ползунков песочницы и приведения значений) */
export const WALL_PARAM_LIMITS = {
    riseFraction: { min: 0.1, max: 1 },
    wall: {
        width: { min: 0.5, max: 30 },
        height: { min: 1, max: 80 },
        sink: { min: 0, max: 10 },
        creaseAngle: { min: 0, max: 180 },
    },
    tower: { radius: { min: 1, max: 30 }, height: { min: 1, max: 120 }, segments: { min: 6, max: 48 } },
    gate: {
        width: { min: 4, max: 110 },
        height: { min: 2, max: 80 },
        archWidth: { min: 1, max: 40 },
        archHeight: { min: 1, max: 78 },
        archSegments: { min: 3, max: 24 },
        extraDepth: { min: 0, max: 20 },
        towerRadius: { min: 1, max: 30 },
        towerHeight: { min: 1, max: 120 },
    },
    merlon: {
        width: { min: 0.5, max: 20 },
        gap: { min: 0.3, max: 20 },
        height: { min: 0.3, max: 20 },
        depth: { min: 0.1, max: 1 },
    },
} as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, n));
};

const clampInt = (value: unknown, fallback: number, min: number, max: number): number =>
    Math.round(clamp(value, fallback, min, max));

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

const color = (value: unknown, fallback: string): string =>
    typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;

/** Достраивает любой ввод до полного набора параметров стен, значения приводятся к диапазонам */
export function resolveWallParams(input: WallParamsInput = {}): WallParams {
    const d = DEFAULT_WALL_PARAMS;
    const L = WALL_PARAM_LIMITS;

    const wall: WallBodyParams = {
        width: clamp(input.wall?.width, d.wall.width, L.wall.width.min, L.wall.width.max),
        height: clamp(input.wall?.height, d.wall.height, L.wall.height.min, L.wall.height.max),
        sink: clamp(input.wall?.sink, d.wall.sink, L.wall.sink.min, L.wall.sink.max),
        creaseAngle: clamp(input.wall?.creaseAngle, d.wall.creaseAngle, L.wall.creaseAngle.min, L.wall.creaseAngle.max),
    };

    const tower: TowerParams = {
        radius: clamp(input.tower?.radius, d.tower.radius, L.tower.radius.min, L.tower.radius.max),
        height: clamp(input.tower?.height, d.tower.height, L.tower.height.min, L.tower.height.max),
        segments: clampInt(input.tower?.segments, d.tower.segments, L.tower.segments.min, L.tower.segments.max),
    };

    // Проём и башни задают минимальную длину ворот: башни стоят по бокам проёма и не должны
    // его перекрывать. Полукруглый свод требует высоты ≥ радиуса, а над сводом остаётся
    // не меньше 1 ед. кладки.
    const towerRadius = clamp(input.gate?.towerRadius, d.gate.towerRadius, L.gate.towerRadius.min, L.gate.towerRadius.max);
    const gateHeight = clamp(input.gate?.height, d.gate.height, L.gate.height.min, L.gate.height.max);
    const archWidth = clamp(input.gate?.archWidth, d.gate.archWidth, L.gate.archWidth.min, L.gate.archWidth.max);
    const gateWidth = Math.min(
        L.gate.width.max,
        Math.max(clamp(input.gate?.width, d.gate.width, L.gate.width.min, L.gate.width.max), archWidth + 2 * towerRadius + 1)
    );
    const archHeight = Math.min(
        Math.max(clamp(input.gate?.archHeight, d.gate.archHeight, L.gate.archHeight.min, L.gate.archHeight.max), archWidth / 2),
        Math.max(archWidth / 2, gateHeight - 1)
    );
    const gate: GateParams = {
        width: gateWidth,
        height: gateHeight,
        archWidth,
        archHeight,
        archSegments: clampInt(input.gate?.archSegments, d.gate.archSegments, L.gate.archSegments.min, L.gate.archSegments.max),
        extraDepth: clamp(input.gate?.extraDepth, d.gate.extraDepth, L.gate.extraDepth.min, L.gate.extraDepth.max),
        towerRadius,
        towerHeight: clamp(input.gate?.towerHeight, d.gate.towerHeight, L.gate.towerHeight.min, L.gate.towerHeight.max),
    };

    const merlon: MerlonParams = {
        enabled: bool(input.merlon?.enabled, d.merlon.enabled),
        width: clamp(input.merlon?.width, d.merlon.width, L.merlon.width.min, L.merlon.width.max),
        gap: clamp(input.merlon?.gap, d.merlon.gap, L.merlon.gap.min, L.merlon.gap.max),
        height: clamp(input.merlon?.height, d.merlon.height, L.merlon.height.min, L.merlon.height.max),
        depth: clamp(input.merlon?.depth, d.merlon.depth, L.merlon.depth.min, L.merlon.depth.max),
    };

    return {
        enabled: bool(input.enabled, d.enabled),
        innerRings: bool(input.innerRings, d.innerRings),
        riseFraction: clamp(input.riseFraction, d.riseFraction, L.riseFraction.min, L.riseFraction.max),
        wall,
        tower,
        gate,
        merlon,
        colors: {
            wall: color(input.colors?.wall, d.colors.wall),
            tower: color(input.colors?.tower, d.colors.tower),
            gate: color(input.colors?.gate, d.colors.gate),
            merlon: color(input.colors?.merlon, d.colors.merlon),
        },
    };
}

/** Слияние поправки с текущими параметрами: вложенные группы дополняются, а не заменяются */
export function mergeWallParams(current: WallParams, patch: WallParamsInput): WallParams {
    return resolveWallParams({
        ...current,
        ...patch,
        wall: { ...current.wall, ...patch.wall },
        tower: { ...current.tower, ...patch.tower },
        gate: { ...current.gate, ...patch.gate },
        merlon: { ...current.merlon, ...patch.merlon },
        colors: { ...current.colors, ...patch.colors },
    });
}

/** Ключ кэша мешей стен: любое изменение параметров даёт другой ключ */
export const wallParamsKey = (params: WallParams): string => JSON.stringify(params);

// ============================================
// 🌱 РОСТ ИЗ ЗЕМЛИ
// ============================================

/** easeOutBack: небольшой «перелёт» в конце, как будто стена садится на место */
export function easeOutBack(t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const x = t;
    const c1 = 1.2;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Степень роста стен (0 — под землёй, 1 — полная высота) через `elapsedMs` после начала анимации.
 * Вне диапазона [0, durationMs] даёт 0 и 1 соответственно.
 */
export function wallGrowthAt(elapsedMs: number, durationMs: number): number {
    if (elapsedMs <= 0) return 0;
    if (elapsedMs >= durationMs || durationMs <= 0) return 1;
    return easeOutBack(elapsedMs / durationMs);
}
