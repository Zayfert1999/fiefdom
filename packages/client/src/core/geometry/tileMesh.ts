// packages/client/src/core/geometry/tileMesh.ts
// ============================================
// 🧱 МЕШ ТАЙЛА: ТРИАНГУЛЯЦИЯ ЧЕРЕЗ EARCUT
// ============================================
// Превращает результат процессора (полигоны фич) в готовые буферы
// для three: positions / normals / colors / indices + группы по фичам.
//
// Модуль чистый: без three и React, поэтому его можно тестировать
// в node и кэшировать как данные.
//
// 🌟 ЧТО ДАЁТ ВМЕСТО ExtrudeGeometry
//   • ОДИН меш на тайл вместо 6–7 отдельных (меньше draw call-ов)
//   • Группы по featureId — по индексу треугольника можно узнать,
//     в какую фичу кликнули / навели (подсветка регионов)
//   • Стены только там, где они видны: рёбра на границе тайла
//     не строятся (стык с соседом), поля стен не требуют вовсе
//   • Сглаженные нормали стен с углом складки (органичные контуры
//     без «фасеточности», но с чёткими углами)
//   • Один контракт для одиночного тайла и для доски с инстансингом
//
// 🧭 СИСТЕМА КООРДИНАТ
//   Точка контура (x, y) → мировая (x, высота, y).
//   Юг (y > 0) = +z = низ экрана при виде сверху — совпадает с 2D/SVG.
//   (Старый Tile3DView через rotateX(-π/2) отправлял y в -z, и 3D-вид
//   был зеркален по оси север-юг относительно 2D.)
//   Поворот тайла на θ° по часовой стрелке в 2D = rotation.y = -θ в three.
//
// ⛰️ РЕЛЬЕФ ПОЛЕЙ (mesh.terrain, шум Перлина в мировых координатах, см. terrain.ts)
//   Рельеф живёт не в мешах тайлов, а в ОБЩИХ мешах регионов (fieldRegions.ts): поля соседних
//   тайлов сшиваются в один полигон, и верх региона строится одной равномерной сеткой
//   (fieldTriangulation.ts: контур, разбитый на равные отрезки + треугольная решётка внутри,
//   триангуляция Делоне). Высота вершины — мировой шум; у рёбер дорог и городов рельеф затухает.
//   Стены поля идут по тем же вершинам контура, что и верх — щелей нет. Если равномерная
//   сетка не построилась, берётся запасной путь: earcut + измельчение длинных рёбер.
//   Дороги, площади, города и монастыри остаются плоскими и остаются в мешах тайлов.
//
//   Бандл тайла при включённом рельефе строится БЕЗ полей (fieldsOmitted) и несёт их полигоны
//   (fieldPolygons) для сборки регионов. buildTileMesh напрямую по умолчанию строит плоские поля.
//
// 📦 ЗАВИСИМОСТЬ: пакет `earcut` (+ `@types/earcut`)
// ============================================
import earcut from 'earcut';
import type { Point, Polygon, Ring } from '@fiefdom/shared/core/geometry.types';
import type { FeatureType, TileFeature } from '@fiefdom/shared/core/types';
import { HALF } from './generators/sides';
import type { FeatureSpot } from './spots';
import {
    DEFAULT_TERRAIN_PARAMS,
    createTerrainField,
    featureFactor,
    resolveTerrainParams,
    type TerrainField,
    type TerrainParams,
} from './terrain';
import { triangulateFieldUniform } from './fieldTriangulation';
import { SegmentGrid, edgeChain, refineTriangles } from './terrainSurface';
import type { TileGeometryResult } from './types';

// ============================================
// ⚙️ ПАРАМЕТРЫ МЕША
// ============================================

export type MeshSurface = 'base' | 'field' | 'road' | 'plaza' | 'city' | 'monastery';

export interface MeshParams {
    /** Высота подложки под всем тайлом (юниты) */
    baseHeight: number;
    /** Толщина слоя каждой поверхности НАД подложкой (юниты) */
    heights: Record<Exclude<MeshSurface, 'base'>, number>;
    /** Цвета в sRGB (#rrggbb) */
    colors: Record<MeshSurface, string>;
    /** Угол складки стен (градусы): мягче — сглаженные нормали, острее — отдельные */
    wallCreaseAngle: number;
    /** Строить ли стены на рёбрах, лежащих на границе тайла (и подложку) */
    boundaryWalls: boolean;
    /** Рельеф полей (карта высот или шум) */
    terrain: TerrainParams;
}

/** Значения повторяют прежний Tile3DView: подложка 4, поля 4, дороги/площади/города 2, монастырь 4 */
export const DEFAULT_MESH_PARAMS: Readonly<MeshParams> = {
    baseHeight: 4,
    heights: { field: 4, road: 2, plaza: 2, city: 2, monastery: 4 },
    colors: {
        base: '#8b7355',
        field: '#6a994e',
        road: '#c9b38c',
        plaza: '#ac9978',
        city: '#a67c52',
        monastery: '#d47843',
    },
    wallCreaseAngle: 35,
    boundaryWalls: false,
    terrain: DEFAULT_TERRAIN_PARAMS,
};

const finite = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export interface MeshParamsInput {
    baseHeight?: number;
    heights?: Partial<MeshParams['heights']>;
    colors?: Partial<MeshParams['colors']>;
    wallCreaseAngle?: number;
    boundaryWalls?: boolean;
    terrain?: Partial<TerrainParams>;
}

export function resolveMeshParams(partial?: MeshParamsInput): MeshParams {
    const d = DEFAULT_MESH_PARAMS;
    const heights = { ...d.heights };
    for (const key of Object.keys(heights) as (keyof MeshParams['heights'])[]) {
        heights[key] = Math.max(0.1, finite(partial?.heights?.[key], d.heights[key]));
    }
    return {
        baseHeight: Math.max(0, finite(partial?.baseHeight, d.baseHeight)),
        heights,
        colors: { ...d.colors, ...partial?.colors },
        wallCreaseAngle: Math.min(180, Math.max(0, finite(partial?.wallCreaseAngle, d.wallCreaseAngle))),
        boundaryWalls: partial?.boundaryWalls ?? d.boundaryWalls,
        terrain: resolveTerrainParams(partial?.terrain),
    };
}

// ============================================
// 📦 РЕЗУЛЬТАТ
// ============================================

export interface MeshGroup {
    readonly featureId: string;
    readonly surface: MeshSurface;
    /** Смещение в массиве индексов */
    readonly start: number;
    /** Число индексов (кратно 3) */
    readonly count: number;
}

export interface TileMeshStats {
    readonly vertices: number;
    readonly triangles: number;
    readonly topTriangles: number;
    readonly wallQuads: number;
    /** Макс. относительное расхождение площади триангуляции и площади полигона */
    readonly maxTopDeviation: number;
    /** Какой полигон дал это расхождение: `поверхность:фича` (для отчётов тестов) */
    readonly worstTopPolygon?: string;
    /** Стены, пропущенные на границе тайла */
    readonly skippedBoundaryEdges: number;
    /** Треугольников верха полей после измельчения под рельеф (0 — рельеф выключен) */
    readonly terrainTriangles?: number;
    /** Полей, для которых равномерная сетка не построилась и взят запасной путь (earcut + измельчение) */
    readonly terrainFallbacks?: number;
}

export interface TileMeshData {
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    /** Линейные (не sRGB!) цвета: three трактует vertexColors как линейные */
    readonly colors: Float32Array;
    readonly indices: Uint32Array;
    readonly groups: readonly MeshGroup[];
    readonly stats: TileMeshStats;
}

/** Минимальное описание фичи, нужное мешу */
export type MeshFeature = Pick<TileFeature, 'id' | 'type'>;

// ============================================
// 🎨 ЦВЕТ
// ============================================

function srgbToLinear(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** '#rrggbb' → линейные [r, g, b] */
export function hexToLinear(hex: string): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return [1, 0, 1];
    const n = parseInt(m[1], 16);
    return [
        srgbToLinear(((n >> 16) & 255) / 255),
        srgbToLinear(((n >> 8) & 255) / 255),
        srgbToLinear((n & 255) / 255),
    ];
}

// ============================================
// 📐 ХЕЛПЕРЫ КОЛЕЦ
// ============================================

/** Убирает подряд идущие дубликаты и замыкающую точку, совпадающую с первой */
function cleanRing(ring: Ring): Point[] {
    const out: Point[] = [];
    for (const p of ring) {
        const prev = out[out.length - 1];
        if (!prev || Math.abs(prev[0] - p[0]) > 1e-9 || Math.abs(prev[1] - p[1]) > 1e-9) out.push(p);
    }
    while (out.length > 1) {
        const first = out[0];
        const last = out[out.length - 1];
        if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop();
        else break;
    }
    return out;
}

/** Знаковая площадь (в плоскости x, y контура) */
function signedArea(ring: readonly Point[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        a += x1 * y2 - x2 * y1;
    }
    return a / 2;
}

/** Координата лежит на линии сетки доски (граница клеток: HALF + k·TILE) */
function onGridLine(v: number): boolean {
    const t = (v - HALF) / (2 * HALF);
    return Math.abs(t - Math.round(t)) * 2 * HALF < 1e-6;
}

/**
 * Ребро целиком лежит на границе клеток доски. Для локальных координат тайла это стороны ±HALF,
 * для мировых координат региона — любая линия сетки (там, где соседа нет, ребро остаётся границей).
 */
function isBoundaryEdge(a: Point, b: Point): boolean {
    const eps = 1e-6;
    const onX = Math.abs(a[0] - b[0]) < eps && onGridLine(a[0]);
    const onY = Math.abs(a[1] - b[1]) < eps && onGridLine(a[1]);
    return onX || onY;
}

// ============================================
// 🏗️ ПОСТРОИТЕЛЬ БУФЕРОВ
// ============================================

/** Как стены поля берут высоты и разрезы из измельчённой крышки */
interface WallProfile {
    /** Для каждого ребра кольца — вершины крышки вдоль него (от начала до конца ребра) */
    readonly chains: readonly (readonly number[])[];
    readonly xz: readonly number[];
    /** Высота верха в каждой вершине крышки */
    readonly ys: ArrayLike<number>;
}

/** Всё, что нужно построителю для рельефа одного тайла */
interface TerrainContext {
    readonly params: TerrainParams;
    readonly field: TerrainField;
}

class MeshBuilder {
    readonly pos: number[] = [];
    readonly nor: number[] = [];
    readonly col: number[] = [];
    readonly idx: number[] = [];
    readonly groups: MeshGroup[] = [];

    topTriangles = 0;
    wallQuads = 0;
    maxDeviation = 0;
    worstPolygon = '';
    /** Полигон, который сейчас строится (для диагностики расхождения площади) */
    private currentLabel = '';
    skippedBoundary = 0;
    terrainTriangles = 0;
    terrainFallbacks = 0;

    constructor(private readonly params: MeshParams) {}

    private vertex(x: number, y: number, z: number, n: readonly [number, number, number], c: readonly number[]): number {
        const index = this.pos.length / 3;
        this.pos.push(x, y, z);
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(c[0], c[1], c[2]);
        return index;
    }

    private trackDeviation(deviation: number): void {
        if (deviation > this.maxDeviation) {
            this.maxDeviation = deviation;
            this.worstPolygon = this.currentLabel;
        }
    }

    /** Один полигон: крышка + стены. Записывается как одна группа. */
    addPolygon(featureId: string, surface: MeshSurface, polygon: Polygon, top: number, bottom: number): void {
        const rings = polygon.map(cleanRing).filter((r) => r.length >= 3);
        if (rings.length === 0 || signedArea(rings[0]) === 0) return;
        this.currentLabel = `${surface}:${featureId}`;

        const color = hexToLinear(this.params.colors[surface]);
        const start = this.idx.length;

        if (top > bottom) this.addCap(rings, top, color);
        rings.forEach((ring, ringIndex) => this.addWalls(ring, ringIndex > 0, top, bottom, color));

        const count = this.idx.length - start;
        if (count > 0) this.groups.push({ featureId, surface, start, count });
    }

    /** Только стены (подложка: крышку скрывают поверхности над ней) */
    addWallsOnly(featureId: string, surface: MeshSurface, ring: Ring, top: number, bottom: number): void {
        const cleaned = cleanRing(ring);
        if (cleaned.length < 3) return;
        const color = hexToLinear(this.params.colors[surface]);
        const start = this.idx.length;
        this.addWalls(cleaned, false, top, bottom, color);
        const count = this.idx.length - start;
        if (count > 0) this.groups.push({ featureId, surface, start, count });
    }

    // --- Триангуляция полигона с дырками ---
    /** earcut + единая ориентация треугольников (нормаль вверх) + контроль площади */
    private triangulate(rings: Point[][]): {
        flat: number[];
        offsets: number[];
        triangles: number[];
    } {
        const flat: number[] = [];
        const holes: number[] = [];
        const offsets: number[] = [];
        rings.forEach((ring, i) => {
            if (i > 0) holes.push(flat.length / 2);
            offsets.push(flat.length / 2);
            for (const [x, z] of ring) flat.push(x, z);
        });

        const raw = earcut(flat, holes, 2);
        const triangles: number[] = [];
        let trianglesArea = 0;
        for (let t = 0; t < raw.length; t += 3) {
            let a = raw[t];
            let b = raw[t + 1];
            let c = raw[t + 2];

            const ax = flat[a * 2], az = flat[a * 2 + 1];
            const bx = flat[b * 2], bz = flat[b * 2 + 1];
            const cx = flat[c * 2], cz = flat[c * 2 + 1];
            const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

            // Нормаль (B−A)×(C−A) смотрит вверх, когда cross < 0 (в плоскости x, z)
            if (cross > 0) [b, c] = [c, b];
            trianglesArea += Math.abs(cross) / 2;
            triangles.push(a, b, c);
        }

        // Контроль триангуляции: сумма площадей против площади полигона
        const polygonArea = rings.reduce(
            (sum, ring, i) => sum + (i === 0 ? 1 : -1) * Math.abs(signedArea(ring)),
            0
        );
        if (polygonArea > 1e-9) {
            this.trackDeviation(Math.abs(trianglesArea - polygonArea) / polygonArea);
        }

        return { flat, offsets, triangles };
    }

    // --- Верхняя крышка (плоская) ---
    private addCap(rings: Point[][], y: number, color: readonly number[]): void {
        const { flat, triangles } = this.triangulate(rings);
        const base = this.pos.length / 3;
        for (let i = 0; i < flat.length; i += 2) {
            this.vertex(flat[i], y, flat[i + 1], [0, 1, 0], color);
        }
        for (let t = 0; t < triangles.length; t += 3) {
            this.idx.push(base + triangles[t], base + triangles[t + 1], base + triangles[t + 2]);
            this.topTriangles++;
        }
    }

    // --- Верх поля с рельефом ---
    /**
     * Поле с рельефом: крышка измельчается, вершины получают высоту,
     * стены идут по разрезанным рёбрам. Одна группа на полигон, как и у плоских поверхностей.
     */
    addFieldPolygon(featureId: string, polygon: Polygon, top: number, bottom: number, terrain: TerrainContext): void {
        const rings = polygon.map(cleanRing).filter((r) => r.length >= 3);
        if (rings.length === 0 || signedArea(rings[0]) === 0 || !(top > bottom)) return;
        this.currentLabel = `field:${featureId}`;

        const tp = terrain.params;
        const baseColor = hexToLinear(this.params.colors.field);
        const start = this.idx.length;

        // 1) Равномерная сетка верха; нет — запасной путь (earcut + измельчение длинных рёбер)
        let surface: { xz: number[]; triangles: number[]; chains: number[][][] };
        // Лимит вершин задан на площадь одного тайла: большой регион получает пропорционально больше
        const area = rings.reduce((sum, ring, i) => sum + (i === 0 ? 1 : -1) * Math.abs(signedArea(ring)), 0);
        const budget = Math.round(tp.maxVertices * Math.max(1, area / (4 * HALF * HALF)));
        const grid = triangulateFieldUniform(rings, tp.gridStep, budget);
        if (grid) {
            surface = grid;
            this.trackDeviation(grid.areaDeviation);
        } else {
            this.terrainFallbacks++;
            const tri = this.triangulate(rings);
            const refined = refineTriangles(tri.flat, tri.triangles, tp.gridStep, budget);
            surface = {
                xz: refined.xz,
                triangles: refined.triangles,
                chains: rings.map((ring, r) =>
                    ring.map((_, i) =>
                        edgeChain(tri.offsets[r] + i, tri.offsets[r] + ((i + 1) % ring.length), refined.splits)
                    )
                ),
            };
        }
        const vertexCount = surface.xz.length / 2;

        // 2) Рёбра, у которых рельеф должен затухать: всё, что не лежит на границе клеток доски
        //    (то есть края дорог, площадей, городов, монастырей)
        const segments: number[] = [];
        if (tp.featureFade > 0) {
            for (const ring of rings) {
                for (let i = 0; i < ring.length; i++) {
                    const a = ring[i];
                    const b = ring[(i + 1) % ring.length];
                    if (!isBoundaryEdge(a, b)) segments.push(a[0], a[1], b[0], b[1]);
                }
            }
        }

        // 3) Высота каждой вершины (координаты полигона — мировые)
        const fadeIndex = segments.length > 0 ? new SegmentGrid(segments, tp.featureFade) : null;
        const ys = new Float64Array(vertexCount);
        const levels = new Float64Array(vertexCount);
        for (let v = 0; v < vertexCount; v++) {
            const x = surface.xz[v * 2];
            const z = surface.xz[v * 2 + 1];
            const factor = fadeIndex ? featureFactor(fadeIndex.distance(x, z, tp.featureFade), tp.featureFade) : 1;
            const level = terrain.field.elevation(x, z) * factor;
            levels[v] = level;
            ys[v] = top + tp.amplitude * level;
        }

        // 4) Нормали: сумма нормалей смежных граней, взвешенных площадью
        const nx = new Float64Array(vertexCount);
        const ny = new Float64Array(vertexCount);
        const nz = new Float64Array(vertexCount);
        const T = surface.triangles;
        for (let t = 0; t < T.length; t += 3) {
            const ia = T[t], ib = T[t + 1], ic = T[t + 2];
            const ux = surface.xz[ib * 2] - surface.xz[ia * 2];
            const uy = ys[ib] - ys[ia];
            const uz = surface.xz[ib * 2 + 1] - surface.xz[ia * 2 + 1];
            const wx = surface.xz[ic * 2] - surface.xz[ia * 2];
            const wy = ys[ic] - ys[ia];
            const wz = surface.xz[ic * 2 + 1] - surface.xz[ia * 2 + 1];
            const cx = uy * wz - uz * wy;
            const cy = uz * wx - ux * wz;
            const cz = ux * wy - uy * wx;
            for (const i of [ia, ib, ic]) {
                nx[i] += cx;
                ny[i] += cy;
                nz[i] += cz;
            }
        }

        // 5) Вершины верха: позиция, нормаль, цвет с подсветкой возвышенностей
        const base = this.pos.length / 3;
        for (let v = 0; v < vertexCount; v++) {
            const len = Math.hypot(nx[v], ny[v], nz[v]);
            const n: [number, number, number] = len > 1e-12 ? [nx[v] / len, ny[v] / len, nz[v] / len] : [0, 1, 0];
            const k = 1 + tp.heightTint * levels[v];
            const color = [Math.min(1, baseColor[0] * k), Math.min(1, baseColor[1] * k), Math.min(1, baseColor[2] * k)];
            this.vertex(surface.xz[v * 2], ys[v], surface.xz[v * 2 + 1], n, color);
        }
        for (let t = 0; t < T.length; t += 3) {
            this.idx.push(base + T[t], base + T[t + 1], base + T[t + 2]);
        }
        this.topTriangles += T.length / 3;
        this.terrainTriangles += T.length / 3;

        // 6) Стены по тем же разрезанным рёбрам и с теми же высотами
        rings.forEach((ring, ringIndex) =>
            this.addWalls(ring, ringIndex > 0, top, bottom, baseColor, {
                chains: surface.chains[ringIndex],
                xz: surface.xz,
                ys,
            })
        );

        const count = this.idx.length - start;
        if (count > 0) this.groups.push({ featureId, surface: 'field', start, count });
    }

    // --- Стены ---
    private addWalls(
        ring: Point[],
        isHole: boolean,
        top: number,
        bottom: number,
        color: readonly number[],
        profile?: WallProfile
    ): void {
        const n = ring.length;
        if (top <= bottom) return;

        // Нормаль наружу ИЗ материала: для внешнего кольца — наружу, для дырки — внутрь дырки
        const area = signedArea(ring);
        const sign = (isHole ? -1 : 1) * (area > 0 ? 1 : -1);

        const normals: [number, number][] = new Array(n);
        const skip: boolean[] = new Array(n);
        for (let i = 0; i < n; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % n];
            const dx = b[0] - a[0];
            const dz = b[1] - a[1];
            const len = Math.hypot(dx, dz) || 1;
            normals[i] = [(sign * dz) / len, (-sign * dx) / len];
            skip[i] = !this.params.boundaryWalls && isBoundaryEdge(a, b);
            if (skip[i]) this.skippedBoundary++;
        }

        const cosCrease = Math.cos((this.params.wallCreaseAngle * Math.PI) / 180);

        /** Нормаль в вершине между рёбрами e1 и e2: сглаженная или нормаль ребра own */
        const cornerNormal = (e1: number, e2: number, own: number): [number, number] => {
            if (skip[e1] || skip[e2]) return normals[own];
            const [ax, az] = normals[e1];
            const [bx, bz] = normals[e2];
            if (ax * bx + az * bz < cosCrease) return normals[own];
            const sx = ax + bx;
            const sz = az + bz;
            const len = Math.hypot(sx, sz);
            return len < 1e-9 ? normals[own] : [sx / len, sz / len];
        };

        for (let i = 0; i < n; i++) {
            if (skip[i]) continue;

            const a = ring[i];
            const b = ring[(i + 1) % n];
            const prev = (i - 1 + n) % n;
            const next = (i + 1) % n;
            const own = normals[i];
            const na = cornerNormal(prev, i, i);
            const nb = cornerNormal(i, next, i);

            // Точки стены вдоль ребра: две (плоский верх) или вся цепочка разрезов (рельеф)
            let pts: { x: number; z: number; top: number }[];
            if (profile) {
                const chain = profile.chains[i];
                pts = chain.map((v) => ({ x: profile.xz[v * 2], z: profile.xz[v * 2 + 1], top: profile.ys[v] }));
            } else {
                pts = [
                    { x: a[0], z: a[1], top },
                    { x: b[0], z: b[1], top },
                ];
            }

            // Геометрическая нормаль треугольника (v0, v1, v2) должна совпасть с нормалью ребра
            const ex = b[0] - a[0];
            const ez = b[1] - a[1];
            // (v1−v0) = (ex, 0, ez); (v2−v0) = (ex, h, ez);  cross.x = −h·ez,  cross.z = h·ex
            const facing = -ez * own[0] + ex * own[1];

            for (let j = 0; j + 1 < pts.length; j++) {
                const p = pts[j];
                const q = pts[j + 1];
                const np = j === 0 ? na : own;
                const nq = j + 2 === pts.length ? nb : own;

                const v0 = this.vertex(p.x, bottom, p.z, [np[0], 0, np[1]], color);
                const v1 = this.vertex(q.x, bottom, q.z, [nq[0], 0, nq[1]], color);
                const v2 = this.vertex(q.x, q.top, q.z, [nq[0], 0, nq[1]], color);
                const v3 = this.vertex(p.x, p.top, p.z, [np[0], 0, np[1]], color);

                if (facing >= 0) this.idx.push(v0, v1, v2, v0, v2, v3);
                else this.idx.push(v0, v2, v1, v0, v3, v2);
                this.wallQuads++;
            }
        }
    }

    finish(): TileMeshData {
        const triangles = this.idx.length / 3;
        return {
            positions: new Float32Array(this.pos),
            normals: new Float32Array(this.nor),
            colors: new Float32Array(this.col),
            indices: new Uint32Array(this.idx),
            groups: this.groups,
            stats: {
                vertices: this.pos.length / 3,
                triangles,
                topTriangles: this.topTriangles,
                wallQuads: this.wallQuads,
                maxTopDeviation: this.maxDeviation,
                worstTopPolygon: this.worstPolygon,
                skippedBoundaryEdges: this.skippedBoundary,
                terrainTriangles: this.terrainTriangles,
                terrainFallbacks: this.terrainFallbacks,
            },
        };
    }
}

// ============================================
// 🏛️ PUBLIC API
// ============================================

/**
 * Строит меш тайла из результата процессора.
 *
 * Уровни (от подложки): поле — baseHeight + heights.field, дорога/площадь/город —
 * baseHeight + heights.<тип>. Стены каждой поверхности идут от её верха до подложки.
 * У полей стены не нужны: любое их ребро граничит с более высокой поверхностью
 * либо лежит на границе тайла.
 *
 * С включённым рельефом (params.terrain) верх поля поднимается на 0..amplitude над плоским
 * уровнем. Рельеф затухает у дорог и городов, поэтому поле по-прежнему лежит не ниже соседей.
 */
/** Поля, которые нужно описать у FieldRegion: локальный полигон + кому принадлежит */
export interface FieldPolygonRef {
    readonly featureId: string;
    /** Локальные координаты тайла (без поворота) */
    readonly polygon: Polygon;
}

/** Полигоны полей тайла с владельцем: assignFieldFeatures сохраняет ссылку на полигон */
export function collectFieldPolygons(geometry: TileGeometryResult): FieldPolygonRef[] {
    const owner = new Map<Polygon, string>();
    for (const [featureId, multi] of geometry.assignments.fieldGeometries) {
        for (const polygon of multi) owner.set(polygon, featureId);
    }
    return geometry.fields.fieldPolygons.map((polygon, i) => ({
        featureId: owner.get(polygon) ?? `__field_${i}`,
        polygon,
    }));
}

export interface TileMeshOptions {
    /**
     * 'flat' — плоские поля прямо в меше тайла (по умолчанию);
     * 'none' — без полей: их строит общий меш региона (fieldRegions.ts).
     */
    readonly fields?: 'flat' | 'none';
}

export function buildTileMesh(
    geometry: TileGeometryResult,
    features: readonly MeshFeature[],
    params?: MeshParamsInput,
    options: TileMeshOptions = {}
): TileMeshData {
    const p = resolveMeshParams(params);
    const builder = new MeshBuilder(p);
    const typeOf = new Map<string, FeatureType>(features.map((f) => [f.id, f.type]));
    const top = (surface: Exclude<MeshSurface, 'base'>): number => p.baseHeight + p.heights[surface];

    // Подложка: только стены по периметру, и только когда нужны (иначе их скрывают соседи)
    if (p.boundaryWalls && p.baseHeight > 0) {
        const square: Ring = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
        builder.addWallsOnly('__base', 'base', square, p.baseHeight, 0);
    }

    // Поля: плоские (или вовсе без них, если их строит меш региона)
    if (options.fields !== 'none') {
        for (const { featureId, polygon } of collectFieldPolygons(geometry)) {
            builder.addPolygon(featureId, 'field', polygon, top('field'), p.baseHeight);
        }
    }

    // Дороги (после обрезки)
    for (const [featureId, multi] of geometry.clipping.clippedLines) {
        for (const polygon of multi) builder.addPolygon(featureId, 'road', polygon, top('road'), p.baseHeight);
    }

    // Площади
    geometry.decorations.plazas.forEach((ring, i) => {
        builder.addPolygon(`__plaza_${i}`, 'plaza', [ring], top('plaza'), p.baseHeight);
    });

    // Города и монастыри
    for (const [featureId, multi] of geometry.tessellation.areas) {
        const surface = typeOf.get(featureId) === 'monastery' ? 'monastery' : 'city';
        for (const polygon of multi) builder.addPolygon(featureId, surface, polygon, top(surface), p.baseHeight);
    }

    return builder.finish();
}

// ============================================
// 🌿 МЕШ РЕГИОНА ПОЛЕЙ
// ============================================

const terrainFieldCache = new Map<string, TerrainField>();

/** Поле высоты по параметрам (создание шума не бесплатно, а регионов много) */
function terrainFieldFor(tp: TerrainParams): TerrainField {
    const key = `${tp.seed}|${tp.frequency}|${tp.octaves}|${tp.lacunarity}|${tp.gain}|${tp.contrast}`;
    let field = terrainFieldCache.get(key);
    if (!field) {
        if (terrainFieldCache.size > 16) terrainFieldCache.clear();
        field = createTerrainField(tp);
        terrainFieldCache.set(key, field);
    }
    return field;
}

/**
 * Один меш на регион полей. Полигоны — в МИРОВЫХ координатах доски (после поворота и сдвига тайлов),
 * ровно такими, какие даёт buildFieldRegions. Все полигоны региона попадают в одну группу
 * (featureId = regionId, surface = 'field'), поэтому по индексу треугольника узнаётся регион.
 *
 * Рельеф выключен — плоский верх, но всё равно общий для региона.
 */
export function buildFieldRegionMesh(
    polygons: readonly Polygon[],
    regionId: string,
    params?: MeshParamsInput
): TileMeshData {
    const p = resolveMeshParams(params);
    const builder = new MeshBuilder(p);
    const top = p.baseHeight + p.heights.field;
    const tp = p.terrain;

    if (tp.enabled && tp.amplitude > 0) {
        const terrain: TerrainContext = { params: tp, field: terrainFieldFor(tp) };
        for (const polygon of polygons) builder.addFieldPolygon(regionId, polygon, top, p.baseHeight, terrain);
    } else {
        for (const polygon of polygons) builder.addPolygon(regionId, 'field', polygon, top, p.baseHeight);
    }
    const mesh = builder.finish();
    // Запасной путь даёт заметно худшую сетку (неравномерную, «кашу»): пусть это не проходит молча
    if ((mesh.stats.terrainFallbacks ?? 0) > 0) {
        console.warn(
            `[terrain] регион ${regionId}: равномерная сетка не построилась (${mesh.stats.terrainFallbacks} полиг.), взят запасной путь`
        );
    }
    return mesh;
}

/**
 * Угол rotation.y (радианы) для тайла, повёрнутого на θ° по часовой стрелке в 2D.
 * Поворот в three вокруг Y: x' = x·cosφ + z·sinφ, z' = −x·sinφ + z·cosφ.
 * Чтобы совпасть с 2D (x' = x·cosθ − y·sinθ, y' = x·sinθ + y·cosθ при y = z), φ = −θ.
 */
export function tileYaw(rotationDegrees: number): number {
    return (-rotationDegrees * Math.PI) / 180;
}

/** Группа, в которую попадает треугольник с данным индексом (для hover/клика) */
export function findMeshGroup(mesh: TileMeshData, faceIndex: number): MeshGroup | null {
    const offset = faceIndex * 3;
    for (const group of mesh.groups) {
        if (offset >= group.start && offset < group.start + group.count) return group;
    }
    return null;
}

/**
 * Высота верхней поверхности в точке (x, z) локальных координат тайла (без поворота) —
 * например, чтобы поставить мипл на холм. Берётся самая высокая верхняя грань над точкой;
 * null — под точкой нет верха (вне тайла). Перебор линейный: звать для единиц точек, не для тысяч.
 */
export function sampleMeshHeight(mesh: TileMeshData, x: number, z: number): number | null {
    const P = mesh.positions;
    const N = mesh.normals;
    const I = mesh.indices;
    let best: number | null = null;

    for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        // Верхние грани — те, у которых нормали вершин смотрят вверх (у стен ny = 0)
        if (N[a * 3 + 1] <= 0.01 || N[b * 3 + 1] <= 0.01 || N[c * 3 + 1] <= 0.01) continue;

        const ax = P[a * 3], az = P[a * 3 + 2];
        const bx = P[b * 3], bz = P[b * 3 + 2];
        const cx = P[c * 3], cz = P[c * 3 + 2];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-12) continue;

        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const l3 = 1 - l1 - l2;
        const eps = -1e-6;
        if (l1 < eps || l2 < eps || l3 < eps) continue;

        const y = l1 * P[a * 3 + 1] + l2 * P[b * 3 + 1] + l3 * P[c * 3 + 1];
        if (best === null || y > best) best = y;
    }
    return best;
}

// ============================================
// 📦 БАНДЛ ТАЙЛА
// ============================================

/** Всё, что нужно рендереру, интеракции и аудиту для одного тайла */
export interface TileBundle {
    readonly tileId: string;
    readonly features: readonly MeshFeature[];
    readonly geometry: TileGeometryResult;
    readonly mesh: TileMeshData;
    /** Споты мипла и щита по featureId (локальные координаты тайла без поворота) */
    readonly spots: ReadonlyMap<string, FeatureSpot>;
    /** Полигоны полей с владельцем — вход для сборки регионов (fieldRegions.ts) */
    readonly fieldPolygons: readonly FieldPolygonRef[];
    /** Меш тайла построен без полей: их рисует общий меш региона */
    readonly fieldsOmitted: boolean;
    /** Параметры меша, с которыми построен бандл (для сборки мешей регионов) */
    readonly meshParams: MeshParams;
}

export function buildTileBundle(
    source: {
        readonly tileId: string;
        readonly features: readonly MeshFeature[];
        readonly geometry: TileGeometryResult;
        readonly spots?: ReadonlyMap<string, FeatureSpot>;
    },
    params?: MeshParamsInput
): TileBundle {
    const meshParams = resolveMeshParams(params);
    // Рельеф включён — поля строятся общими мешами регионов, в тайле их быть не должно
    const fieldsOmitted = meshParams.terrain.enabled && meshParams.terrain.amplitude > 0;

    return {
        tileId: source.tileId,
        features: source.features,
        geometry: source.geometry,
        mesh: buildTileMesh(source.geometry, source.features, params, { fields: fieldsOmitted ? 'none' : 'flat' }),
        spots: source.spots ?? new Map(),
        fieldPolygons: collectFieldPolygons(source.geometry),
        fieldsOmitted,
        meshParams,
    };
}
