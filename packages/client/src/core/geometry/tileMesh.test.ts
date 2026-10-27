// packages/client/src/core/geometry/tileMesh.test.ts
// ============================================
// 🧪 ТЕСТЫ МЕША ТАЙЛА
// ============================================
// Проверяют, что буферы, отданные в three, корректны на ВСЕХ тайлах:
//   • триангуляция покрывает ровно площадь полигонов (earcut не «съел» дырки)
//   • нормали согласованы с ориентацией граней (нет вывернутых треугольников)
//   • геометрия лежит внутри тайла и ниже максимальной высоты
//   • группы по фичам покрывают весь буфер индексов без дыр и наложений
//   • ось север-юг не зеркалится (юг = +z, как в 2D)
//   • стены на границе тайла не строятся, пока их не попросили
//
// Тесты не зависят от того, правильно ли clipper вырезал дороги:
// они проверяют соответствие меша ПОЛИГОНАМ, которые ему дали.
// ============================================
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import { rotatePoint } from '@fiefdom/shared/core/tileUtils';
import { GEOMETRY_PARAMS } from './loadedGeometryParams';
import { auditTile, type AuditTile, type TileAudit } from './geometryAudit';
import {
    buildTileMesh,
    findMeshGroup,
    tileYaw,
    type TileMeshData,
} from './tileMesh';

const tiles = (baseData as unknown as { tiles: AuditTile[] }).tiles;
const GENERATED = { overwrite: true, geometryParams: GEOMETRY_PARAMS } as const;
const MESH = GEOMETRY_PARAMS.mesh;

const audits = new Map<string, TileAudit>(tiles.map((t) => [t.id, auditTile(t, GENERATED)]));
const meshOf = (id: string, params?: Parameters<typeof buildTileMesh>[2]): TileMeshData => {
    const audit = audits.get(id)!;
    return buildTileMesh(audit.geometry, audit.features, params ?? MESH);
};

const ids = tiles.map((t) => t.id);
const MAX_Y = MESH.baseHeight + Math.max(...Object.values(MESH.heights));

/**
 * Треугольники с |нормаль| меньше этого порога считаются вырожденными (площадь < 5e-4 юнит²).
 * Буферы хранятся в float32 (шаг ~4e-6 на координатах ~50), поэтому у почти нулевых
 * треугольников знак ориентации — шум округления, а не дефект. Они не дают ни одного пикселя.
 * Такие появляются из коллинеарных вершин после булевых операций (срез площади, края дорог).
 */
const DEGENERATE_NORMAL_LENGTH = 1e-3;

interface InvertedTriangle {
    triangle: number;
    featureId: string;
    surface: string;
    /** Удвоенная площадь треугольника */
    doubleArea: number;
    /** cos угла между геометрической нормалью и нормалью вершины (−1 = перевёрнут) */
    cos: number;
    points: number[][];
}

/** Треугольники, чья геометрическая нормаль противоположна нормали вершины (с описанием для отчёта) */
function findInverted(mesh: TileMeshData): InvertedTriangle[] {
    const P = mesh.positions;
    const N = mesh.normals;
    const I = mesh.indices;
    const found: InvertedTriangle[] = [];

    for (let i = 0; i < I.length; i += 3) {
        const a = I[i] * 3;
        const b = I[i + 1] * 3;
        const c = I[i + 2] * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;

        const length = Math.hypot(nx, ny, nz);
        if (length < DEGENERATE_NORMAL_LENGTH) continue;

        const cos = (nx * N[a] + ny * N[a + 1] + nz * N[a + 2]) / length;
        if (cos >= 0) continue;

        const group = findMeshGroup(mesh, i / 3);
        found.push({
            triangle: i / 3,
            featureId: group?.featureId ?? '?',
            surface: group?.surface ?? '?',
            doubleArea: length,
            cos,
            points: [a, b, c].map((v) => [P[v], P[v + 1], P[v + 2]].map((x) => Math.round(x * 1e4) / 1e4)),
        });
    }
    return found;
}

describe('меш тайла', () => {
    it.each(ids)('%s: площадь триангуляции совпадает с площадью полигонов', (id) => {
        expect(meshOf(id).stats.maxTopDeviation).toBeLessThan(1e-6);
    });

    it.each(ids)('%s: нет вывернутых треугольников', (id) => {
        // При падении vitest покажет, какой именно треугольник, в какой фиче и какой он площади
        expect(findInverted(meshOf(id))).toEqual([]);
    });

    it.each(ids)('%s: геометрия лежит внутри тайла и ниже максимальной высоты', (id) => {
        const { positions } = meshOf(id);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            minX = Math.min(minX, positions[i]);
            maxX = Math.max(maxX, positions[i]);
            minY = Math.min(minY, positions[i + 1]);
            maxY = Math.max(maxY, positions[i + 1]);
            minZ = Math.min(minZ, positions[i + 2]);
            maxZ = Math.max(maxZ, positions[i + 2]);
        }
        expect(Math.min(minX, minZ)).toBeGreaterThan(-50 - 1e-6);
        expect(Math.max(maxX, maxZ)).toBeLessThan(50 + 1e-6);
        expect(minY).toBeGreaterThan(MESH.baseHeight - 1e-6);
        expect(maxY).toBeLessThan(MAX_Y + 1e-6);
    });

    it.each(ids)('%s: группы покрывают индексы без дыр и наложений', (id) => {
        const mesh = meshOf(id);
        let cursor = 0;
        for (const group of mesh.groups) {
            expect(group.start).toBe(cursor);
            expect(group.count % 3).toBe(0);
            cursor += group.count;
        }
        expect(cursor).toBe(mesh.indices.length);
    });

    it.each(ids)('%s: по индексу любого треугольника находится группа', (id) => {
        const mesh = meshOf(id);
        const triangles = mesh.indices.length / 3;
        for (const face of [0, Math.floor(triangles / 2), triangles - 1]) {
            expect(findMeshGroup(mesh, face)).not.toBeNull();
        }
    });
});

describe('findInverted (самопроверка теста)', () => {
    const synthetic = (positions: number[]): TileMeshData => ({
        positions: new Float32Array(positions),
        normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), // все вершины смотрят вверх
        colors: new Float32Array(9),
        indices: new Uint32Array([0, 1, 2]),
        groups: [{ featureId: 'f', surface: 'field', start: 0, count: 3 }],
        stats: {
            vertices: 3, triangles: 1, topTriangles: 1, wallQuads: 0,
            maxTopDeviation: 0, skippedBoundaryEdges: 0,
        },
    });

    it('находит настоящий вывернутый треугольник и описывает его', () => {
        // (B−A)×(C−A) направлен вниз, а нормаль вершин — вверх
        const found = findInverted(synthetic([0, 5, 0, 10, 5, 0, 0, 5, 10]));
        expect(found.length).toBe(1);
        expect(found[0].featureId).toBe('f');
        expect(found[0].cos).toBeLessThan(-0.99);
    });

    it('не принимает правильный треугольник за вывернутый', () => {
        expect(findInverted(synthetic([0, 5, 0, 10, 5, 0, 0, 5, -10]))).toEqual([]);
    });

    it('игнорирует вырожденный треугольник, у которого знак — шум округления', () => {
        // Тот же «вниз», но площадь ~1e-5: не дефект, а float32
        expect(findInverted(synthetic([0, 5, 0, 1, 5, 0, 0, 5, 1e-5]))).toEqual([]);
    });
});

describe('ориентация и стены', () => {
    it('юг остаётся югом: город CCFC (север, восток, запад) смещён в −z', () => {
        const mesh = meshOf('tile_CCFC');
        const P = mesh.positions;
        const N = mesh.normals;

        // Центроид крышек города по площади треугольников
        let weighted = 0;
        let total = 0;
        for (const group of mesh.groups) {
            if (group.surface !== 'city') continue;
            for (let i = group.start; i < group.start + group.count; i += 3) {
                const a = mesh.indices[i] * 3;
                const b = mesh.indices[i + 1] * 3;
                const c = mesh.indices[i + 2] * 3;
                if (N[a + 1] < 0.99) continue; // только горизонтальные крышки
                const area =
                    Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[b + 2] - P[a + 2]) * (P[c] - P[a])) / 2;
                weighted += area * ((P[a + 2] + P[b + 2] + P[c + 2]) / 3);
                total += area;
            }
        }
        // Зеркало по оси север-юг дало бы положительное значение
        expect(total).toBeGreaterThan(0);
        expect(weighted / total).toBeLessThan(0);
    });

    it('поворот инстанса: rotation.y = −θ даёт тот же результат, что 2D-поворот тайла', () => {
        // Матрица поворота three вокруг Y (правая система, y вверх)
        const rotateY = (x: number, z: number, phi: number): [number, number] => [
            x * Math.cos(phi) + z * Math.sin(phi),
            -x * Math.sin(phi) + z * Math.cos(phi),
        ];
        for (const rotation of [0, 90, 180, 270] as const) {
            for (const [x, y] of [[0, -50], [50, 0], [13, -27], [-40, 22]]) {
                const expected = rotatePoint(x, y, rotation); // y 2D == z в 3D
                const [rx, rz] = rotateY(x, y, tileYaw(rotation));
                expect(Math.abs(rx - expected.x)).toBeLessThan(1e-9);
                expect(Math.abs(rz - expected.y)).toBeLessThan(1e-9);
            }
        }
    });

    it.each(ids)('%s: стены по границе тайла не строятся по умолчанию и строятся по запросу', (id) => {
        const off = meshOf(id, { ...MESH, boundaryWalls: false });
        const on = meshOf(id, { ...MESH, boundaryWalls: true });
        expect(off.stats.skippedBoundaryEdges).toBeGreaterThan(0);
        expect(on.stats.skippedBoundaryEdges).toBe(0);
        expect(on.stats.wallQuads).toBeGreaterThan(off.stats.wallQuads);
        expect(findInverted(on)).toEqual([]);
    });

    it('снимок размеров мешей: рост числа треугольников виден в диффе', () => {
        const sizes = Object.fromEntries(
            ids.map((id) => {
                const { stats } = meshOf(id);
                return [id, [stats.vertices, stats.triangles]];
            })
        );
        expect(sizes).toMatchSnapshot();
    });
});
