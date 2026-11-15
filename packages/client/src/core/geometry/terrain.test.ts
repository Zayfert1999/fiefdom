// packages/client/src/core/geometry/terrain.test.ts
// ============================================
// 🧪 ТЕСТЫ РЕЛЬЕФА ПОЛЕЙ
// ============================================
// Не зависят от base.json и clipper: геометрия тайла собирается вручную,
// чтобы проверять именно рельеф — измельчение, высоты, нормали, стены, стыки.
// ============================================
import { describe, it, expect } from 'vitest';
import { buildTileMesh, resolveMeshParams, sampleMeshHeight, type TileMeshData } from './tileMesh';
import { DEFAULT_TERRAIN_PARAMS, createTerrainField, resolveTerrainParams } from './terrain';
import { triangulateFieldUniform } from './fieldTriangulation';
import { edgeChain, edgeKey, refineTriangles } from './terrainSurface';

// --- Вспомогательная геометрия -------------------------------------------------

type Pt = [number, number];
const BASE = 4;
const FIELD_TOP = 8; // baseHeight 4 + heights.field 4
const CITY_TOP = 6; // baseHeight 4 + heights.city 2

/** Поле тайла с вырезом под город сверху (граница тайла + «чужие» рёбра) */
function notchTile() {
    const fieldRing: Pt[] = [[-50, -50], [-30, -50], [-30, -10], [30, -10], [30, -50], [50, -50], [50, 50], [-50, 50]];
    const cityRing: Pt[] = [[-30, -50], [30, -50], [30, -10], [-30, -10]];
    const field = [fieldRing];
    return {
        geometry: {
            tessellation: { areas: new Map([['city1', [[cityRing]]]]), lines: new Map() },
            decorations: { plazas: [], plazaGeometries: [] },
            clipping: { clippedLines: new Map() },
            fields: { fieldPolygons: [field] },
            assignments: { fieldGeometries: new Map([['field1', [field]]]) },
        } as never,
        features: [{ id: 'field1', type: 'field' }, { id: 'city1', type: 'city' }] as never,
    };
}

/** Поле с монастырём внутри: полигон с дыркой */
function holeTile() {
    const outer: Pt[] = [[-50, -50], [50, -50], [50, 50], [-50, 50]];
    const hole: Pt[] = [[-20, -20], [-20, 20], [20, 20], [20, -20]];
    const field = [outer, hole];
    return {
        geometry: {
            tessellation: { areas: new Map([['m1', [[[[-20, -20], [20, -20], [20, 20], [-20, 20]]]]]]), lines: new Map() },
            decorations: { plazas: [], plazaGeometries: [] },
            clipping: { clippedLines: new Map() },
            fields: { fieldPolygons: [field] },
            assignments: { fieldGeometries: new Map([['field1', [field]]]) },
        } as never,
        features: [{ id: 'field1', type: 'field' }, { id: 'm1', type: 'monastery' }] as never,
    };
}

const TERRAIN = { enabled: true, amplitude: 6, gridStep: 4 } as const;

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
        const p = resolveTerrainParams({ amplitude: -5, octaves: 99, gridStep: 0 });
        expect(p.amplitude).toBe(0);
        expect(p.octaves).toBe(6);
        expect(p.gridStep).toBe(1.5);
    });

    it('resolveMeshParams достраивает terrain и сохраняет заданное', () => {
        const m = resolveMeshParams({ terrain: { amplitude: 3 } });
        expect(m.terrain.amplitude).toBe(3);
        expect(m.terrain.frequency).toBe(DEFAULT_TERRAIN_PARAMS.frequency);
    });
});

// --- Измельчение ----------------------------------------------------------------

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

        const onBorder = (p: number): boolean => {
            const x = r.xz[p * 2], z = r.xz[p * 2 + 1];
            return x === 0 || x === 50 || z === 0 || z === 50;
        };
        for (const key of directed.keys()) {
            const [a, b] = key.split('>').map(Number);
            if (!directed.has(`${b}>${a}`)) expect(onBorder(a) && onBorder(b)).toBe(true); // непарные рёбра — только на границе
        }
    });

    it('соблюдает лимит вершин', () => {
        const r = refineTriangles(xz, tri, 0.5, 300);
        expect(r.limited).toBe(true);
        expect(r.xz.length / 2).toBeLessThanOrEqual(300);
    });

    it('edgeChain собирает разрезанное ребро по порядку', () => {
        const r = refineTriangles(xz, tri, 3, 100000);
        const chain = edgeChain(0, 1, r.splits);
        expect(chain[0]).toBe(0);
        expect(chain[chain.length - 1]).toBe(1);
        expect(chain.length).toBeGreaterThan(10);
        for (let i = 0; i + 1 < chain.length; i++) expect(chain[i + 1]).not.toBe(chain[i]);
        expect(r.splits.has(edgeKey(0, 1))).toBe(true);
    });
});

// --- Равномерная сетка верха поля -----------------------------------------------

describe('triangulateFieldUniform', () => {
    const square: Pt[] = [[-50, -50], [50, -50], [50, 50], [-50, 50]];
    const shapes: Record<string, Pt[][]> = {
        'вырез под город': [[[-50, -50], [-30, -50], [-30, -10], [30, -10], [30, -50], [50, -50], [50, 50], [-50, 50]]],
        'дырка (монастырь)': [square, [[-20, -20], [-20, 20], [20, 20], [20, -20]]],
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

            // каждое направленное ребро — один раз; непарные — только рёбра контура
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

    it('вершины колец сохраняют индексы, а цепочки ребра соединяют его концы', () => {
        const polygon = shapes['дырка (монастырь)'];
        const grid = triangulateFieldUniform(polygon, 4, 8000)!;
        let flat = 0;
        polygon.forEach((ring, r) => {
            ring.forEach(([x, y], i) => {
                expect(grid.xz[(flat + i) * 2]).toBe(x);
                expect(grid.xz[(flat + i) * 2 + 1]).toBe(y);
                const chain = grid.chains[r][i];
                expect(chain[0]).toBe(flat + i);
                expect(chain[chain.length - 1]).toBe(flat + ((i + 1) % ring.length));
            });
            flat += ring.length;
        });
    });

    it('соблюдает лимит вершин (шаг сетки растёт)', () => {
        const grid = triangulateFieldUniform(shapes['вырез под город'], 0.5, 600)!;
        expect(grid.xz.length / 2).toBeLessThan(900);
    });

    it('очень острый клин: либо корректная сетка, либо null (запасной путь)', () => {
        const wedge: Pt[][] = [[[-50, -50], [50, -50], [50, -48.5], [-50, 50]]];
        const grid = triangulateFieldUniform(wedge, 3.5, 8000);
        if (grid) expect(grid.areaDeviation).toBeLessThan(1e-6);
    });
});

// --- Поле высоты ----------------------------------------------------------------

describe('поле высоты', () => {
    it('режим shared: край тайла совпадает у соседей при любом seed и повороте', () => {
        const tp = resolveTerrainParams({ edgeMode: 'shared' });
        const a = createTerrainField(tp, 'tile_A');
        const b = createTerrainField(tp, 'tile_B');
        for (let t = -50; t <= 50; t += 2.5) {
            expect(a.elevation(t, 50)).toBeCloseTo(b.elevation(t, -50), 9);
            expect(a.elevation(t, 50)).toBeCloseTo(b.elevation(50, t), 9);
            expect(a.elevation(t, 50)).toBeCloseTo(b.elevation(-50, -t), 9);
        }
    });

    it('режим flat: на границе рельеф равен нулю', () => {
        const f = createTerrainField(resolveTerrainParams({ edgeMode: 'flat' }), 'tile_A');
        for (let t = -50; t <= 50; t += 5) {
            expect(f.elevation(t, 50)).toBeCloseTo(0, 9);
            expect(f.elevation(50, t)).toBeCloseTo(0, 9);
        }
    });

    it('seed детерминирован и различает тайлы; значения в 0..1', () => {
        const tp = resolveTerrainParams({});
        const a1 = createTerrainField(tp, 'tile_A');
        const a2 = createTerrainField(tp, 'tile_A');
        const b = createTerrainField(tp, 'tile_B');
        let diff = 0;
        for (let x = -45; x <= 45; x += 9) {
            for (let y = -45; y <= 45; y += 9) {
                const v = a1.elevation(x, y);
                expect(v).toBe(a2.elevation(x, y));
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
                diff += Math.abs(v - b.elevation(x, y));
            }
        }
        expect(diff).toBeGreaterThan(0.1);
    });
});

// --- Меш ------------------------------------------------------------------------

describe('меш с рельефом', () => {
    it('рельеф выключен — верх поля плоский и не измельчён', () => {
        const { geometry, features } = notchTile();
        const mesh = buildTileMesh(geometry, features, { terrain: { enabled: false } }, 'x');
        expect(mesh.stats.terrainTriangles).toBe(0);
        const { positions: P, normals: N } = mesh;
        for (let i = 0; i < P.length; i += 3) if (N[i + 1] > 0.01) expect([FIELD_TOP, CITY_TOP]).toContain(P[i + 1]);
    });

    it('amplitude = 0 тоже даёт плоские поля', () => {
        const { geometry, features } = notchTile();
        expect(buildTileMesh(geometry, features, { terrain: { amplitude: 0 } }, 'x').stats.terrainTriangles).toBe(0);
    });

    it('рельеф измельчает поле, держит высоты в диапазоне и не ломает ориентацию', () => {
        const { geometry, features } = notchTile();
        const mesh = buildTileMesh(geometry, features, { boundaryWalls: true, terrain: TERRAIN }, 'tile_TEST');
        expect(mesh.stats.terrainTriangles).toBeGreaterThan(200);
        expect(mesh.stats.maxTopDeviation).toBeLessThan(1e-6);
        expect(countInverted(mesh)).toBe(0);

        let maxY = -Infinity;
        for (let i = 0; i < mesh.positions.length; i += 3) {
            maxY = Math.max(maxY, mesh.positions[i + 1]);
            if (mesh.normals[i + 1] > 0.01) expect(mesh.positions[i + 1]).toBeGreaterThan(CITY_TOP - 1e-6);
        }
        expect(maxY).toBeLessThanOrEqual(FIELD_TOP + TERRAIN.amplitude + 1e-5);
        expect(maxY).toBeGreaterThan(FIELD_TOP + 1);
    });

    it('обычное поле строится равномерной сеткой без запасного пути', () => {
        const { geometry, features } = notchTile();
        const mesh = buildTileMesh(geometry, features, { terrain: TERRAIN }, 'tile_TEST');
        expect(mesh.stats.terrainFallbacks).toBe(0);
    });

    it('запасной путь (острый клин) тоже даёт целую поверхность со стыкованными стенами', () => {
        const wedge: Pt[] = [[-50, -50], [50, -50], [50, -48.5], [-50, 50]];
        const field = [wedge];
        const geometry = {
            tessellation: { areas: new Map(), lines: new Map() },
            decorations: { plazas: [], plazaGeometries: [] },
            clipping: { clippedLines: new Map() },
            fields: { fieldPolygons: [field] },
            assignments: { fieldGeometries: new Map([['field1', [field]]]) },
        } as never;
        const features = [{ id: 'field1', type: 'field' }] as never;
        const mesh = buildTileMesh(geometry, features, { boundaryWalls: true, terrain: TERRAIN }, 'wedge');
        expect(mesh.stats.terrainTriangles).toBeGreaterThan(0);
        expect(mesh.stats.maxTopDeviation).toBeLessThan(1e-6);
        expect(countInverted(mesh)).toBe(0);
    });

    it('группы покрывают индексы без дыр', () => {
        const { geometry, features } = notchTile();
        const mesh = buildTileMesh(geometry, features, { terrain: TERRAIN }, 'tile_TEST');
        let cursor = 0;
        for (const g of mesh.groups) {
            expect(g.start).toBe(cursor);
            expect(g.count % 3).toBe(0);
            cursor += g.count;
        }
        expect(cursor).toBe(mesh.indices.length);
    });

    it('стены идут по тем же вершинам, что и верх: щелей нет, у края города поле на плоском уровне', () => {
        const { geometry, features } = notchTile();
        const mesh = buildTileMesh(geometry, features, { boundaryWalls: true, terrain: TERRAIN }, 'tile_TEST');
        const cap = capVertexKeys(mesh);
        const { positions: P, normals: N } = mesh;

        let tops = 0;
        let maxTop = -Infinity;
        for (let i = 0; i < P.length; i += 3) {
            const x = P[i], y = P[i + 1], z = P[i + 2];
            const onNotch =
                (Math.abs(z + 10) < 1e-6 && Math.abs(x) <= 30 + 1e-6) ||
                (Math.abs(Math.abs(x) - 30) < 1e-6 && z >= -50 - 1e-6 && z <= -10 + 1e-6);
            if (N[i + 1] !== 0 || !onNotch || y <= BASE + 0.01 || Math.abs(y - CITY_TOP) < 1e-6) continue;
            tops++;
            maxTop = Math.max(maxTop, y);
            expect(cap.has(`${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`)).toBe(true);
        }
        expect(tops).toBeGreaterThan(10);
        expect(maxTop).toBeCloseTo(FIELD_TOP, 5);
    });

    it('полигон с дыркой (монастырь): стены дырки стыкуются с верхом, ориентация верна', () => {
        const { geometry, features } = holeTile();
        const mesh = buildTileMesh(geometry, features, { boundaryWalls: true, terrain: TERRAIN }, 'hole');
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

    it('детерминирован по seed, другой seed — другой меш', () => {
        const { geometry, features } = notchTile();
        const a = buildTileMesh(geometry, features, { terrain: TERRAIN }, 'tile_A');
        const a2 = buildTileMesh(geometry, features, { terrain: TERRAIN }, 'tile_A');
        const b = buildTileMesh(geometry, features, { terrain: TERRAIN }, 'tile_B');
        expect(Array.from(a.positions)).toEqual(Array.from(a2.positions));
        expect(Array.from(a.positions)).not.toEqual(Array.from(b.positions));
    });

    it('sampleMeshHeight: поле — выше плоского уровня, город — ровно 6, вне тайла — null', () => {
        const { geometry, features } = notchTile();
        const mesh = buildTileMesh(geometry, features, { terrain: TERRAIN }, 'tile_TEST');
        const inField = sampleMeshHeight(mesh, 0, 30)!;
        expect(inField).toBeGreaterThanOrEqual(FIELD_TOP - 1e-6);
        expect(inField).toBeLessThanOrEqual(FIELD_TOP + TERRAIN.amplitude + 1e-6);
        expect(sampleMeshHeight(mesh, 0, -30)!).toBeCloseTo(CITY_TOP, 6);
        expect(sampleMeshHeight(mesh, 80, 0)).toBeNull();
    });
});
