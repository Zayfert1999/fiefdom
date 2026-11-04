// packages/client/src/core/geometry/shapes.test.ts
// ============================================
// 🧪 ПАРАМЕТРЫ ФОРМ: ГОРОД, МОНАСТЫРЬ, ДОРОГА
// ============================================
// Раньше числа были зашиты константами в генераторах. Теперь они в geometryParams.json
// (секция shapes). Тесты проверяют три вещи:
//   • значения по умолчанию совпадают с прежними константами (форма тайлов не изменилась);
//   • каждый параметр доходит до геометрии и затрагивает только «свои» тайлы;
//   • в допустимых диапазонах форма остаётся простой (на краях диапазонов и на случайных комбинациях).
// ============================================
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import { GEOMETRY_PARAMS } from './loadedGeometryParams';
import { auditTile, type AuditTile } from './geometryAudit';
import { parseGeometryParams, hashGeometryParams, resolveGeometryParams } from './geometryParams';
import {
    DEFAULT_SHAPE_PARAMS,
    SHAPE_PARAM_LIMITS,
    resolveShapeParams,
    roadCornerRadiusFloor,
    type ShapeParamsInput,
} from './generators/shapeParams';
import { generateFeatureGeometries } from './generators';
import { tessellateArea } from './tessellate';

const tiles = (baseData as unknown as { tiles: AuditTile[] }).tiles;
const tileById = (id: string): AuditTile => tiles.find((t) => t.id === id)!;

const signature = (id: string, shapes?: ShapeParamsInput): string =>
    auditTile(tileById(id), { geometryParams: GEOMETRY_PARAMS, shapes }).signature;

const baseline = (id: string): string => signature(id);

// Тайлы, на которых виден каждый параметр
const CITY_CAP = 'tile_CCFC'; // город с вырезом без дороги
const CITY_ROAD_ARC = 'tile_CCRC'; // город с вырезом под тупиковую дорогу
const CITY_DIAG = 'tile_CCFF'; // город с диагональной границей
const MONASTERY = 'tile_FFRF-M'; // монастырь с тупиковой дорогой
const ROAD_CORNER = 'tile_CFRR'; // поворот дороги
const ROAD_STRAIGHT = 'tile_RFRF'; // прямая дорога

describe('значения по умолчанию', () => {
    it('совпадают с прежними зашитыми константами формы', () => {
        expect(DEFAULT_SHAPE_PARAMS.city).toEqual({ capDepth: 20, roadArcDepth: 30, diagBulge: 20 });
        expect(DEFAULT_SHAPE_PARAMS.monastery).toEqual({ halfExtent: 20, cornerRadius: 5 });
        // поворот: прежние «хвост 25, вынос 15» = радиус 25, натяжение 0.6
        expect(DEFAULT_SHAPE_PARAMS.road.width).toBe(20);
        expect(DEFAULT_SHAPE_PARAMS.road.cornerRadius).toBe(25);
        expect(DEFAULT_SHAPE_PARAMS.road.cornerRadius * DEFAULT_SHAPE_PARAMS.road.cornerTension).toBeCloseTo(15, 9);
    });

    it('пустой ввод даёт значения по умолчанию, лишнее и мусор игнорируется', () => {
        expect(resolveShapeParams()).toEqual(DEFAULT_SHAPE_PARAMS);
        expect(resolveShapeParams({ city: { capDepth: Number.NaN } }).city.capDepth).toBe(20);
    });
});

describe('ограничения значений', () => {
    it('значения обрезаются по диапазонам', () => {
        const low = resolveShapeParams({ city: { capDepth: -5 }, monastery: { halfExtent: 1 } });
        const high = resolveShapeParams({ city: { capDepth: 999 }, road: { width: 500, endOverlap: 99 } });
        expect(low.city.capDepth).toBe(SHAPE_PARAM_LIMITS.city.capDepth[0]);
        expect(low.monastery.halfExtent).toBe(SHAPE_PARAM_LIMITS.monastery.halfExtent[0]);
        expect(high.city.capDepth).toBe(SHAPE_PARAM_LIMITS.city.capDepth[1]);
        expect(high.road.width).toBe(SHAPE_PARAM_LIMITS.road.width[1]);
        expect(high.road.endOverlap).toBe(SHAPE_PARAM_LIMITS.road.endOverlap[1]);
    });

    it('скругление монастыря не больше половины его стороны', () => {
        const small = resolveShapeParams({ monastery: { halfExtent: 6, cornerRadius: 20 } });
        expect(small.monastery.cornerRadius).toBe(6);
    });

    it('радиус поворота дороги подтягивается под ширину', () => {
        expect(roadCornerRadiusFloor(20)).toBe(25);
        expect(resolveShapeParams({ road: { width: 40, cornerRadius: 10 } }).road.cornerRadius).toBe(
            roadCornerRadiusFloor(40)
        );
        // а у тонкой дороги порог ниже
        expect(resolveShapeParams({ road: { width: 4, cornerRadius: 10 } }).road.cornerRadius).toBe(17);
    });

    it('в файле параметров неверные значения дают замечания, неизвестные ключи тоже', () => {
        const { params, warnings } = parseGeometryParams({
            version: 1,
            shapes: { road: { width: 99, cornerStub: 5 }, monastery: { halfExtent: 'большой' } },
        });
        expect(params.shapes.road.width).toBe(40);
        expect(warnings.some((w) => w.includes('shapes.road.width'))).toBe(true);
        expect(warnings.some((w) => w.includes('shapes.road.cornerStub'))).toBe(true);
        expect(warnings.some((w) => w.includes('shapes.monastery.halfExtent'))).toBe(true);
    });

    it('хэш параметров меняется при правке формы', () => {
        const edited = resolveGeometryParams({ ...GEOMETRY_PARAMS, shapes: { city: { capDepth: 22 } } });
        expect(hashGeometryParams(edited)).not.toBe(hashGeometryParams(GEOMETRY_PARAMS));
    });
});

describe('каждый параметр доходит до геометрии', () => {
    it('city.capDepth меняет город с вырезом, но не монастырь и не дорогу', () => {
        const shapes = { city: { capDepth: 30 } };
        expect(signature(CITY_CAP, shapes)).not.toBe(baseline(CITY_CAP));
        expect(signature(MONASTERY, shapes)).toBe(baseline(MONASTERY));
        expect(signature(ROAD_STRAIGHT, shapes)).toBe(baseline(ROAD_STRAIGHT));
    });

    it('city.roadArcDepth меняет вырез под тупиковую дорогу (и вместе с ним длину дороги)', () => {
        const shapes = { city: { roadArcDepth: 38 } };
        expect(signature(CITY_ROAD_ARC, shapes)).not.toBe(baseline(CITY_ROAD_ARC));
        expect(signature(CITY_CAP, shapes)).toBe(baseline(CITY_CAP));
    });

    it('city.diagBulge меняет диагональную границу', () => {
        expect(signature(CITY_DIAG, { city: { diagBulge: 8 } })).not.toBe(baseline(CITY_DIAG));
    });

    it('monastery.halfExtent и cornerRadius меняют монастырь, но не города', () => {
        for (const shapes of [{ monastery: { halfExtent: 28 } }, { monastery: { cornerRadius: 0 } }]) {
            expect(signature(MONASTERY, shapes)).not.toBe(baseline(MONASTERY));
            expect(signature(CITY_CAP, shapes)).toBe(baseline(CITY_CAP));
        }
    });

    it('размер монастыря соответствует halfExtent, а тупиковая дорога подстраивается под него', () => {
        const half = 28;
        const audit = auditTile(tileById(MONASTERY), {
            geometryParams: GEOMETRY_PARAMS,
            noiseEnabled: false,
            shapes: { monastery: { halfExtent: half, cornerRadius: 0 } },
        });
        const monastery = audit.features.find((f) => f.type === 'monastery')!;
        const ring = tessellateArea(monastery.geometry as never);
        const xs = ring.map((p) => p[0]);
        expect(Math.max(...xs)).toBeCloseTo(half, 6);
        expect(Math.min(...xs)).toBeCloseTo(-half, 6);
        expect(audit.issues.filter((i) => i.severity === 'error')).toEqual([]);
    });

    it('road.width меняет дороги, но не города', () => {
        const shapes = { road: { width: 14 } };
        expect(signature(ROAD_STRAIGHT, shapes)).not.toBe(baseline(ROAD_STRAIGHT));
        expect(signature(CITY_DIAG, shapes)).toBe(baseline(CITY_DIAG));
    });

    it('road.cornerRadius и cornerTension меняют только поворотные дороги', () => {
        for (const shapes of [{ road: { cornerRadius: 35 } }, { road: { cornerTension: 0.5 } }]) {
            expect(signature(ROAD_CORNER, shapes)).not.toBe(baseline(ROAD_CORNER));
            expect(signature(ROAD_STRAIGHT, shapes)).toBe(baseline(ROAD_STRAIGHT));
        }
    });

    it('размер монастыря учитывается в контексте тайла: дорога доходит до его границы', () => {
        const feature = tileById(MONASTERY).features;
        const small = generateFeatureGeometries(feature, { shapes: { monastery: { halfExtent: 10 } } });
        const large = generateFeatureGeometries(feature, { shapes: { monastery: { halfExtent: 30 } } });
        const road = feature.find((f) => f.type === 'road')!;
        const length = (g: ReadonlyMap<string, unknown>): number => {
            const geo = g.get(road.id) as { path: Array<{ to: [number, number] }>; start: [number, number] };
            const end = geo.path[geo.path.length - 1].to;
            return Math.hypot(end[0] - geo.start[0], end[1] - geo.start[1]);
        };
        // чем больше монастырь, тем короче тупиковая дорога до его края
        expect(length(small.geometries)).toBeGreaterThan(length(large.geometries));
    });
});

describe('форма остаётся простой в допустимых диапазонах', () => {
    // Заход дороги под город не нулевой: при 0 дорога может не дойти до города, и поля по бокам
    // сливаются в один полигон (аудит честно сообщает field-unassigned)
    const SAFE_OVERLAP = 6;

    const errorsFor = (shapes: ShapeParamsInput): string[] => {
        const problems: string[] = [];
        for (const tile of tiles) {
            const audit = auditTile(tile, { geometryParams: GEOMETRY_PARAMS, shapes });
            for (const issue of audit.issues) {
                if (issue.severity === 'error') problems.push(`${tile.id}: [${issue.code}] ${issue.message}`);
            }
        }
        return problems;
    };

    const groups = Object.keys(SHAPE_PARAM_LIMITS) as Array<keyof typeof SHAPE_PARAM_LIMITS>;
    const cases = groups.flatMap((group) =>
        Object.entries(SHAPE_PARAM_LIMITS[group]).flatMap(([key, [min, max]]) =>
            [min, max].map((value) => ({ group, key, value }))
        )
    );

    it.each(cases.map((c) => [`${c.group}.${c.key} = ${c.value}`, c] as const))(
        '%s: нет ошибок аудита ни на одном тайле',
        (_label, { group, key, value }) => {
            const shapes = { [group]: { [key]: value } } as ShapeParamsInput;
            // Заход ниже безопасного — отдельная и намеренная проверка ниже
            if (group === 'road' && key === 'endOverlap' && value < SAFE_OVERLAP) return;
            expect(errorsFor(shapes)).toEqual([]);
        }
    );

    it('случайные комбинации всех параметров, в том числе на краях диапазонов', () => {
        // Детерминированный генератор без зависимостей
        let state = 123456789;
        const random = (): number => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 2 ** 32;
        };

        for (let i = 0; i < 10; i++) {
            const shapes: Record<string, Record<string, number>> = { city: {}, monastery: {}, road: {} };
            for (const group of groups) {
                for (const [key, [min, max]] of Object.entries(SHAPE_PARAM_LIMITS[group])) {
                    const r = random();
                    shapes[group][key] = r < 0.2 ? min : r < 0.4 ? max : min + random() * (max - min);
                }
            }
            shapes.road.endOverlap = Math.max(SAFE_OVERLAP, shapes.road.endOverlap);
            expect(errorsFor(shapes as ShapeParamsInput)).toEqual([]);
        }
    });

    it('нулевой заход дороги слишком мал: поля сливаются, и аудит это замечает заметно чаще, чем при нормальном заходе', () => {
        // Заход меньше амплитуды шума оставляет щель у торца: поля по бокам дороги соединяются
        // в один полигон, и второму полю не достаётся своего (field-unassigned)
        const noise = { areaAmplitude: 6, lineAmplitude: 6 };
        const count = (endOverlap: number): number => {
            let hits = 0;
            for (let i = 0; i < 20; i++) {
                const audit = auditTile(tileById(CITY_ROAD_ARC), {
                    geometryParams: GEOMETRY_PARAMS,
                    seedOverride: `s${i}`,
                    noise,
                    shapes: { road: { endOverlap } },
                });
                if (audit.issues.some((issue) => issue.code === 'field-unassigned')) hits++;
            }
            return hits;
        };
        expect(count(0)).toBeGreaterThan(count(14));
    });
});
