// packages/client/src/core/geometry/townParams.ts
// ============================================
// 🏘 ПАРАМЕТРЫ ЗАСТРОЙКИ ГОРОДОВ
// ============================================
// Секция `town` файла geometryParams.json. Чистый модуль (без three и React).
//
// Что строится внутри завершённого города (townGeometry.ts):
//   • главная площадь — круг в точке polylabel (самая удалённая от границ точка города);
//   • улицы по диаграмме Вороного со сглаживанием Лапласа: главные (толстые) — от ворот
//     к площади, второстепенные — остальная сеть, прореженная случайно;
//   • домики вдоль улиц: параллелепипед + четырёхскатная пирамида, размеры слегка разные.
//
// Единицы — мировые (сторона тайла = 100). Высоты считаются от поверхности города вверх;
// `sink` — заглубление основания домика ниже поверхности.
//
// Параметры застройки НЕ входят в хэш бандлов тайлов (см. hashGeometryParams): ползунок
// не пересобирает геометрию тайлов.
// ============================================
import { easeOutBack } from './wallParams';

export interface TownSquareParams {
    /**
     * Порог размера города: меньше этой площади (в площадях тайла, 1 = 100×100) главной площади
     * нет вовсе. Улицы такого города сходятся к его центру (точке polylabel).
     */
    minCityArea: number;
    /** Размер города (в площадях тайла), с которого площадь достигает максимального радиуса */
    fullSizeArea: number;
    /** Радиус площади в городе размером `minCityArea`: от него радиус растёт с размером города */
    minRadius: number;
    /** Радиус площади в городе размером `fullSizeArea` и больше */
    maxRadius: number;
    /** Зазор между краем площади и домами */
    gap: number;
    /**
     * Длина радиального подъезда к площади в долях её радиуса. Сеть улиц обрезается по кольцу
     * R + подъезд, а каждый въезд на площадь — прямой радиальный отрезок от кольца до кромки.
     */
    approachRatio: number;
    /** Подъезд не короче этого: у маленькой площади он иначе вырождался бы в точку */
    approachMin: number;
    /** Подъезд не длиннее этого: у большой площади он иначе съел бы кварталы вокруг неё */
    approachMax: number;
    /**
     * Минимальная ширина прохода вокруг площади (вместе с подъездом) до границы застройки: улица и
     * ряд домов. Без прохода площадь в самом узком месте города перегородила бы его и отрезала
     * часть кварталов: площадь тогда уменьшается, а если совсем не помещается — не строится.
     */
    passWidth: number;
    /** Число сторон круга */
    segments: number;
}

export interface TownStreetParams {
    /** Средний размер квартала: расстояние между узлами сети (чем меньше — тем гуще улицы) */
    blockSize: number;
    /** Доля второстепенных улиц, которые остаются после прореживания */
    keepFraction: number;
    /**
     * Итерации сглаживания Лапласа главных дорог. Сглаживаются первыми и сильнее всего:
     * точки главной дороги от арки ворот до площади (0 — ломаный путь по рёбрам Вороного).
     */
    mainSmoothing: number;
    /** Итерации сглаживания второстепенных улиц (после главных; их концы на главных дорогах не двигаются) */
    sideSmoothing: number;
    /**
     * Прямой участок главной дороги от арки ворот, перпендикулярно стене: к нему сглаживание не
     * прикасается. Дальше дорога сглаживается свободно, в том числе в зоне отступа у стены.
     */
    archRun: number;
    /** Минимальный угол между въездами на площадь (°): ворота не сходятся в одной точке кромки */
    entranceMinSep: number;
    /** Сколько вторичных улиц-«лучей» присоединяется к площади (0 — ни одной; без ворот — не меньше 4) */
    maxRays: number;
    /** Минимальный угол между лучами и въездами (°) */
    raySep: number;
    /**
     * Дальние дороги: главные дороги от площади в самые удалённые от главной сети концы города.
     * Столько дорог проводится не больше (0 — выключены); останавливаются раньше, когда весь город
     * ближе `farCover` к главным дорогам.
     */
    farRoads: number;
    /** Расстояние от главных дорог, дальше которого конец города получает дальнюю дорогу */
    farCover: number;
    /** Случайный изгиб улиц до сглаживания */
    wobble: number;
    mainWidth: number;
    sideWidth: number;
    /** Тупики короче этого у стены удаляются */
    minLength: number;
}

export interface TownHouseParams {
    /** Вероятность поставить дом в свободный слот (0–1) */
    fill: number;
    /** Общий множитель размеров домов */
    scale: number;
    widthMin: number;
    widthMax: number;
    depthMin: number;
    depthMax: number;
    wallHeightMin: number;
    wallHeightMax: number;
    roofHeightMin: number;
    roofHeightMax: number;
    /** Отступ фасада от кромки улицы */
    setback: number;
    gapMin: number;
    gapMax: number;
    /** Случайный поворот дома относительно улицы (°) */
    yawJitter: number;
    /** Смещение вершины крыши в долях размера дома (0 — строго по центру) */
    apexJitter: number;
    /** Свес крыши над стенами в долях размера дома */
    roofOverhang: number;
    /** Заглубление основания под поверхность города */
    sink: number;
    /** Дома по кругу вокруг главной площади */
    squareRing: boolean;
}

export interface TownColors {
    square: string;
    mainStreet: string;
    sideStreet: string;
    wall: string;
    roofA: string;
    roofB: string;
    roofC: string;
}

export interface TownAnimationParams {
    /** Доля анимации завершения региона, за которую застройка вырастает */
    riseFraction: number;
    /** Через какую долю анимации региона застройка начинает расти (после стен) */
    startDelay: number;
    /** 0 — все дома растут разом, как стены; 1 — волна от площади занимает весь рост */
    stagger: number;
    /** На сколько частей делится рост домов (каждая часть — отдельный меш) */
    buckets: number;
}

export interface TownParams {
    /** Строить ли застройку вообще */
    enabled: boolean;
    /** Добавка к seed города: другая раскладка при том же составе города */
    seed: string;
    /** Отступ застройки от контура города (стена и башни его не занимают) */
    edgeInset: number;
    square: TownSquareParams;
    streets: TownStreetParams;
    houses: TownHouseParams;
    colors: TownColors;
    animation: TownAnimationParams;
}

/** Любая часть параметров: недостающее достраивается значениями по умолчанию */
export interface TownParamsInput {
    enabled?: boolean;
    seed?: string;
    edgeInset?: number;
    square?: Partial<TownSquareParams>;
    streets?: Partial<TownStreetParams>;
    houses?: Partial<TownHouseParams>;
    colors?: Partial<TownColors>;
    animation?: Partial<TownAnimationParams>;
}

export const DEFAULT_TOWN_PARAMS: Readonly<TownParams> = {
    enabled: true,
    seed: '',
    edgeInset: 9,
    square: {
        minCityArea: 0.6,
        fullSizeArea: 4,
        minRadius: 6,
        maxRadius: 22,
        gap: 2.5,
        approachRatio: 0.6,
        approachMin: 5,
        approachMax: 14,
        passWidth: 12,
        segments: 40,
    },
    streets: {
        blockSize: 24,
        keepFraction: 0.85,
        mainSmoothing: 16,
        sideSmoothing: 5,
        archRun: 6,
        entranceMinSep: 40,
        maxRays: 3,
        raySep: 45,
        farRoads: 4,
        farCover: 38,
        wobble: 1.5,
        mainWidth: 8,
        sideWidth: 4,
        minLength: 18,
    },
    houses: {
        fill: 0.85,
        scale: 1,
        widthMin: 6,
        widthMax: 9,
        depthMin: 5,
        depthMax: 8,
        wallHeightMin: 3.4,
        wallHeightMax: 5.6,
        roofHeightMin: 2.8,
        roofHeightMax: 5.2,
        setback: 1.2,
        gapMin: 1,
        gapMax: 2.6,
        yawJitter: 4,
        apexJitter: 0.18,
        roofOverhang: 0.12,
        sink: 0.5,
        squareRing: true,
    },
    colors: {
        square: '#d9c79c',
        mainStreet: '#cdb892',
        sideStreet: '#c2aa80',
        wall: '#e4d6b5',
        roofA: '#b5523b',
        roofB: '#9c4a35',
        roofC: '#c4683f',
    },
    animation: { riseFraction: 0.7, startDelay: 0.15, stagger: 0.35, buckets: 8 },
};

/** Допустимые диапазоны (для ползунков песочницы и приведения значений) */
export const TOWN_PARAM_LIMITS = {
    edgeInset: { min: 2, max: 30 },
    square: {
        minCityArea: { min: 0, max: 5 },
        fullSizeArea: { min: 0.5, max: 20 },
        minRadius: { min: 2, max: 40 },
        maxRadius: { min: 4, max: 60 },
        gap: { min: 0, max: 10 },
        approachRatio: { min: 0, max: 2 },
        approachMin: { min: 0, max: 30 },
        approachMax: { min: 0, max: 40 },
        passWidth: { min: 0, max: 40 },
        segments: { min: 8, max: 96 },
    },
    streets: {
        blockSize: { min: 12, max: 60 },
        keepFraction: { min: 0, max: 1 },
        mainSmoothing: { min: 0, max: 40 },
        sideSmoothing: { min: 0, max: 20 },
        archRun: { min: 0, max: 40 },
        entranceMinSep: { min: 0, max: 120 },
        maxRays: { min: 0, max: 8 },
        raySep: { min: 0, max: 120 },
        farRoads: { min: 0, max: 10 },
        farCover: { min: 15, max: 150 },
        wobble: { min: 0, max: 5 },
        mainWidth: { min: 2, max: 20 },
        sideWidth: { min: 1, max: 12 },
        minLength: { min: 4, max: 60 },
    },
    houses: {
        fill: { min: 0, max: 1 },
        scale: { min: 0.4, max: 2.5 },
        size: { min: 2, max: 30 },
        height: { min: 1, max: 30 },
        setback: { min: 0, max: 8 },
        gap: { min: 0, max: 10 },
        yawJitter: { min: 0, max: 45 },
        apexJitter: { min: 0, max: 0.45 },
        roofOverhang: { min: 0, max: 0.4 },
        sink: { min: 0, max: 5 },
    },
    animation: {
        riseFraction: { min: 0.1, max: 1 },
        startDelay: { min: 0, max: 0.9 },
        stagger: { min: 0, max: 0.9 },
        buckets: { min: 1, max: 16 },
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

/** Достраивает любой ввод до полного набора параметров застройки, значения приводятся к диапазонам */
export function resolveTownParams(input: TownParamsInput = {}): TownParams {
    const d = DEFAULT_TOWN_PARAMS;
    const L = TOWN_PARAM_LIMITS;

    const minRadius = clamp(input.square?.minRadius, d.square.minRadius, L.square.minRadius.min, L.square.minRadius.max);
    const approachMin = clamp(input.square?.approachMin, d.square.approachMin, L.square.approachMin.min, L.square.approachMin.max);
    const minCityArea = clamp(input.square?.minCityArea, d.square.minCityArea, L.square.minCityArea.min, L.square.minCityArea.max);
    const square: TownSquareParams = {
        minCityArea,
        // Полный размер не меньше порога (с запасом, чтобы рост не вырождался в скачок)
        fullSizeArea: Math.max(
            minCityArea + 0.1,
            clamp(input.square?.fullSizeArea, d.square.fullSizeArea, L.square.fullSizeArea.min, L.square.fullSizeArea.max)
        ),
        minRadius,
        // Максимум не меньше минимума
        maxRadius: Math.max(
            minRadius,
            clamp(input.square?.maxRadius, d.square.maxRadius, L.square.maxRadius.min, L.square.maxRadius.max)
        ),
        gap: clamp(input.square?.gap, d.square.gap, L.square.gap.min, L.square.gap.max),
        approachRatio: clamp(
            input.square?.approachRatio,
            d.square.approachRatio,
            L.square.approachRatio.min,
            L.square.approachRatio.max
        ),
        approachMin,
        approachMax: Math.max(
            approachMin,
            clamp(input.square?.approachMax, d.square.approachMax, L.square.approachMax.min, L.square.approachMax.max)
        ),
        passWidth: clamp(input.square?.passWidth, d.square.passWidth, L.square.passWidth.min, L.square.passWidth.max),
        segments: clampInt(input.square?.segments, d.square.segments, L.square.segments.min, L.square.segments.max),
    };

    const streets: TownStreetParams = {
        blockSize: clamp(input.streets?.blockSize, d.streets.blockSize, L.streets.blockSize.min, L.streets.blockSize.max),
        keepFraction: clamp(
            input.streets?.keepFraction,
            d.streets.keepFraction,
            L.streets.keepFraction.min,
            L.streets.keepFraction.max
        ),
        mainSmoothing: clampInt(
            input.streets?.mainSmoothing,
            d.streets.mainSmoothing,
            L.streets.mainSmoothing.min,
            L.streets.mainSmoothing.max
        ),
        sideSmoothing: clampInt(
            input.streets?.sideSmoothing,
            d.streets.sideSmoothing,
            L.streets.sideSmoothing.min,
            L.streets.sideSmoothing.max
        ),
        archRun: clamp(input.streets?.archRun, d.streets.archRun, L.streets.archRun.min, L.streets.archRun.max),
        entranceMinSep: clamp(
            input.streets?.entranceMinSep,
            d.streets.entranceMinSep,
            L.streets.entranceMinSep.min,
            L.streets.entranceMinSep.max
        ),
        maxRays: clampInt(input.streets?.maxRays, d.streets.maxRays, L.streets.maxRays.min, L.streets.maxRays.max),
        raySep: clamp(input.streets?.raySep, d.streets.raySep, L.streets.raySep.min, L.streets.raySep.max),
        farRoads: clampInt(input.streets?.farRoads, d.streets.farRoads, L.streets.farRoads.min, L.streets.farRoads.max),
        farCover: clamp(input.streets?.farCover, d.streets.farCover, L.streets.farCover.min, L.streets.farCover.max),
        wobble: clamp(input.streets?.wobble, d.streets.wobble, L.streets.wobble.min, L.streets.wobble.max),
        mainWidth: clamp(input.streets?.mainWidth, d.streets.mainWidth, L.streets.mainWidth.min, L.streets.mainWidth.max),
        sideWidth: clamp(input.streets?.sideWidth, d.streets.sideWidth, L.streets.sideWidth.min, L.streets.sideWidth.max),
        minLength: clamp(input.streets?.minLength, d.streets.minLength, L.streets.minLength.min, L.streets.minLength.max),
    };

    const h = input.houses;
    const H = L.houses;
    const widthMin = clamp(h?.widthMin, d.houses.widthMin, H.size.min, H.size.max);
    const depthMin = clamp(h?.depthMin, d.houses.depthMin, H.size.min, H.size.max);
    const wallHeightMin = clamp(h?.wallHeightMin, d.houses.wallHeightMin, H.height.min, H.height.max);
    const roofHeightMin = clamp(h?.roofHeightMin, d.houses.roofHeightMin, H.height.min, H.height.max);
    const gapMin = clamp(h?.gapMin, d.houses.gapMin, H.gap.min, H.gap.max);
    const houses: TownHouseParams = {
        fill: clamp(h?.fill, d.houses.fill, H.fill.min, H.fill.max),
        scale: clamp(h?.scale, d.houses.scale, H.scale.min, H.scale.max),
        // Для каждой пары «максимум не меньше минимума»
        widthMin,
        widthMax: Math.max(widthMin, clamp(h?.widthMax, d.houses.widthMax, H.size.min, H.size.max)),
        depthMin,
        depthMax: Math.max(depthMin, clamp(h?.depthMax, d.houses.depthMax, H.size.min, H.size.max)),
        wallHeightMin,
        wallHeightMax: Math.max(wallHeightMin, clamp(h?.wallHeightMax, d.houses.wallHeightMax, H.height.min, H.height.max)),
        roofHeightMin,
        roofHeightMax: Math.max(roofHeightMin, clamp(h?.roofHeightMax, d.houses.roofHeightMax, H.height.min, H.height.max)),
        setback: clamp(h?.setback, d.houses.setback, H.setback.min, H.setback.max),
        gapMin,
        gapMax: Math.max(gapMin, clamp(h?.gapMax, d.houses.gapMax, H.gap.min, H.gap.max)),
        yawJitter: clamp(h?.yawJitter, d.houses.yawJitter, H.yawJitter.min, H.yawJitter.max),
        apexJitter: clamp(h?.apexJitter, d.houses.apexJitter, H.apexJitter.min, H.apexJitter.max),
        roofOverhang: clamp(h?.roofOverhang, d.houses.roofOverhang, H.roofOverhang.min, H.roofOverhang.max),
        sink: clamp(h?.sink, d.houses.sink, H.sink.min, H.sink.max),
        squareRing: bool(h?.squareRing, d.houses.squareRing),
    };

    const colors: TownColors = {
        square: color(input.colors?.square, d.colors.square),
        mainStreet: color(input.colors?.mainStreet, d.colors.mainStreet),
        sideStreet: color(input.colors?.sideStreet, d.colors.sideStreet),
        wall: color(input.colors?.wall, d.colors.wall),
        roofA: color(input.colors?.roofA, d.colors.roofA),
        roofB: color(input.colors?.roofB, d.colors.roofB),
        roofC: color(input.colors?.roofC, d.colors.roofC),
    };

    const A = L.animation;
    return {
        enabled: bool(input.enabled, d.enabled),
        seed: typeof input.seed === 'string' ? input.seed.slice(0, 64) : d.seed,
        edgeInset: clamp(input.edgeInset, d.edgeInset, L.edgeInset.min, L.edgeInset.max),
        square,
        streets,
        houses,
        colors,
        animation: {
            riseFraction: clamp(input.animation?.riseFraction, d.animation.riseFraction, A.riseFraction.min, A.riseFraction.max),
            startDelay: clamp(input.animation?.startDelay, d.animation.startDelay, A.startDelay.min, A.startDelay.max),
            stagger: clamp(input.animation?.stagger, d.animation.stagger, A.stagger.min, A.stagger.max),
            buckets: clampInt(input.animation?.buckets, d.animation.buckets, A.buckets.min, A.buckets.max),
        },
    };
}

/** Слияние поправки с текущими параметрами: вложенные группы дополняются, а не заменяются */
export function mergeTownParams(current: TownParams, patch: TownParamsInput): TownParams {
    return resolveTownParams({
        ...current,
        ...patch,
        square: { ...current.square, ...patch.square },
        streets: { ...current.streets, ...patch.streets },
        houses: { ...current.houses, ...patch.houses },
        colors: { ...current.colors, ...patch.colors },
        animation: { ...current.animation, ...patch.animation },
    });
}

/**
 * Ключ кэша мешей застройки. Анимация в него не входит: она не меняет геометрию,
 * а число частей роста (`buckets`) добавлено отдельно — от него зависит разбиение мешей.
 */
export const townParamsKey = (params: TownParams): string =>
    JSON.stringify({ ...params, animation: { buckets: params.animation.buckets } });

// ============================================
// 🌱 РОСТ ИЗ ЗЕМЛИ
// ============================================

/** Линейный прогресс анимации (0–1) через `elapsedMs`; вне диапазона — 0 и 1 */
export function townProgressAt(elapsedMs: number, durationMs: number): number {
    if (elapsedMs <= 0) return 0;
    if (elapsedMs >= durationMs || durationMs <= 0) return 1;
    return elapsedMs / durationMs;
}

/**
 * Рост одного дома (0 — под землёй, 1 — полная высота) при линейном прогрессе `progress`.
 * `delay` — расстояние от площади, нормированное в 0–1; `stagger` — доля прогресса, на которую
 * растянута волна. При stagger = 0 все дома растут одновременно, как стены.
 */
export function townHouseGrowth(progress: number, delay: number, stagger: number): number {
    const span = Math.max(1 - stagger, 1e-6);
    const t = (progress - delay * stagger) / span;
    return easeOutBack(Math.min(1, Math.max(0, t)));
}
