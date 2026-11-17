// packages/client/src/core/geometry/terrain.test.ts
// ============================================
// 🧪 ТЕСТЫ РЕЛЬЕФА ПОЛЕЙ И РЕГИОНОВ
// ============================================
// Не зависят от base.json и clipper: геометрия тайлов собирается вручную,
// чтобы проверять именно рельеф — поле высоты, сетку, сшивание регионов,
// меши регионов, стены и кэш.
// ============================================
import { describe, it, expect } from 'vitest';
import {
    buildFieldRegionMesh,
    buildTileBundle,
    buildTileMesh,
    resolveMeshParams,
    sampleMeshHeight,
    tileYaw,
    type TileMeshData,
} from './tileMesh';
import { DEFAULT_TERRAIN_PARAMS, createTerrainField, featureFactor, resolveTerrainParams } from './terrain';
import { triangulateFieldUniform } from './fieldTriangulation';
import { SegmentGrid, distanceToSegments, edgeChain, edgeKey, refineTriangles } from './terrainSurface';
import {
    FieldRegionMeshCache,
    buildFieldRegionMeshes,
    buildFieldRegions,
    locateFieldFeature,
    tileToWorld,
    worldToTile,
    type FieldRegionTile,
} from './fieldRegions';

// --- Вспомогательная геометрия -------------------------------------------------

type Pt = [number, number];
const BASE = 4;
const FIELD_TOP = 8; // baseHeight 4 + heights.field 4
const SQUARE: Pt[] = [[-50, -50], [50, -50], [50, 50], [-50, 50]];

const polygonArea = (polygon: readonly (readonly Pt[])[]): number =>
    polygon.reduce((sum, ring, i) => {
        let a = 0;
        for (let k = 0; k < ring.length; k++) {
            const [x1, y1] = ring[k];
            const [x2, y2] = ring[(k + 1) % ring.length];
            a += x1 * y2 - x2 * y1;
        }
        return sum + (i === 0 ? 1 : -1) * Math.abs(a / 2);
    }, 0);

function tile(col: number, row: number, rotation: number, fields: Pt[][][], tileId = 't'): FieldRegionTile {
    return {
        key: `${col},${row}`,
        col,
        row,
        rotation,
        tileId,
        fields: fields.map((polygon, i) => ({ featureId: `f${i}`, polygon })),
    };
}

/** Поле тайла с вырезом под город сверху */
const NOTCH: Pt[][] = [[[-50, -50], [-30, -50], [-30, -10], [30, -10], [30, -50], [50, -50], [50, 50], [-50, 50]]];
/** Поле с монастырём внутри: полигон с дыркой */
const WITH_HOLE: Pt[][] = [SQUARE, [[-20, -20], [-20, 20], [20, 20], [20, -20]]];

const TERRAIN = { enabled: true, amplitude: 6, gridStep: 4 } as const;

function regionMesh(polygon: Pt[][], params: Parameters<typeof resolveMeshParams>[0] = { terrain: TERRAIN }): TileMeshData {
    return buildFieldRegionMesh([polygon], 'r1', params);
}

function capVertexKeys(mesh: TileMeshData): Set<string> {
    const keys = new Set<string>();
    const { positions: P, normals: N } = mesh;
    for (let i = 0; i < P.length; i += 3) {
        if (N[i + 1] > 0.01) keys.add(`${P[i].toFixed(4)},${P[i + 1].toFixed(4)},${P[i + 2].toFixed(4)}`);
    }
    return keys;
}

/** Треугольники, чья геометрическая нормаль противоположна нормали вершины */
function countInverted(mesh: TileMeshData): number {
    const { positions: P, normals: N, indices: I } = mesh;
    let inverted = 0;
    for (let i = 0; i < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz);
        if (length < 1e-3) continue; // вырожденные: знак — шум float32
        if ((nx * N[a] + ny * N[a + 1] + nz * N[a + 2]) / length < 0) inverted++;
    }
    return inverted;
}

// --- Параметры ------------------------------------------------------------------

describe('параметры рельефа', () => {
    it('resolveTerrainParams зажимает значения и чинит неверные', () => {
        const p = resolveTerrainParams({ amplitude: -5, octaves: 99, gridStep: 0, seed: '   ' });
        expect(p.amplitude).toBe(0);
        expect(p.octaves).toBe(6);
        expect(p.gridStep).toBe(1.5);
        expect(p.seed).toBe(DEFAULT_TERRAIN_PARAMS.seed);
    });

    it('resolveMeshParams достраивает terrain и сохраняет заданное', () => {
        const m = resolveMeshParams({ terrain: { amplitude: 3 } });
        expect(m.terrain.amplitude).toBe(3);
        expect(m.terrain.frequency).toBe(DEFAULT_TERRAIN_PARAMS.frequency);
    });

    it('featureFactor: 0 у края, 1 за пределом затухания, без затухания — всегда 1', () => {
        expect(featureFactor(0, 8)).toBe(0);
        expect(featureFactor(8, 8)).toBe(1);
        expect(featureFactor(Infinity, 8)).toBe(1);
        expect(featureFactor(0, 0)).toBe(1);
    });
});

// --- Поле высоты ----------------------------------------------------------------

describe('поле высоты (мировой шум)', () => {
    it('детерминировано по seed, различается между seed, значения в 0..1', () => {
        const tp = resolveTerrainParams({});
        const a1 = createTerrainField(tp);
        const a2 = createTerrainField(tp);
        const b = createTerrainField(resolveTerrainParams({ seed: 'other' }));
        let diff = 0;
        for (let x = -145; x <= 145; x += 29) {
            for (let z = -145; z <= 145; z += 29) {
                const v = a1.elevation(x, z);
                expect(v).toBe(a2.elevation(x, z));
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
                diff += Math.abs(v - b.elevation(x, z));
            }
        }
        expect(diff).toBeGreaterThan(0.1);
    });

    it('непрерывно: малый шаг — малое изменение, в том числе через границы клеток', () => {
        const f = createTerrainField(resolveTerrainParams({}));
        for (const border of [50, 150, -50]) {
            for (let z = -100; z <= 100; z += 7) {
                expect(Math.abs(f.elevation(border - 0.01, z) - f.elevation(border + 0.01, z))).toBeLessThan(0.01);
            }
        }
    });
});

// --- Индекс отрезков ------------------------------------------------------------

describe('SegmentGrid', () => {
    it('совпадает с перебором в пределах cap и даёт Infinity дальше', () => {
        const segments: number[] = [];
        for (let i = 0; i < 40; i++) {
            const x = ((i * 37) % 100) - 50;
            const z = ((i * 53) % 100) - 50;
            segments.push(x, z, x + ((i * 7) % 21) - 10, z + ((i * 11) % 17) - 8);
        }
        const cap = 6;
        const grid = new SegmentGrid(segments, cap);
        for (let x = -60; x <= 60; x += 4.3) {
            for (let z = -60; z <= 60; z += 4.7) {
                const exact = distanceToSegments(x, z, segments);
                const fast = grid.distance(x, z, cap);
                if (exact <= cap) expect(fast).toBeCloseTo(exact, 9);
                else expect(fast).toBe(Infinity);
            }
        }
    });
});

// --- Измельчение (запасной путь) ------------------------------------------------

describe('refineTriangles', () => {
    const xz = [0, 0, 50, 0, 50, 50, 0, 50, 20, 5];
    const tri = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4];

    it('все рёбра не длиннее порога, площадь сохраняется, сетка конформна', () => {
        const r = refineTriangles(xz, tri, 3, 100000);
        const directed = new Map<string, number>();
        let area = 0;
        let longest = 0;
        for (let t = 0; t < r.triangles.length; t += 3) {
            const v = [r.triangles[t], r.triangles[t + 1], r.triangles[t + 2]];
            const [ax, az, bx, bz, cx, cz] = v.flatMap((i) => [r.xz[i * 2], r.xz[i * 2 + 1]]);
            area += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
            for (let e = 0; e < 3; e++) {
                const a = v[e], b = v[(e + 1) % 3];
                directed.set(`${a}>${b}`, (directed.get(`${a}>${b}`) ?? 0) + 1);
                longest = Math.max(longest, Math.hypot(r.xz[a * 2] - r.xz[b * 2], r.xz[a * 2 + 1] - r.xz[b * 2 + 1]));
            }
        }
        expect(area).toBeCloseTo(2500, 6);
        expect(longest).toBeLessThanOrEqual(3 + 1e-9);
        expect([...directed.values()].every((c) => c === 1)).toBe(true);
    });

    it('соблюдает лимит вершин; edgeChain собирает разрезанное ребро по порядку', () => {
        const limited = refineTriangles(xz, tri, 0.5, 300);
        expect(limited.limited).toBe(true);
        expect(limited.xz.length / 2).toBeLessThanOrEqual(300);

        const r = refineTriangles(xz, tri, 3, 100000);
        const chain = edgeChain(0, 1, r.splits);
        expect(chain[0]).toBe(0);
        expect(chain[chain.length - 1]).toBe(1);
        expect(r.splits.has(edgeKey(0, 1))).toBe(true);
    });
});

// --- Равномерная сетка ----------------------------------------------------------

describe('triangulateFieldUniform', () => {
    const shapes: Record<string, Pt[][]> = {
        'вырез под город': NOTCH,
        'дырка (монастырь)': WITH_HOLE,
        'L-образное': [[[-50, -50], [50, -50], [50, 0], [0, 0], [0, 50], [-50, 50]]],
        'узкая полоса': [[[-50, -50], [50, -50], [50, -47], [-50, -47]]],
    };

    for (const [name, polygon] of Object.entries(shapes)) {
        it(`${name}: ровные треугольники, сетка конформна, площадь сохранена`, () => {
            const step = 3.5;
            const grid = triangulateFieldUniform(polygon, step, 8000);
            expect(grid).not.toBeNull();
            const { xz, triangles, chains, areaDeviation } = grid!;
            expect(areaDeviation).toBeLessThan(1e-9);

            const directed = new Map<string, number>();
            const lengths: number[] = [];
            let minAngle = 180;
            for (let t = 0; t < triangles.length; t += 3) {
                const v = [triangles[t], triangles[t + 1], triangles[t + 2]];
                const p = v.map((i) => [xz[i * 2], xz[i * 2 + 1]]);
                const cross = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
                expect(cross).toBeLessThan(0); // нормаль вверх, как у плоской крышки
                const side = [0, 1, 2].map((i) => Math.hypot(p[i][0] - p[(i + 1) % 3][0], p[i][1] - p[(i + 1) % 3][1]));
                lengths.push(...side);
                for (let i = 0; i < 3; i++) {
                    const a = side[i], b = side[(i + 1) % 3], c = side[(i + 2) % 3];
                    const angle = (Math.acos(Math.max(-1, Math.min(1, (b * b + c * c - a * a) / (2 * b * c)))) * 180) / Math.PI;
                    minAngle = Math.min(minAngle, angle);
                }
                for (let e = 0; e < 3; e++) {
                    const key = `${v[e]}>${v[(e + 1) % 3]}`;
                    directed.set(key, (directed.get(key) ?? 0) + 1);
                }
            }
            expect(minAngle).toBeGreaterThan(20);
            lengths.sort((a, b) => a - b);
            expect(lengths[Math.floor(lengths.length / 2)]).toBeLessThan(step * 1.2);
            expect(lengths[lengths.length - 1]).toBeLessThan(step * 2.2);

            const boundary = new Set<string>();
            for (const ring of chains) {
                for (const chain of ring) {
                    for (let i = 0; i + 1 < chain.length; i++) {
                        boundary.add(`${chain[i]}>${chain[i + 1]}`);
                        boundary.add(`${chain[i + 1]}>${chain[i]}`);
                    }
                }
            }
            for (const [key, count] of directed) {
                expect(count).toBe(1);
                const [a, b] = key.split('>');
                if (!directed.has(`${b}>${a}`)) expect(boundary.has(key)).toBe(true);
            }
        });
    }

    it('цепочки ребра соединяют его концы: первая и последняя вершины совпадают с вершинами кольца', () => {
        const grid = triangulateFieldUniform(WITH_HOLE, 4, 8000)!;
        WITH_HOLE.forEach((ring, r) => {
            ring.forEach(([x, y], i) => {
                const chain = grid.chains[r][i];
                const first = chain[0];
                const last = chain[chain.length - 1];
                expect([grid.xz[first * 2], grid.xz[first * 2 + 1]]).toEqual([x, y]);
                const [nx, ny] = ring[(i + 1) % ring.length];
                expect([grid.xz[last * 2], grid.xz[last * 2 + 1]]).toEqual([nx, ny]);
            });
        });
    });

    it('кольца, касающиеся в одной точке, делят вершину и не ломают сетку', () => {
        // дырка касается внешнего контура общей вершиной (50, 0)
        const touching: Pt[][] = [[[-50, -50], [50, -50], [50, 0], [50, 50], [-50, 50]], [[50, 0], [20, 12], [20, -12]]];
        const grid = triangulateFieldUniform(touching, 3.5, 8000);
        expect(grid).not.toBeNull();
        expect(grid!.areaDeviation).toBeLessThan(1e-9);

        // в списке вершин нет двух точек в одной позиции
        const seen = new Set<string>();
        for (let i = 0; i < grid!.xz.length; i += 2) {
            const key = `${Math.round(grid!.xz[i] * 1e6)},${Math.round(grid!.xz[i + 1] * 1e6)}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
        // вершина касания есть в цепочках обоих колец
        const touchIndex = grid!.chains[0].find((chain) => grid!.xz[chain[0] * 2] === 50 && grid!.xz[chain[0] * 2 + 1] === 0)![0];
        expect(grid!.chains[1].some((chain) => chain[0] === touchIndex)).toBe(true);
    });

    it('меш региона с касанием колец строится равномерной сеткой, без запасного пути', () => {
        const mesh = buildFieldRegionMesh([[[[-50, -50], [50, -50], [50, 0], [50, 50], [-50, 50]], [[50, 0], [20, 12], [20, -12]]]], 'touch', { terrain: TERRAIN });
        expect(mesh.stats.terrainFallbacks).toBe(0);
        expect(mesh.stats.maxTopDeviation).toBeLessThan(1e-6);
        expect(countInverted(mesh)).toBe(0);
    });

    it('соблюдает лимит вершин (шаг сетки растёт)', () => {
        expect(triangulateFieldUniform(NOTCH, 0.5, 600)!.xz.length / 2).toBeLessThan(900);
    });
});

// --- Тайл → мир -----------------------------------------------------------------

describe('tileToWorld', () => {
    it('совпадает с поворотом three (rotation.y = tileYaw) и обратим', () => {
        for (const rotation of [0, 90, 180, 270, 45, 30]) {
            const phi = tileYaw(rotation);
            for (const [x, z] of [[10, 20], [-35, 7], [50, -50]]) {
                const expectedX = x * Math.cos(phi) + z * Math.sin(phi) + 200;
                const expectedZ = -x * Math.sin(phi) + z * Math.cos(phi) + 300;
                const [wx, wz] = tileToWorld(2, 3, rotation, x, z);
                expect(wx).toBeCloseTo(expectedX, 9);
                expect(wz).toBeCloseTo(expectedZ, 9);
                const [lx, lz] = worldToTile(2, 3, rotation, wx, wz);
                expect(lx).toBeCloseTo(x, 9);
                expect(lz).toBeCloseTo(z, 9);
            }
        }
    });
});

// --- Регионы --------------------------------------------------------------------

describe('buildFieldRegions', () => {
    it('два тайла рядом — один регион, кольцо без шовных вершин', () => {
        const regions = buildFieldRegions([tile(0, 0, 0, [[SQUARE]]), tile(1, 0, 0, [[SQUARE]])]);
        expect(regions.length).toBe(1);
        expect(regions[0].polygons.length).toBe(1);
        expect(regions[0].polygons[0].length).toBe(1);
        expect(regions[0].polygons[0][0].length).toBe(4);
        expect(polygonArea(regions[0].polygons[0] as Pt[][])).toBeCloseTo(20000, 6);
        expect(regions[0].id).toBe('0,0:f0');
        expect(regions[0].featureKeys).toEqual(['0,0:f0', '1,0:f0']);
    });

    it('шов сшивается, даже если вершины на нём стоят по-разному', () => {
        const withExtra: Pt[] = [[-50, -50], [50, -50], [50, -10], [50, 50], [-50, 50]];
        const regions = buildFieldRegions([tile(0, 0, 0, [[withExtra]]), tile(1, 0, 0, [[SQUARE]])]);
        expect(regions.length).toBe(1);
        expect(regions[0].polygons[0][0].length).toBe(4);
    });

    it('L из трёх тайлов — один полигон из шести вершин', () => {
        const regions = buildFieldRegions([tile(0, 0, 0, [[SQUARE]]), tile(1, 0, 0, [[SQUARE]]), tile(0, 1, 0, [[SQUARE]])]);
        expect(regions.length).toBe(1);
        expect(regions[0].polygons[0][0].length).toBe(6);
        expect(polygonArea(regions[0].polygons[0] as Pt[][])).toBeCloseTo(30000, 6);
    });

    it('кольцо тайлов вокруг пустой клетки — регион с дыркой', () => {
        const tiles: FieldRegionTile[] = [];
        for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) if (c !== 1 || r !== 1) tiles.push(tile(c, r, 0, [[SQUARE]]));
        const regions = buildFieldRegions(tiles);
        expect(regions.length).toBe(1);
        expect(regions[0].polygons.length).toBe(1);
        expect(regions[0].polygons[0].length).toBe(2);
        expect(polygonArea(regions[0].polygons[0] as Pt[][])).toBeCloseTo(80000, 6);
    });

    it('поля не доходят до общего шва или касаются только углом — разные регионы', () => {
        const leftHalf: Pt[] = [[-50, -50], [0, -50], [0, 50], [-50, 50]];
        const rightHalf: Pt[] = [[0, -50], [50, -50], [50, 50], [0, 50]];
        expect(buildFieldRegions([tile(0, 0, 0, [[leftHalf]]), tile(1, 0, 0, [[rightHalf]])]).length).toBe(2);
        expect(buildFieldRegions([tile(0, 0, 0, [[SQUARE]]), tile(1, 1, 0, [[SQUARE]])]).length).toBe(2);
    });

    it('поворот тайла учитывается: полосы стыкуются только в нужной ориентации', () => {
        const topRightStrip: Pt[] = [[30, -50], [50, -50], [50, 0], [30, 0]]; // у правой стороны, верхняя половина
        const a = tile(0, 0, 0, [[topRightStrip]]);
        expect(buildFieldRegions([a, tile(1, 0, 0, [[topRightStrip]])]).length).toBe(2); // у B полоса справа — к шву не доходит
        const regions = buildFieldRegions([a, tile(1, 0, 180, [[topRightStrip]])]); // 180°: полоса уходит к левой стороне, вниз
        expect(regions.length).toBe(2); // верхняя половина A и нижняя половина B на шве не пересекаются
        const flipped = buildFieldRegions([a, tile(1, 0, 180, [[[[30, 0], [50, 0], [50, 50], [30, 50]]]])]);
        expect(flipped.length).toBe(1); // после поворота это верхняя часть левой стороны B — стыкуется с A
    });

    it('поля одного тайла, делящие общее ребро, объединяются, а фичи различимы по точке', () => {
        const left: Pt[] = [[-50, -50], [0, -50], [0, 50], [-50, 50]];
        const right: Pt[] = [[0, -50], [50, -50], [50, 50], [0, 50]];
        const t = tile(0, 0, 0, [[left], [right]]);
        const regions = buildFieldRegions([t]);
        expect(regions.length).toBe(1);
        expect(locateFieldFeature(regions[0], [t], 25, 0)?.featureKey).toBe('0,0:f1');
        expect(locateFieldFeature(regions[0], [t], -25, 0)?.featureKey).toBe('0,0:f0');
        expect(locateFieldFeature(regions[0], [t], 500, 0)).toBeNull();
    });

    it('подпись меняется при повороте и смене бандла', () => {
        const base = buildFieldRegions([tile(0, 0, 0, [[NOTCH[0]]])])[0].signature;
        expect(buildFieldRegions([tile(0, 0, 90, [[NOTCH[0]]])])[0].signature).not.toBe(base);
        expect(buildFieldRegions([tile(0, 0, 0, [[NOTCH[0]]], 'other')])[0].signature).not.toBe(base);
    });
});

// --- Меш региона ----------------------------------------------------------------

describe('меш региона', () => {
    it('рельеф выключен — верх плоский; amplitude = 0 — тоже', () => {
        for (const terrain of [{ enabled: false }, { amplitude: 0 }]) {
            const mesh = regionMesh(NOTCH, { terrain });
            expect(mesh.stats.terrainTriangles).toBe(0);
            const { positions: P, normals: N } = mesh;
            for (let i = 0; i < P.length; i += 3) if (N[i + 1] > 0.01) expect(P[i + 1]).toBe(FIELD_TOP);
        }
    });

    it('измельчён, высоты в диапазоне, ориентация верна, запасной путь не нужен', () => {
        const mesh = regionMesh(NOTCH, { boundaryWalls: true, terrain: TERRAIN });
        expect(mesh.stats.terrainTriangles).toBeGreaterThan(200);
        expect(mesh.stats.terrainFallbacks).toBe(0);
        expect(mesh.stats.maxTopDeviation).toBeLessThan(1e-6);
        expect(countInverted(mesh)).toBe(0);

        let maxY = -Infinity;
        for (let i = 0; i < mesh.positions.length; i += 3) {
            maxY = Math.max(maxY, mesh.positions[i + 1]);
            if (mesh.normals[i + 1] > 0.01) expect(mesh.positions[i + 1]).toBeGreaterThanOrEqual(FIELD_TOP - 1e-6);
        }
        expect(maxY).toBeLessThanOrEqual(FIELD_TOP + TERRAIN.amplitude + 1e-5);
        expect(maxY).toBeGreaterThan(FIELD_TOP + 1);
    });

    it('одна группа на регион: featureId = id, surface = field, индексы без дыр', () => {
        const mesh = buildFieldRegionMesh([NOTCH, WITH_HOLE], 'region-1', { terrain: TERRAIN });
        let cursor = 0;
        for (const g of mesh.groups) {
            expect(g.featureId).toBe('region-1');
            expect(g.surface).toBe('field');
            expect(g.start).toBe(cursor);
            cursor += g.count;
        }
        expect(cursor).toBe(mesh.indices.length);
    });

    it('стены идут по вершинам верха (щелей нет), у края города поле на плоском уровне', () => {
        const mesh = regionMesh(NOTCH, { boundaryWalls: true, terrain: TERRAIN });
        const cap = capVertexKeys(mesh);
        const { positions: P, normals: N } = mesh;

        let tops = 0;
        let maxTop = -Infinity;
        for (let i = 0; i < P.length; i += 3) {
            const x = P[i], y = P[i + 1], z = P[i + 2];
            const onNotch =
                (Math.abs(z + 10) < 1e-6 && Math.abs(x) <= 30 + 1e-6) ||
                (Math.abs(Math.abs(x) - 30) < 1e-6 && z >= -50 - 1e-6 && z <= -10 + 1e-6);
            if (N[i + 1] !== 0 || !onNotch || y <= BASE + 0.01) continue;
            tops++;
            maxTop = Math.max(maxTop, y);
            expect(cap.has(`${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`)).toBe(true);
        }
        expect(tops).toBeGreaterThan(10);
        expect(maxTop).toBeCloseTo(FIELD_TOP, 5);
    });

    it('полигон с дыркой: стены дырки стыкуются с верхом, ориентация верна', () => {
        const mesh = regionMesh(WITH_HOLE, { boundaryWalls: true, terrain: TERRAIN });
        expect(mesh.stats.maxTopDeviation).toBeLessThan(1e-6);
        expect(countInverted(mesh)).toBe(0);

        const cap = capVertexKeys(mesh);
        const { positions: P, normals: N } = mesh;
        let tops = 0;
        for (let i = 0; i < P.length; i += 3) {
            const x = P[i], y = P[i + 1], z = P[i + 2];
            const onHole =
                (Math.abs(Math.abs(x) - 20) < 1e-6 && Math.abs(z) <= 20 + 1e-6) ||
                (Math.abs(Math.abs(z) - 20) < 1e-6 && Math.abs(x) <= 20 + 1e-6);
            if (N[i + 1] !== 0 || !onHole || y < FIELD_TOP - 1e-6) continue;
            tops++;
            expect(cap.has(`${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`)).toBe(true);
        }
        expect(tops).toBeGreaterThan(20);
    });

    it('запасной путь (острый клин) даёт целую поверхность', () => {
        const wedge: Pt[][] = [[[-50, -50], [50, -50], [50, -48.5], [-50, 50]]];
        const mesh = regionMesh(wedge, { boundaryWalls: true, terrain: TERRAIN });
        expect(mesh.stats.terrainTriangles).toBeGreaterThan(0);
        expect(mesh.stats.maxTopDeviation).toBeLessThan(1e-6);
        expect(countInverted(mesh)).toBe(0);
    });

    it('граница клеток без соседа: стены строятся только при boundaryWalls', () => {
        const without = regionMesh(NOTCH, { terrain: TERRAIN });
        const withWalls = regionMesh(NOTCH, { boundaryWalls: true, terrain: TERRAIN });
        expect(without.stats.skippedBoundaryEdges).toBeGreaterThan(0);
        expect(withWalls.stats.skippedBoundaryEdges).toBe(0);
        expect(withWalls.stats.wallQuads).toBeGreaterThan(without.stats.wallQuads);
    });

    it('sampleMeshHeight: поле — выше плоского уровня, вне региона — null', () => {
        const mesh = regionMesh(NOTCH);
        const inField = sampleMeshHeight(mesh, 0, 30)!;
        expect(inField).toBeGreaterThanOrEqual(FIELD_TOP - 1e-6);
        expect(inField).toBeLessThanOrEqual(FIELD_TOP + TERRAIN.amplitude + 1e-6);
        expect(sampleMeshHeight(mesh, 0, -30)).toBeNull(); // в вырезе города поля нет
        expect(sampleMeshHeight(mesh, 80, 0)).toBeNull();
    });
});

// --- Общий меш через швы --------------------------------------------------------

describe('рельеф через швы между тайлами', () => {
    const params = { terrain: { amplitude: 6, gridStep: 3.5 } };
    const square4 = [tile(0, 0, 0, [[SQUARE]]), tile(1, 0, 0, [[SQUARE]]), tile(0, 1, 0, [[SQUARE]]), tile(1, 1, 0, [[SQUARE]])];

    it('4 тайла — один меш и одна группа; высота непрерывна и совпадает с мировым шумом', () => {
        const meshes = buildFieldRegionMeshes(square4, params);
        expect(meshes.length).toBe(1);
        expect(meshes[0].mesh.groups.length).toBe(1);
        expect(meshes[0].mesh.stats.terrainFallbacks).toBe(0);

        const mesh = meshes[0].mesh;
        const field = createTerrainField(resolveTerrainParams(params.terrain));
        let maxJump = 0;
        let maxError = 0;
        for (let z = -45; z <= 145; z += 5) {
            const left = sampleMeshHeight(mesh, 49.9, z)!;
            const right = sampleMeshHeight(mesh, 50.1, z)!;
            maxJump = Math.max(maxJump, Math.abs(left - right));
            maxError = Math.max(maxError, Math.abs(left - (FIELD_TOP + 6 * field.elevation(49.9, z))));
        }
        expect(maxJump).toBeLessThan(0.15);
        expect(maxError).toBeLessThan(0.6);
    });

    it('поворот тайла не меняет рельеф: то же место доски даёт ту же высоту', () => {
        const rotated = [tile(0, 0, 90, [[SQUARE]]), tile(1, 0, 270, [[SQUARE]])];
        const straight = [tile(0, 0, 0, [[SQUARE]]), tile(1, 0, 0, [[SQUARE]])];
        const a = buildFieldRegionMeshes(rotated, params)[0].mesh;
        const b = buildFieldRegionMeshes(straight, params)[0].mesh;
        for (const [x, z] of [[-20, 10], [60, -30], [120, 40]]) {
            expect(Math.abs(sampleMeshHeight(a, x, z)! - sampleMeshHeight(b, x, z)!)).toBeLessThan(0.6);
        }
    });

    it('кэш: повторная сборка берёт меши из кэша, новый тайл строит только свой регион', () => {
        const cache = new FieldRegionMeshCache();
        const first = buildFieldRegionMeshes(square4, params, cache);
        expect(buildFieldRegionMeshes(square4, params, cache)[0]).toBe(first[0]);

        const more = buildFieldRegionMeshes([...square4, tile(5, 5, 0, [[SQUARE]])], params, cache);
        expect(more.length).toBe(2);
        expect(more.find((r) => r.id === '0,0:f0')).toBe(first[0]);
        expect(cache.size).toBe(2);

        // изменение параметров — новые меши
        expect(buildFieldRegionMeshes(square4, { terrain: { amplitude: 3 } }, cache)[0]).not.toBe(first[0]);
    });
});

// --- Бандл тайла ----------------------------------------------------------------

describe('бандл тайла', () => {
    const geometry = {
        tessellation: { areas: new Map([['city1', [[[[-30, -50], [30, -50], [30, -10], [-30, -10]]]]]]), lines: new Map() },
        decorations: { plazas: [], plazaGeometries: [] },
        clipping: { clippedLines: new Map() },
        fields: { fieldPolygons: [NOTCH] }, // та же ссылка, что в fieldGeometries: по ней определяется владелец
        assignments: { fieldGeometries: new Map([['field1', [NOTCH]]]) },
    } as never;
    const features = [{ id: 'field1', type: 'field' }, { id: 'city1', type: 'city' }] as never;
    const source = { tileId: 't1', artId: 'a1', features, geometry };

    it('рельеф включён — тайл без полей, полигоны полей приложены', () => {
        const bundle = buildTileBundle(source, { terrain: { enabled: true, amplitude: 5 } });
        expect(bundle.fieldsOmitted).toBe(true);
        expect(bundle.fieldPolygons.length).toBe(1);
        expect(bundle.fieldPolygons[0].featureId).toBe('field1');
        expect(bundle.mesh.groups.some((g) => g.surface === 'field')).toBe(false);
        expect(bundle.mesh.groups.some((g) => g.surface === 'city')).toBe(true);
        expect(bundle.meshParams.terrain.amplitude).toBe(5);
    });

    it('рельеф выключен — плоские поля прямо в меше тайла', () => {
        const bundle = buildTileBundle(source, { terrain: { enabled: false } });
        expect(bundle.fieldsOmitted).toBe(false);
        expect(bundle.mesh.groups.some((g) => g.surface === 'field' && g.featureId === 'field1')).toBe(true);
    });

    it('buildTileMesh напрямую строит плоские поля, пока не попросили иначе', () => {
        expect(buildTileMesh(geometry, features, { terrain: { enabled: true } }).groups.some((g) => g.surface === 'field')).toBe(true);
        expect(buildTileMesh(geometry, features, {}, { fields: 'none' }).groups.some((g) => g.surface === 'field')).toBe(false);
    });
});
