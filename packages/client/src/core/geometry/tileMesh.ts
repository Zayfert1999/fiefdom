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
// 📦 ЗАВИСИМОСТЬ: пакет `earcut` (+ `@types/earcut`)
// ============================================
import earcut from 'earcut';
import type { Point, Polygon, Ring } from '@fiefdom/shared/core/geometry.types';
import type { FeatureType, TileFeature } from '@fiefdom/shared/core/types';
import { HALF } from './generators/sides';
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
};

const finite = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export interface MeshParamsInput {
    baseHeight?: number;
    heights?: Partial<MeshParams['heights']>;
    colors?: Partial<MeshParams['colors']>;
    wallCreaseAngle?: number;
    boundaryWalls?: boolean;
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
    /** Стены, пропущенные на границе тайла */
    readonly skippedBoundaryEdges: number;
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

/** Ребро целиком лежит на одной стороне тайла */
function isBoundaryEdge(a: Point, b: Point): boolean {
    const eps = 1e-6;
    const onX = Math.abs(Math.abs(a[0]) - HALF) < eps && Math.abs(a[0] - b[0]) < eps;
    const onY = Math.abs(Math.abs(a[1]) - HALF) < eps && Math.abs(a[1] - b[1]) < eps;
    return onX || onY;
}

// ============================================
// 🏗️ ПОСТРОИТЕЛЬ БУФЕРОВ
// ============================================

class MeshBuilder {
    readonly pos: number[] = [];
    readonly nor: number[] = [];
    readonly col: number[] = [];
    readonly idx: number[] = [];
    readonly groups: MeshGroup[] = [];

    topTriangles = 0;
    wallQuads = 0;
    maxDeviation = 0;
    skippedBoundary = 0;

    constructor(private readonly params: MeshParams) {}

    private vertex(x: number, y: number, z: number, n: readonly [number, number, number], c: readonly number[]): number {
        const index = this.pos.length / 3;
        this.pos.push(x, y, z);
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(c[0], c[1], c[2]);
        return index;
    }

    /** Один полигон: крышка + стены. Записывается как одна группа. */
    addPolygon(featureId: string, surface: MeshSurface, polygon: Polygon, top: number, bottom: number): void {
        const rings = polygon.map(cleanRing).filter((r) => r.length >= 3);
        if (rings.length === 0 || signedArea(rings[0]) === 0) return;

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

    // --- Верхняя крышка ---
    private addCap(rings: Point[][], y: number, color: readonly number[]): void {
        const flat: number[] = [];
        const holes: number[] = [];
        rings.forEach((ring, i) => {
            if (i > 0) holes.push(flat.length / 2);
            for (const [x, z] of ring) flat.push(x, z);
        });

        const triangles = earcut(flat, holes, 2);
        const base = this.pos.length / 3;
        for (let i = 0; i < flat.length; i += 2) {
            this.vertex(flat[i], y, flat[i + 1], [0, 1, 0], color);
        }

        let trianglesArea = 0;
        for (let t = 0; t < triangles.length; t += 3) {
            let a = triangles[t];
            let b = triangles[t + 1];
            let c = triangles[t + 2];

            const ax = flat[a * 2], az = flat[a * 2 + 1];
            const bx = flat[b * 2], bz = flat[b * 2 + 1];
            const cx = flat[c * 2], cz = flat[c * 2 + 1];
            const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

            // Нормаль (B−A)×(C−A) смотрит вверх, когда cross < 0 (в плоскости x, z)
            if (cross > 0) [b, c] = [c, b];
            trianglesArea += Math.abs(cross) / 2;

            this.idx.push(base + a, base + b, base + c);
            this.topTriangles++;
        }

        // Контроль триангуляции: сумма площадей против площади полигона
        const polygonArea = rings.reduce(
            (sum, ring, i) => sum + (i === 0 ? 1 : -1) * Math.abs(signedArea(ring)),
            0
        );
        if (polygonArea > 1e-9) {
            this.maxDeviation = Math.max(this.maxDeviation, Math.abs(trianglesArea - polygonArea) / polygonArea);
        }
    }

    // --- Стены ---
    private addWalls(ring: Point[], isHole: boolean, top: number, bottom: number, color: readonly number[]): void {
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

            const v0 = this.vertex(a[0], bottom, a[1], [na[0], 0, na[1]], color);
            const v1 = this.vertex(b[0], bottom, b[1], [nb[0], 0, nb[1]], color);
            const v2 = this.vertex(b[0], top, b[1], [nb[0], 0, nb[1]], color);
            const v3 = this.vertex(a[0], top, a[1], [na[0], 0, na[1]], color);

            // Геометрическая нормаль треугольника (v0, v1, v2) должна совпасть с нормалью ребра
            const ex = b[0] - a[0];
            const ez = b[1] - a[1];
            // (v1−v0) = (ex, 0, ez); (v2−v0) = (ex, h, ez);  cross.x = −h·ez,  cross.z = h·ex
            const facing = -ez * own[0] + ex * own[1];
            if (facing >= 0) this.idx.push(v0, v1, v2, v0, v2, v3);
            else this.idx.push(v0, v2, v1, v0, v3, v2);
            this.wallQuads++;
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
                skippedBoundaryEdges: this.skippedBoundary,
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
 */
export function buildTileMesh(
    geometry: TileGeometryResult,
    features: readonly MeshFeature[],
    params?: MeshParamsInput
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

    // Поля: владелец полигона определяется по ссылке (assignFieldFeatures её сохраняет)
    const owner = new Map<Polygon, string>();
    for (const [featureId, multi] of geometry.assignments.fieldGeometries) {
        for (const polygon of multi) owner.set(polygon, featureId);
    }
    geometry.fields.fieldPolygons.forEach((polygon, i) => {
        builder.addPolygon(owner.get(polygon) ?? `__field_${i}`, 'field', polygon, top('field'), p.baseHeight);
    });

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

// ============================================
// 📦 БАНДЛ ТАЙЛА
// ============================================

/** Всё, что нужно рендереру, интеракции и аудиту для одного тайла */
export interface TileBundle {
    readonly tileId: string;
    readonly artId: string;
    readonly features: readonly MeshFeature[];
    readonly geometry: TileGeometryResult;
    readonly mesh: TileMeshData;
}

export function buildTileBundle(
    source: {
        readonly tileId: string;
        readonly artId: string;
        readonly features: readonly MeshFeature[];
        readonly geometry: TileGeometryResult;
    },
    params?: MeshParamsInput
): TileBundle {
    return {
        tileId: source.tileId,
        artId: source.artId,
        features: source.features,
        geometry: source.geometry,
        mesh: buildTileMesh(source.geometry, source.features, params),
    };
}
