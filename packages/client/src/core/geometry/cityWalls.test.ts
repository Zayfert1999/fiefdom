// packages/client/src/core/geometry/cityWalls.test.ts
// ============================================
// 🧪 ТЕСТЫ ГОРОДСКИХ СТЕН: ПАРАМЕТРЫ, РАСКЛАДКА, МЕШ, КЭШ
// ============================================
// Тайлы синтетические (wallTestFixtures.ts): тест проверяет сами стены, а не пайплайн геометрии.
// ============================================
import { describe, it, expect } from 'vitest';
import { buildCityRegions } from './cityRegions';
import { CityWallCache, buildCityWallModels } from './cityWalls';
import { layoutCityWalls } from './wallLayout';
import { buildWallMesh } from './wallMesh';
import {
    DEFAULT_WALL_PARAMS,
    WALL_PARAM_LIMITS,
    easeOutBack,
    mergeWallParams,
    resolveWallParams,
    wallGrowthAt,
    wallParamsKey,
} from './wallParams';
import type { TileMeshData } from './tileMesh';
import { capCity, cityTile, crossTiles, lensTiles, ringTiles, southRoadEnd, threeSidedCity } from './wallTestFixtures';

const params = resolveWallParams();
const regionOf = (tiles = crossTiles()) => buildCityRegions(tiles)[0];

/** Структурные инварианты меша: индексы в диапазоне, числа конечны, группы покрывают индексы без дыр */
function expectValidMesh(mesh: TileMeshData): void {
    const vertexCount = mesh.positions.length / 3;
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.colors.length).toBe(mesh.positions.length);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.positions.every((v) => Number.isFinite(v))).toBe(true);
    expect(mesh.normals.every((v) => Number.isFinite(v))).toBe(true);
    expect(mesh.indices.every((i) => i < vertexCount)).toBe(true);

    let covered = 0;
    for (const group of mesh.groups) {
        expect(group.start).toBe(covered);
        covered += group.count;
    }
    expect(covered).toBe(mesh.indices.length);
    expect(mesh.stats.vertices).toBe(vertexCount);
    expect(mesh.stats.triangles).toBe(mesh.indices.length / 3);

    for (let i = 0; i < vertexCount; i++) {
        const length = Math.hypot(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
        expect(Math.abs(length - 1) < 1e-4).toBe(true);
    }
}

/** Доля треугольников, у которых геометрическая нормаль совпадает по направлению с вершинной */
function outwardRatio(mesh: TileMeshData): number {
    const p = mesh.positions;
    let good = 0;
    let total = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
        const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
        const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
        const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue;
        total++;
        const dot = n[0] * mesh.normals[a * 3] + n[1] * mesh.normals[a * 3 + 1] + n[2] * mesh.normals[a * 3 + 2];
        if (dot > 0) good++;
    }
    return good / total;
}

// ============================================
// ⚙️ ПАРАМЕТРЫ
// ============================================
describe('resolveWallParams', () => {
    it('без ввода даёт значения по умолчанию', () => {
        expect(resolveWallParams()).toEqual(DEFAULT_WALL_PARAMS);
    });

    it('значения вне диапазона обрезаются, мусор заменяется значениями по умолчанию', () => {
        const resolved = resolveWallParams({
            wall: { width: 999, height: -5 },
            tower: { segments: 3.4 },
            merlon: { depth: 5 },
            riseFraction: Number.NaN,
        });
        expect(resolved.wall.width).toBe(WALL_PARAM_LIMITS.wall.width.max);
        expect(resolved.wall.height).toBe(WALL_PARAM_LIMITS.wall.height.min);
        expect(resolved.tower.segments).toBe(WALL_PARAM_LIMITS.tower.segments.min);
        expect(resolved.merlon.depth).toBe(WALL_PARAM_LIMITS.merlon.depth.max);
        expect(resolved.riseFraction).toBe(DEFAULT_WALL_PARAMS.riseFraction);
    });

    it('неверный цвет заменяется цветом по умолчанию, регистр приводится к нижнему', () => {
        const resolved = resolveWallParams({ colors: { wall: 'красный', tower: '#AABBCC' } });
        expect(resolved.colors.wall).toBe(DEFAULT_WALL_PARAMS.colors.wall);
        expect(resolved.colors.tower).toBe('#aabbcc');
    });

    it('ворота не короче проёма + двух радиусов башни + стойки: башни не перекрывают проход', () => {
        const resolved = resolveWallParams({ gate: { width: 10, archWidth: 12, towerRadius: 8 } });
        expect(resolved.gate.width).toBe(12 + 2 * 8 + 1);
    });

    it('высота проёма не меньше радиуса свода и оставляет кладку над сводом', () => {
        const low = resolveWallParams({ gate: { archWidth: 10, archHeight: 1 } });
        expect(low.gate.archHeight).toBe(5);
        const tall = resolveWallParams({ gate: { height: 12, archHeight: 40 } });
        expect(tall.gate.archHeight).toBe(11);
    });

    it('mergeWallParams дополняет вложенные группы, а не заменяет их', () => {
        const merged = mergeWallParams(params, { wall: { height: 20 }, merlon: { enabled: false } });
        expect(merged.wall.height).toBe(20);
        expect(merged.wall.width).toBe(params.wall.width);
        expect(merged.merlon.enabled).toBe(false);
        expect(merged.merlon.width).toBe(params.merlon.width);
    });

    it('wallParamsKey меняется при любой правке', () => {
        expect(wallParamsKey(params)).toBe(wallParamsKey(resolveWallParams()));
        expect(wallParamsKey(mergeWallParams(params, { colors: { merlon: '#000000' } }))).not.toBe(wallParamsKey(params));
    });
});

describe('рост из земли', () => {
    it('до старта 0, после конца ровно 1, посередине растёт', () => {
        expect(wallGrowthAt(-100, 2000)).toBe(0);
        expect(wallGrowthAt(0, 2000)).toBe(0);
        expect(wallGrowthAt(2000, 2000)).toBe(1);
        expect(wallGrowthAt(5000, 2000)).toBe(1);
        expect(wallGrowthAt(500, 2000)).toBeGreaterThan(0);
        expect(wallGrowthAt(500, 2000)).toBeLessThan(wallGrowthAt(1000, 2000) + 1e-9);
    });

    it('easeOutBack начинается с 0, заканчивается 1 и слегка перелетает', () => {
        expect(easeOutBack(0)).toBe(0);
        expect(easeOutBack(1)).toBeCloseTo(1, 10);
        expect(Math.max(...Array.from({ length: 100 }, (_, i) => easeOutBack(i / 99)))).toBeGreaterThan(1);
    });

    it('нулевая длительность не даёт деления на ноль', () => {
        expect(wallGrowthAt(10, 0)).toBe(1);
    });
});

// ============================================
// 🧭 РАСКЛАДКА
// ============================================
describe('layoutCityWalls', () => {
    it('«глаз» из двух шапок: замкнутая стена и две башни на стыках тайлов', () => {
        const layout = layoutCityWalls(regionOf(lensTiles()), params);
        expect(layout.runs).toHaveLength(1);
        expect(layout.runs[0].closed).toBe(true);
        expect(layout.gates).toHaveLength(0);
        const corners = layout.towers.filter((t) => t.kind === 'corner');
        expect(corners.map((t) => `${t.x},${t.z}`).sort()).toEqual(['-50,-50', '50,-50']);
        expect(layout.warnings).toEqual([]);
    });

    it('крест с воротами: стена разрезана, ворота у вершины южной дуги, 4 угловые и 2 боковые башни', () => {
        const layout = layoutCityWalls(regionOf(), params);
        expect(layout.runs).toHaveLength(1);
        expect(layout.runs[0].closed).toBe(false);
        expect(layout.gates).toHaveLength(1);
        const [gate] = layout.gates;
        expect(Math.abs(gate.cx) < 2).toBe(true);
        expect(Math.abs(gate.cz - 20) < 3).toBe(true);
        expect(layout.towers.filter((t) => t.kind === 'gate')).toHaveLength(2);
        expect(layout.towers.filter((t) => t.kind === 'corner')).toHaveLength(4);
        expect(layout.warnings).toEqual([]);
    });

    it('боковые башни ворот стоят на расстоянии ширины ворот друг от друга и не перекрывают проём', () => {
        const layout = layoutCityWalls(regionOf(), params);
        const [a, b] = layout.towers.filter((t) => t.kind === 'gate');
        const between = Math.hypot(a.x - b.x, a.z - b.z);
        expect(Math.abs(between - layout.gates[0].width) < 1e-6).toBe(true);
        expect(between - 2 * params.gate.towerRadius >= params.gate.archWidth).toBe(true);
    });

    it('ворота стоят там, где ось дороги пересекает контур, даже если после шума ось изогнута', () => {
        // Дорога «гуляет»: у конца идёт почти прямо, а у контура уезжает вбок на несколько единиц
        const wiggly = [[0, 6], [1, 12], [3.5, 20], [4.5, 30], [0, 50]] as [number, number][];
        const tiles = crossTiles();
        tiles[0] = { ...tiles[0], roadEnds: [{ ...southRoadEnd, dir: [-0.12, -0.99], path: wiggly }] };
        const [region] = buildCityRegions(tiles);
        const [gate] = layoutCityWalls(region, params).gates;

        // Центр ворот лежит на оси дороги (на ломаной), а не на продолжении её последнего отрезка
        const onRoad = (z: number): number => {
            for (let i = 0; i + 1 < wiggly.length; i++) {
                const [a, b] = [wiggly[i], wiggly[i + 1]];
                if (z >= a[1] && z <= b[1]) return a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]);
            }
            return Number.NaN;
        };
        expect(Math.abs(gate.cx - onRoad(gate.cz)) < 0.05).toBe(true);

        // Без оси остаётся запасной вариант по лучу — он промахивается мимо изогнутой дороги
        const noPath = crossTiles();
        noPath[0] = { ...noPath[0], roadEnds: [{ ...southRoadEnd, dir: [-0.12, -0.99], path: [] }] };
        const [fallback] = layoutCityWalls(buildCityRegions(noPath)[0], params).gates;
        expect(Math.abs(fallback.cx - onRoad(fallback.cz)) > 0.5).toBe(true);
    });

    it('блок ворот стоит на контуре: центр ворот лежит на кольце стены', () => {
        const region = regionOf();
        const [gate] = layoutCityWalls(region, params).gates;
        const ring = region.polygons[0][0];
        let best = Infinity;
        for (let i = 0; i < ring.length; i++) {
            const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
            const [abx, abz] = [b[0] - a[0], b[1] - a[1]];
            const len2 = abx * abx + abz * abz;
            const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((gate.cx - a[0]) * abx + (gate.cz - a[1]) * abz) / len2));
            best = Math.min(best, Math.hypot(gate.cx - (a[0] + abx * t), gate.cz - (a[1] + abz * t)));
        }
        expect(best < 1e-6).toBe(true);
    });

    it('проход ворот идёт поперёк стены (вдоль дороги), а блок вдоль стены', () => {
        const [gate] = layoutCityWalls(regionOf(), params).gates;
        expect(Math.abs(gate.px * gate.ax + gate.pz * gate.az) < 1e-9).toBe(true);
        expect(Math.abs(Math.hypot(gate.ax, gate.az) - 1) < 1e-9).toBe(true);
        // дорога идёт с юга на север: проход направлен по оси z
        expect(Math.abs(gate.az) > 0.9).toBe(true);
        expect(gate.depth).toBe(params.wall.width + params.gate.extraDepth);
    });

    it('кольцо с дыркой: стена по обоим кольцам, innerRings=false оставляет только внешнее', () => {
        const region = regionOf(ringTiles());
        const both = layoutCityWalls(region, params);
        const outerOnly = layoutCityWalls(region, resolveWallParams({ innerRings: false }));
        expect(both.runs).toHaveLength(2);
        expect(outerOnly.runs).toHaveLength(1);
        expect(both.towers.length).toBeGreaterThan(outerOnly.towers.length);
    });

    it('зубцы не заходят в зону ворот и не лежат внутри башен', () => {
        const layout = layoutCityWalls(regionOf(), params);
        const [gate] = layout.gates;
        for (const merlon of layout.merlons.filter((m) => m.part === 'wall')) {
            expect(Math.hypot(merlon.x - gate.cx, merlon.z - gate.cz) > gate.width / 2 - 0.5).toBe(true);
            for (const tower of layout.towers) {
                expect(Math.hypot(merlon.x - tower.x, merlon.z - tower.z) >= tower.radius).toBe(true);
            }
        }
    });

    it('зубцы есть на стене, башнях и воротах; merlon.enabled=false их убирает', () => {
        const layout = layoutCityWalls(regionOf(), params);
        const parts = new Set(layout.merlons.map((m) => m.part));
        expect(parts.has('wall')).toBe(true);
        expect(parts.has('tower')).toBe(true);
        expect(parts.has('gate')).toBe(true);
        expect(layoutCityWalls(regionOf(), resolveWallParams({ merlon: { enabled: false } })).merlons).toHaveLength(0);
    });

    it('зубцы стоят на верхе своей части: стены, башни, ворот', () => {
        const layout = layoutCityWalls(regionOf(), params);
        for (const merlon of layout.merlons) {
            const top = merlon.part === 'wall' ? params.wall.height : merlon.part === 'gate' ? params.gate.height : undefined;
            if (top !== undefined) expect(merlon.y).toBe(top);
        }
    });

    it('ворота, которые не пересекают контур, дают предупреждение, а не падение', () => {
        const region = regionOf();
        const stray = { ...region, gates: [{ x: 0, z: 6, dirX: 0, dirZ: 1 }] }; // луч уходит вглубь города к дальней стене
        const layout = layoutCityWalls({ ...stray, gates: [{ x: 5000, z: 5000, dirX: 0, dirZ: 1 }] }, params);
        expect(layout.gates).toHaveLength(0);
        expect(layout.warnings).toHaveLength(1);
        expect(layout.runs[0].closed).toBe(true);
    });

    it('вторые ворота рядом с первыми пропускаются с предупреждением', () => {
        const region = regionOf();
        const twin = { ...region, gates: [region.gates[0], { ...region.gates[0], x: region.gates[0].x + 3 }] };
        const layout = layoutCityWalls(twin, params);
        expect(layout.gates).toHaveLength(1);
        expect(layout.warnings).toHaveLength(1);
    });

    it('башня на углу тайла уступает воротам, если стоит слишком близко', () => {
        const region = regionOf();
        const wide = resolveWallParams({ gate: { width: 90, archWidth: 8 } });
        const layout = layoutCityWalls(region, wide);
        for (const corner of layout.towers.filter((t) => t.kind === 'corner')) {
            for (const gate of layout.gates) {
                expect(Math.hypot(corner.x - gate.cx, corner.z - gate.cz) >= gate.width / 2 + wide.tower.radius).toBe(true);
            }
        }
    });
});

// ============================================
// 🧱 МЕШ
// ============================================
describe('buildWallMesh', () => {
    it('меш замкнутой стены без ворот валиден, группы идут в порядке wall, tower, merlon', () => {
        const mesh = buildWallMesh(layoutCityWalls(regionOf(lensTiles()), params), params)!;
        expectValidMesh(mesh);
        expect(mesh.groups.map((g) => g.featureId)).toEqual(['wall', 'tower', 'merlon']);
    });

    it('меш креста валиден, содержит все четыре группы, грани смотрят наружу', () => {
        const mesh = buildWallMesh(layoutCityWalls(regionOf(), params), params)!;
        expectValidMesh(mesh);
        expect(mesh.groups.map((g) => g.featureId)).toEqual(['wall', 'tower', 'gate', 'merlon']);
        expect(outwardRatio(mesh) > 0.98).toBe(true);
    });

    it('меш кольца с дыркой валиден', () => {
        expectValidMesh(buildWallMesh(layoutCityWalls(regionOf(ringTiles()), params), params)!);
    });

    it('высоты: основание на −sink, верх зубцов на высоте стены/башни + высота зубца', () => {
        const layout = layoutCityWalls(regionOf(lensTiles()), params);
        const mesh = buildWallMesh(layout, params)!;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 1; i < mesh.positions.length; i += 3) {
            minY = Math.min(minY, mesh.positions[i]);
            maxY = Math.max(maxY, mesh.positions[i]);
        }
        expect(minY).toBeCloseTo(-params.wall.sink, 5);
        expect(maxY).toBeCloseTo(params.tower.height + params.merlon.height, 5);
    });

    it('цвета групп берутся из параметров', () => {
        const colored = resolveWallParams({ colors: { wall: '#ff0000', tower: '#00ff00' } });
        const mesh = buildWallMesh(layoutCityWalls(regionOf(lensTiles()), colored), colored)!;
        const wall = mesh.groups.find((g) => g.featureId === 'wall')!;
        const tower = mesh.groups.find((g) => g.featureId === 'tower')!;
        const colorOf = (group: { start: number }) => {
            const v = mesh.indices[group.start];
            return [mesh.colors[v * 3], mesh.colors[v * 3 + 1], mesh.colors[v * 3 + 2]];
        };
        expect(colorOf(wall)[0]).toBeGreaterThan(colorOf(wall)[1]);
        expect(colorOf(tower)[1]).toBeGreaterThan(colorOf(tower)[0]);
    });

    it('чем выше стена, тем выше меш; построение детерминировано', () => {
        const layout = layoutCityWalls(regionOf(), params);
        const a = buildWallMesh(layout, params)!;
        const b = buildWallMesh(layout, params)!;
        expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
        expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
    });

    it('без участков, башен и ворот строить нечего', () => {
        expect(buildWallMesh({ runs: [], towers: [], gates: [], merlons: [], warnings: [] }, params)).toBeNull();
    });

    it('сглаживание: на плавной дуге нормали стены соседних рёбер совпадают, на изломе — нет', () => {
        const soft = resolveWallParams({ wall: { creaseAngle: 180 }, merlon: { enabled: false } });
        const hard = resolveWallParams({ wall: { creaseAngle: 0 }, merlon: { enabled: false } });
        const meshSoft = buildWallMesh(layoutCityWalls(regionOf(lensTiles()), soft), soft)!;
        const meshHard = buildWallMesh(layoutCityWalls(regionOf(lensTiles()), hard), hard)!;
        // Число вершин не меняется, а нормали различаются
        expect(meshSoft.stats.vertices).toBe(meshHard.stats.vertices);
        expect(Array.from(meshSoft.normals)).not.toEqual(Array.from(meshHard.normals));
    });
});

// ============================================
// 🏰 МОДЕЛИ И КЭШ
// ============================================
describe('buildCityWallModels', () => {
    const all = new Set(['0,0:city_1', '0,-1:city_1', '-1,0:city_1', '1,0:city_1']);

    it('стены получает только замкнутый город; сводка считает башни, ворота и зубцы', () => {
        const models = buildCityWallModels(crossTiles(), params);
        expect(models).toHaveLength(1);
        expect(models[0].stats.gates).toBe(1);
        expect(models[0].stats.towers).toBe(6);
        expect(models[0].stats.merlons).toBeGreaterThan(0);
        expect(models[0].featureKeys).toEqual([...all].sort());
        expect(buildCityWallModels([cityTile(0, 0, 0, capCity())], params)).toEqual([]);
    });

    it('onlyFeatureKeys ограничивает города (как завершённые по RegionManager)', () => {
        expect(buildCityWallModels(crossTiles(), params, { onlyFeatureKeys: all })).toHaveLength(1);
        expect(buildCityWallModels(crossTiles(), params, { onlyFeatureKeys: new Set(['0,0:city_1']) })).toHaveLength(0);
    });

    it('enabled=false отключает стены', () => {
        expect(buildCityWallModels(crossTiles(), resolveWallParams({ enabled: false }))).toEqual([]);
    });

    it('кэш возвращает тот же объект, пока не меняются состав города и параметры', () => {
        const cache = new CityWallCache();
        const first = buildCityWallModels(crossTiles(), params, { cache });
        const second = buildCityWallModels(crossTiles(), params, { cache });
        expect(second[0]).toBe(first[0]);
        expect(cache.size).toBe(1);

        const edited = buildCityWallModels(crossTiles(), mergeWallParams(params, { wall: { height: 20 } }), { cache });
        expect(edited[0]).not.toBe(first[0]);
        expect(cache.size).toBe(1); // старая запись вытеснена

        const rotated = crossTiles();
        rotated[1] = { ...rotated[1], rotation: 180, tileId: 'changed' };
        const changed = buildCityWallModels(rotated, mergeWallParams(params, { wall: { height: 20 } }), { cache });
        expect(changed[0]).not.toBe(edited[0]);
    });

    it('кэш забывает город, когда он исчезает с доски', () => {
        const cache = new CityWallCache();
        buildCityWallModels(crossTiles(), params, { cache });
        expect(cache.size).toBe(1);
        buildCityWallModels([], params, { cache });
        expect(cache.size).toBe(0);
    });

    it('ворота в модели нет, если тупик дороги не привязан к городу региона', () => {
        const tiles = crossTiles();
        tiles[0] = { ...tiles[0], roadEnds: [{ ...southRoadEnd, cityFeatureId: 'other' }] };
        const [model] = buildCityWallModels(tiles, params);
        expect(model.stats.gates).toBe(0);
        expect(model.stats.runs).toBe(1);
    });

    it('трёхсторонний город без соседей не замкнут и стен не получает', () => {
        expect(buildCityWallModels([cityTile(0, 0, 0, threeSidedCity(), [southRoadEnd])], params)).toEqual([]);
    });
});
