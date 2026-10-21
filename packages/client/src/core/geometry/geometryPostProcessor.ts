// packages/client/src/core/geometry/geometryPostProcessor.ts
// ============================================
// 🔧 ПОСТ-ПРОЦЕССОР ГЕОМЕТРИИ: ШУМ ПЕРЛИНА
// ============================================
// 🐛 ИСПРАВЛЕНО: шум не действовал на города и монастыри.
//   Причина — `ringNormalAt` суммировал разности по окну k = -2..2.
//   Слагаемые k и -k отличаются знаком (next и prev меняются местами),
//   поэтому сумма ВСЕГДА равнялась нулю → нормаль [0, 0] → точка
//   пропускалась. Дороги не пострадали, т.к. считали нормаль отдельно.
//   Теперь касательная = Σ (ring[i+k] − ring[i−k]) для k = 1..окно,
//   а нормаль ориентирована наружу (по знаку площади кольца).
//
// 🌟 КРАЙ ТАЙЛА И КОНЦЫ ДОРОГ:
//   Вес смещения w ∈ [0, 1] плавно растёт от 0 на краю тайла
//   (и на свободном конце дороги) до 1 на расстоянии `edgeFadeDistance`.
//     • смещение оси       = нормаль · шум · амплитуда · w
//     • нормаль «раздувания» = lerp(нормаль_без_шума, нормаль_после_шума, w)
//   На самом краю w = 0, поэтому нормаль строго перпендикулярна краю,
//   левая/правая точки лежат ровно на границе тайла и совпадают
//   с точками соседнего тайла. Поверх этого — страховочный clamp.
//
// 🎛 Всё настраивается через `NoiseSettings` (см. песочницу).
// ============================================
import type { Point, Ring, MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import { createSeededRandom } from '@fiefdom/shared/prng/seedRandom';
import { computeLineNormals, type TessellatedLine } from './tessellate';
import type { TessellationResult } from './types';
import { createNoise2D, createFBM, type Noise2D } from './generators/perlin';
import { HALF } from './generators/sides';

// ============================================
// ⚙️ ПАРАМЕТРЫ ШУМА
// ============================================

/** Форма нарастания смещения от края тайла к центру */
export type EdgeFadeCurve = 'linear' | 'smoothstep' | 'smootherstep';

export interface NoiseSettings {
    // --- Амплитуда (юниты) ---
    /** Амплитуда смещения контуров городов/монастырей */
    areaAmplitude: number;
    /** Амплитуда смещения осевой линии дорог */
    lineAmplitude: number;

    // --- Частота (1/юнит). Длина волны ≈ 1 / частота ---
    areaFrequency: number;
    lineFrequency: number;

    // --- Октавы (fBm) ---
    /** Количество октав (1 = чистый Перлин) */
    octaves: number;
    /** Множитель частоты между октавами */
    lacunarity: number;
    /** Множитель амплитуды между октавами (persistence) */
    gain: number;

    // --- Область выборки шума ---
    /** Добавлять к координатам шума сдвиг, выведенный из seed.
     *  Без него шум в начале координат всегда ≈ 0 (узел решётки). */
    useSeedOffset: boolean;
    /** Ручной сдвиг по X (в единицах решётки шума) */
    offsetX: number;
    /** Ручной сдвиг по Y (в единицах решётки шума) */
    offsetY: number;

    // --- Нормали областей ---
    /** Полуширина окна (в вершинах) для оценки нормали контура */
    normalWindow: number;

    // --- Сглаживание после шума ---
    /** Число итераций сглаживания Лапласа (0 = выключено) */
    smoothIterations: number;
    /** Сила сглаживания 0..1 (0.5 = классические веса 0.25/0.5/0.25) */
    smoothStrength: number;

    // --- Подготовка контура ---
    /** Точки ближе этого расстояния считаются дубликатами */
    minPointDistance: number;

    // --- Край тайла / концы дороги ---
    /** Зона «мёртвой» границы: точки ближе — не смещаются */
    boundaryEpsilon: number;
    /** Расстояние, на котором смещение нарастает от 0 до 100% (0 = резкая граница) */
    edgeFadeDistance: number;
    /** Форма нарастания */
    edgeFadeCurve: EdgeFadeCurve;
    /** Выравнивать нормаль «раздувания» дороги к исходной при приближении к краю */
    alignNormals: boolean;
    /** Страховочное ограничение: ни одна точка не выходит за тайл */
    clampToTile: boolean;
    /** Отступ от границы тайла для clamp (юниты) */
    clampMargin: number;

    // --- Ширина дороги ---
    /** Вариация полуширины дороги по шуму (± юниты). 0 = ширина постоянна */
    widthVariation: number;
}

export const NOISE_PARAMS: Readonly<NoiseSettings> = {
    areaAmplitude: 2.5,
    lineAmplitude: 1.5,
    areaFrequency: 0.05,
    lineFrequency: 0.02,
    octaves: 2,
    lacunarity: 2.0,
    gain: 0.5,
    useSeedOffset: true,
    offsetX: 0,
    offsetY: 0,
    normalWindow: 2,
    smoothIterations: 1,
    smoothStrength: 0.5,
    minPointDistance: 0.3,
    boundaryEpsilon: 0.5,
    edgeFadeDistance: 18,
    edgeFadeCurve: 'smoothstep',
    alignNormals: true,
    clampToTile: true,
    clampMargin: 0,
    widthVariation: 0,
};

export interface NoiseOptions extends Partial<NoiseSettings> {
    readonly seed: string;
    readonly enabled?: boolean;
    /** Общая частота: используется, если areaFrequency/lineFrequency не заданы */
    readonly frequency?: number;
}

const num = (v: number | undefined, d: number, min: number, max: number): number => {
    const x = typeof v === 'number' && Number.isFinite(v) ? v : d;
    return Math.min(max, Math.max(min, x));
};

/** Достраивает частичные настройки значениями по умолчанию и приводит к допустимым диапазонам */
export function resolveNoiseSettings(
    o: Partial<NoiseSettings> & { frequency?: number } = {}
): NoiseSettings {
    const d = NOISE_PARAMS;
    return {
        areaAmplitude: num(o.areaAmplitude, d.areaAmplitude, 0, 1000),
        lineAmplitude: num(o.lineAmplitude, d.lineAmplitude, 0, 1000),
        areaFrequency: num(o.areaFrequency ?? o.frequency, d.areaFrequency, 1e-4, 10),
        lineFrequency: num(o.lineFrequency ?? o.frequency, d.lineFrequency, 1e-4, 10),
        octaves: Math.round(num(o.octaves, d.octaves, 1, 8)),
        lacunarity: num(o.lacunarity, d.lacunarity, 1, 6),
        gain: num(o.gain, d.gain, 0.01, 1),
        useSeedOffset: o.useSeedOffset ?? d.useSeedOffset,
        offsetX: num(o.offsetX, d.offsetX, -1000, 1000),
        offsetY: num(o.offsetY, d.offsetY, -1000, 1000),
        normalWindow: Math.round(num(o.normalWindow, d.normalWindow, 1, 12)),
        smoothIterations: Math.round(num(o.smoothIterations, d.smoothIterations, 0, 20)),
        smoothStrength: num(o.smoothStrength, d.smoothStrength, 0, 1),
        minPointDistance: num(o.minPointDistance, d.minPointDistance, 0, 20),
        boundaryEpsilon: num(o.boundaryEpsilon, d.boundaryEpsilon, 0, 20),
        edgeFadeDistance: num(o.edgeFadeDistance, d.edgeFadeDistance, 0, HALF * 2),
        edgeFadeCurve: o.edgeFadeCurve ?? d.edgeFadeCurve,
        alignNormals: o.alignNormals ?? d.alignNormals,
        clampToTile: o.clampToTile ?? d.clampToTile,
        clampMargin: num(o.clampMargin, d.clampMargin, 0, HALF),
        widthVariation: num(o.widthVariation, d.widthVariation, 0, HALF),
    };
}

// ============================================
// 🌊 ГЕНЕРАТОР ШУМА
// ============================================

interface NoiseSampler {
    readonly area: Noise2D;
    readonly line: Noise2D;
    readonly width: Noise2D;
}

/**
 * Строит три выборки шума с общей перестановочной таблицей (seed),
 * но разной частотой/смещением. Координаты — в системе тайла [-50, 50].
 */
function createSampler(seed: string, s: NoiseSettings): NoiseSampler {
    const base = createNoise2D(seed);
    const fbm = s.octaves > 1 ? createFBM(base, s.octaves, s.lacunarity, s.gain) : base;

    let ox = s.offsetX;
    let oy = s.offsetY;
    if (s.useSeedOffset) {
        const rng = createSeededRandom(`${seed}::noise-offset`);
        ox += rng() * 128 + 0.37;
        oy += rng() * 128 + 0.61;
    }

    const make = (freq: number, shiftX = 0, shiftY = 0): Noise2D =>
        (x, y) => fbm(x * freq + ox + shiftX, y * freq + oy + shiftY);

    return {
        area: make(s.areaFrequency),
        line: make(s.lineFrequency),
        // другая часть поля, чтобы ширина не была копией смещения оси
        width: make(s.lineFrequency * 1.7, 41.3, 17.9),
    };
}

// ============================================
// 🛠️ ХЕЛПЕРЫ
// ============================================

function dist2d(a: Point, b: Point): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Профиль нарастания t ∈ [0, 1] → [0, 1] */
function fadeShape(t: number, curve: EdgeFadeCurve): number {
    const x = clamp01(t);
    switch (curve) {
        case 'linear':
            return x;
        case 'smootherstep':
            return x * x * x * (x * (x * 6 - 15) + 10);
        case 'smoothstep':
        default:
            return x * x * (3 - 2 * x);
    }
}

/**
 * Вес смещения по расстоянию до «жёсткого» края (граница тайла / конец дороги).
 * 0 на самом краю и в зоне boundaryEpsilon, 1 дальше edgeFadeDistance.
 */
function edgeWeight(distance: number, s: NoiseSettings): number {
    const d = distance - s.boundaryEpsilon;
    if (d <= 0) return 0;
    if (s.edgeFadeDistance <= 1e-6) return 1;
    return fadeShape(d / s.edgeFadeDistance, s.edgeFadeCurve);
}

/** Расстояние от точки до ближайшей стороны квадрата тайла (0 на границе и снаружи) */
function distanceToTileEdge(p: Point): number {
    return Math.max(0, HALF - Math.max(Math.abs(p[0]), Math.abs(p[1])));
}

/** Ограничивает точку квадратом тайла (с отступом) */
function clampPoint(p: Point, margin: number): Point {
    const lim = HALF - margin;
    const x = p[0] > lim ? lim : p[0] < -lim ? -lim : p[0];
    const y = p[1] > lim ? lim : p[1] < -lim ? -lim : p[1];
    return x === p[0] && y === p[1] ? p : [x, y];
}

/** Знаковая площадь кольца (> 0 — обход против часовой в математических осях) */
function ringSignedArea(ring: Ring): number {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
    }
    return area / 2;
}

/**
 * 🐛➜✅ Нормали замкнутого контура, направленные НАРУЖУ.
 *
 * Касательная = Σ (ring[i+k] − ring[i−k]) для k = 1..window.
 * (Старая версия суммировала k от −window до +window, и слагаемые
 * попарно взаимно уничтожались → нормаль всегда была нулевой.)
 */
function ringNormals(ring: Ring, window: number): Point[] {
    const n = ring.length;
    const w = Math.max(1, Math.min(window, Math.floor((n - 1) / 2)));
    const sign = ringSignedArea(ring) >= 0 ? 1 : -1;
    const normals: Point[] = new Array(n);

    for (let i = 0; i < n; i++) {
        let dx = 0;
        let dy = 0;
        for (let k = 1; k <= w; k++) {
            const next = ring[(i + k) % n];
            const prev = ring[(i - k + n) % n];
            dx += next[0] - prev[0];
            dy += next[1] - prev[1];
        }
        const len = Math.sqrt(dx * dx + dy * dy);
        normals[i] = len < 1e-9 ? [0, 0] : [(sign * dy) / len, (-sign * dx) / len];
    }
    return normals;
}

/** Убирает дубликаты в замкнутом кольце */
function deduplicateRing(ring: Ring, minDist: number): Ring {
    if (ring.length < 3 || minDist <= 0) return ring;

    const result: Point[] = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
        if (dist2d(result[result.length - 1], ring[i]) >= minDist) {
            result.push(ring[i]);
        }
    }
    if (result.length > 1 && dist2d(result[result.length - 1], result[0]) < minDist) {
        result.pop();
    }
    return result;
}

/** Убирает дубликаты в ОТКРЫТОЙ полилинии. Первая и последняя точки всегда сохраняются. */
function deduplicatePolyline(points: Ring, minDist: number): Ring {
    if (points.length < 3 || minDist <= 0) return points;

    const last = points[points.length - 1];
    const result: Point[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        if (dist2d(result[result.length - 1], points[i]) >= minDist) {
            result.push(points[i]);
        }
    }
    // Хвост: если предпоследняя слишком близко к концу — жертвуем ею, а не концом
    if (result.length > 1 && dist2d(result[result.length - 1], last) < minDist) {
        result.pop();
    }
    result.push(last);
    return result;
}

/**
 * Сглаживание Лапласа (Якоби). Закреплённые точки не двигаются.
 * Новая точка = lerp(p, среднее соседей, strength).
 * Это выпуклая комбинация исходных точек, поэтому из тайла она выйти не может.
 */
function smoothPoints(
    points: readonly Point[],
    pinned: readonly boolean[],
    closed: boolean,
    iterations: number,
    strength: number
): Point[] {
    let current: Point[] = [...points];
    const n = current.length;
    if (iterations <= 0 || strength <= 0 || n < 3) return current;

    for (let it = 0; it < iterations; it++) {
        const next: Point[] = new Array(n);
        for (let i = 0; i < n; i++) {
            const isEnd = !closed && (i === 0 || i === n - 1);
            if (pinned[i] || isEnd) {
                next[i] = current[i];
                continue;
            }
            const prev = current[(i - 1 + n) % n];
            const nxt = current[(i + 1) % n];
            const [x, y] = current[i];
            next[i] = [
                x + ((prev[0] + nxt[0]) / 2 - x) * strength,
                y + ((prev[1] + nxt[1]) / 2 - y) * strength,
            ];
        }
        current = next;
    }
    return current;
}

// ============================================
// 📐 ШУМ ДЛЯ КОЛЬЦА (город, монастырь)
// ============================================

function applyNoiseToRing(ring: Ring, noise: Noise2D, s: NoiseSettings): Ring {
    const amplitude = s.areaAmplitude;
    if (amplitude <= 0 || ring.length < 3) return ring;

    // Шаг 1: дедупликация (совпадающие точки ломают нормаль)
    const cleaned = deduplicateRing(ring, s.minPointDistance);
    if (cleaned.length < 3) return ring;

    // Шаг 2: смещение вдоль наружной нормали с весом по расстоянию до края тайла
    const normals = ringNormals(cleaned, s.normalWindow);
    const n = cleaned.length;
    const pinned: boolean[] = new Array(n);
    let moved: Point[] = new Array(n);

    for (let i = 0; i < n; i++) {
        const p = cleaned[i];
        const w = edgeWeight(distanceToTileEdge(p), s);
        pinned[i] = w <= 0;

        if (w <= 0) {
            moved[i] = p;
            continue;
        }

        const [nx, ny] = normals[i];
        const offset = noise(p[0], p[1]) * amplitude * w;
        moved[i] = [p[0] + nx * offset, p[1] + ny * offset];
    }

    // Шаг 3: сглаживание
    moved = smoothPoints(moved, pinned, true, s.smoothIterations, s.smoothStrength);

    // Шаг 4: страховка
    return s.clampToTile ? moved.map(p => clampPoint(p, s.clampMargin)) : moved;
}

// ============================================
// 🛤️ ШУМ ДЛЯ ДОРОГИ
// ============================================

function applyNoiseToTessellatedLine(
    tessellated: TessellatedLine,
    sampler: NoiseSampler,
    s: NoiseSettings
): TessellatedLine {
    const amplitude = s.lineAmplitude;
    const widthVar = s.widthVariation;
    if ((amplitude <= 0 && widthVar <= 0) || tessellated.center.length < 2) {
        return tessellated;
    }

    const halfWidth = tessellated.halfWidth;

    // Шаг 1: дедупликация оси (концы сохраняются)
    const center = deduplicatePolyline(tessellated.center, s.minPointDistance);
    if (center.length < 2) return tessellated;
    const count = center.length;

    // Шаг 2: нормали ИСХОДНОЙ оси — они же задают направление на краю тайла
    const baseNormals = computeLineNormals(center);

    // Шаг 3: веса. Смещение гаснет и у края тайла, и у свободных концов оси
    //         (там дорога стыкуется с площадью / городом / монастырём).
    const arc: number[] = new Array(count);
    arc[0] = 0;
    for (let i = 1; i < count; i++) arc[i] = arc[i - 1] + dist2d(center[i - 1], center[i]);
    const total = arc[count - 1];

    const weights: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
        weights[i] = Math.min(
            edgeWeight(distanceToTileEdge(center[i]), s),
            edgeWeight(arc[i], s),
            edgeWeight(total - arc[i], s)
        );
    }

    // Шаг 4: смещаем ось вдоль исходной нормали
    const pinned = weights.map(w => w <= 0);
    let moved: Point[] = new Array(count);
    for (let i = 0; i < count; i++) {
        const [x, y] = center[i];
        if (weights[i] <= 0 || amplitude <= 0) {
            moved[i] = center[i];
            continue;
        }
        const offset = sampler.line(x, y) * amplitude * weights[i];
        moved[i] = [x + baseNormals[i][0] * offset, y + baseNormals[i][1] * offset];
    }

    // Шаг 5: сглаживание оси (концы закреплены)
    moved = smoothPoints(moved, pinned, false, s.smoothIterations, s.smoothStrength);

    // Шаг 6: «раздувание». Нормаль плавно переходит от исходной (на краю)
    //         к нормали зашумлённой оси (в глубине тайла).
    const noisedNormals = computeLineNormals(moved);
    const noisedCenter: Point[] = new Array(count);
    const left: Point[] = new Array(count);
    const right: Point[] = new Array(count);

    for (let i = 0; i < count; i++) {
        const w = weights[i];
        const [bx, by] = baseNormals[i];
        let [mx, my] = noisedNormals[i];
        if (bx * mx + by * my < 0) {
            mx = -mx;
            my = -my;
        }

        let nx = bx;
        let ny = by;
        if (!s.alignNormals) {
            nx = mx;
            ny = my;
        } else if (w > 0) {
            nx = bx + (mx - bx) * w;
            ny = by + (my - by) * w;
            const len = Math.sqrt(nx * nx + ny * ny);
            if (len > 1e-9) {
                nx /= len;
                ny /= len;
            } else {
                nx = bx;
                ny = by;
            }
        }

        let hw = halfWidth;
        if (widthVar > 0 && w > 0) {
            const [cx, cy] = center[i];
            hw = Math.max(0.5, halfWidth + sampler.width(cx, cy) * widthVar * w);
        }

        const [cx, cy] = moved[i];
        noisedCenter[i] = [cx, cy];
        left[i] = [cx + nx * hw, cy + ny * hw];
        right[i] = [cx - nx * hw, cy - ny * hw];
    }

    const m = s.clampMargin;
    return s.clampToTile
        ? {
            center: noisedCenter.map(p => clampPoint(p, m)),
            left: left.map(p => clampPoint(p, m)),
            right: right.map(p => clampPoint(p, m)),
            halfWidth,
        }
        : { center: noisedCenter, left, right, halfWidth };
}

// ============================================
// 🩺 ДИАГНОСТИКА
// ============================================

/**
 * Максимальный выход геометрии за квадрат тайла (юниты).
 * 0 — вся геометрия внутри тайла.
 */
export function measureOutOfTile(tessellation: TessellationResult): number {
    let max = 0;
    const check = (p: Point): void => {
        max = Math.max(max, Math.abs(p[0]) - HALF, Math.abs(p[1]) - HALF);
    };

    for (const mp of tessellation.areas.values()) {
        for (const polygon of mp) for (const ring of polygon) ring.forEach(check);
    }
    for (const line of tessellation.lines.values()) {
        line.center.forEach(check);
        line.left.forEach(check);
        line.right.forEach(check);
    }
    return max < 1e-6 ? 0 : max;
}

// ============================================
// 📤 PUBLIC API
// ============================================

export function applyGeometryNoise(
    tessellation: TessellationResult,
    options: NoiseOptions
): TessellationResult {
    if (options.enabled === false) {
        console.log(`🔇 [NoisePostProcessor] Шум отключён`);
        return tessellation;
    }

    const settings = resolveNoiseSettings(options);
    const sampler = createSampler(options.seed, settings);

    console.log(
        `🌊 [NoisePostProcessor] seed="${options.seed}", ` +
        `area=${settings.areaAmplitude}@${settings.areaFrequency}, ` +
        `line=${settings.lineAmplitude}@${settings.lineFrequency}, ` +
        `octaves=${settings.octaves}, fade=${settings.edgeFadeDistance}/${settings.edgeFadeCurve}, ` +
        `align=${settings.alignNormals}, smooth=${settings.smoothIterations}`
    );

    // Шумим области
    const noisedAreas = new Map<string, MultiPolygon>();
    for (const [featureId, multiPolygon] of tessellation.areas) {
        noisedAreas.set(
            featureId,
            multiPolygon.map(polygon =>
                polygon.map(ring => applyNoiseToRing(ring, sampler.area, settings))
            )
        );
    }

    // Шумим дороги
    const noisedLines = new Map<string, TessellatedLine>();
    for (const [featureId, tessLine] of tessellation.lines) {
        noisedLines.set(featureId, applyNoiseToTessellatedLine(tessLine, sampler, settings));
    }

    return { areas: noisedAreas, lines: noisedLines };
}
