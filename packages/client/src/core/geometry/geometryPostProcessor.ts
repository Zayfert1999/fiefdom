// packages/client/src/core/geometry/geometryPostProcessor.ts
// ============================================
// 🔧 ПОСТ-ПРОЦЕССОР ГЕОМЕТРИИ: ШУМ ПЕРЛИНА
// ============================================
// ИЗМЕНЕНО: импорт типов из ./types вместо ./geometryProcessor
// для устранения циклической зависимости.
// ============================================
import type { Point, Ring, MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import type { TessellatedLine } from './tessellate';
// 🌟 ИМПОРТ ИЗ НОВОГО ФАЙЛА ТИПОВ (было: из ./geometryProcessor)
import type { TessellationResult } from './types';
import { createNoise2D, createFBM, type Noise2D } from './generators/perlin';
import { HALF } from './generators/sides';

// ============================================
// ⚙️ ПАРАМЕТРЫ ШУМА
// ============================================
export const NOISE_PARAMS = {
    /** Амплитуда шума для областей (города, монастыри), юниты */
    areaAmplitude: 2.5,
    /** Амплитуда шума для дорог, юниты */
    lineAmplitude: 1.5,
    /** Частота шума (больше = мельче детали) */
    frequency: 0.08,
    /** Количество октав FBM */
    octaves: 2,
    /** Допуск для определения границы тайла */
    boundaryEpsilon: 0.5,
} as const;

export interface NoiseOptions {
    /** Строка-зерно (обычно `tile.artId`) */
    readonly seed: string;
    /** Амплитуда для областей. По умолчанию 2.5 */
    readonly areaAmplitude?: number;
    /** Амплитуда для дорог. По умолчанию 1.5 */
    readonly lineAmplitude?: number;
    /** Частота шума. По умолчанию 0.08 */
    readonly frequency?: number;
    /** Количество октав. По умолчанию 2 */
    readonly octaves?: number;
    /** false = отключить шум полностью */
    readonly enabled?: boolean;
}

// ============================================
// 🛠️ ХЕЛПЕРЫ
// ============================================

/** Точка на границе тайла не должна смещаться */
function isOnBoundary(x: number, y: number, epsilon: number): boolean {
    return (
        Math.abs(Math.abs(x) - HALF) < epsilon ||
        Math.abs(Math.abs(y) - HALF) < epsilon
    );
}

/** Нормаль к контуру в точке i */
function ringNormalAt(ring: Ring, i: number): Point {
    const n = ring.length;
    const prev = ring[(i - 1 + n) % n];
    const next = ring[(i + 1) % n];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) return [0, 0];
    return [-dy / len, dx / len];
}

// ============================================
// 📐 ШУМ ДЛЯ КОЛЬЦА
// ============================================
function applyNoiseToRing(
    ring: Ring,
    noise: Noise2D,
    amplitude: number,
    frequency: number,
    epsilon: number
): Ring {
    if (amplitude <= 0 || ring.length < 3) return ring;
    const result: Point[] = new Array(ring.length);

    for (let i = 0; i < ring.length; i++) {
        const [x, y] = ring[i];
        if (isOnBoundary(x, y, epsilon)) {
            result[i] = ring[i];
            continue;
        }
        const [nx, ny] = ringNormalAt(ring, i);
        if (nx === 0 && ny === 0) {
            result[i] = ring[i];
            continue;
        }
        const noiseVal = noise(x * frequency, y * frequency);
        result[i] = [
            x + nx * noiseVal * amplitude,
            y + ny * noiseVal * amplitude,
        ];
    }
    return result;
}

// ============================================
// 🛤️ ШУМ ДЛЯ ДОРОГИ
// ============================================
function applyNoiseToTessellatedLine(
    tessellated: TessellatedLine,
    noise: Noise2D,
    amplitude: number,
    frequency: number,
    epsilon: number
): TessellatedLine {
    const { center, left, right } = tessellated;
    if (amplitude <= 0 || center.length < 2) return tessellated;

    const halfWidth = Math.sqrt(
        (left[0][0] - right[0][0]) ** 2 +
        (left[0][1] - right[0][1]) ** 2
    ) / 2;

    const noisedCenter: Point[] = new Array(center.length);
    for (let i = 0; i < center.length; i++) {
        const [x, y] = center[i];
        if (isOnBoundary(x, y, epsilon)) {
            noisedCenter[i] = center[i];
            continue;
        }
        const prev = center[Math.max(0, i - 1)];
        const next = center[Math.min(center.length - 1, i + 1)];
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) {
            noisedCenter[i] = center[i];
            continue;
        }
        const nx = -dy / len;
        const ny = dx / len;
        const noiseVal = noise(x * frequency, y * frequency);
        noisedCenter[i] = [x + nx * noiseVal * amplitude, y + ny * noiseVal * amplitude];
    }

    const noisedLeft: Point[] = new Array(noisedCenter.length);
    const noisedRight: Point[] = new Array(noisedCenter.length);
    for (let i = 0; i < noisedCenter.length; i++) {
        const prev = noisedCenter[Math.max(0, i - 1)];
        const next = noisedCenter[Math.min(noisedCenter.length - 1, i + 1)];
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) {
            noisedLeft[i] = noisedCenter[i];
            noisedRight[i] = noisedCenter[i];
            continue;
        }
        const nx = -dy / len;
        const ny = dx / len;
        noisedLeft[i] = [noisedCenter[i][0] + nx * halfWidth, noisedCenter[i][1] + ny * halfWidth];
        noisedRight[i] = [noisedCenter[i][0] - nx * halfWidth, noisedCenter[i][1] - ny * halfWidth];
    }

    return { center: noisedCenter, left: noisedLeft, right: noisedRight };
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

    const areaAmp = options.areaAmplitude ?? NOISE_PARAMS.areaAmplitude;
    const lineAmp = options.lineAmplitude ?? NOISE_PARAMS.lineAmplitude;
    const freq = options.frequency ?? NOISE_PARAMS.frequency;
    const octaves = options.octaves ?? NOISE_PARAMS.octaves;
    const eps = NOISE_PARAMS.boundaryEpsilon;

    const baseNoise = createNoise2D(options.seed);
    const noise = octaves > 1 ? createFBM(baseNoise, octaves) : baseNoise;

    console.log(
        `🌊 [NoisePostProcessor] seed="${options.seed}", ` +
        `areaAmp=${areaAmp}, lineAmp=${lineAmp}, freq=${freq}, octaves=${octaves}`
    );

    const noisedAreas = new Map<string, MultiPolygon>();
    for (const [featureId, multiPolygon] of tessellation.areas) {
        noisedAreas.set(featureId, multiPolygon.map(polygon =>
            polygon.map(ring => applyNoiseToRing(ring, noise, areaAmp, freq, eps))
        ));
    }

    const noisedLines = new Map<string, TessellatedLine>();
    for (const [featureId, tessLine] of tessellation.lines) {
        noisedLines.set(featureId, applyNoiseToTessellatedLine(tessLine, noise, lineAmp, freq, eps));
    }

    console.log(
        `✅ [NoisePostProcessor] Зашумлено: ${noisedAreas.size} областей, ${noisedLines.size} дорог`
    );

    return { areas: noisedAreas, lines: noisedLines };
}