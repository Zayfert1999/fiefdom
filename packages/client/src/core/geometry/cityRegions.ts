// packages/client/src/core/geometry/cityRegions.ts
// ============================================
// 🏙 РЕГИОНЫ ГОРОДОВ НА ДОСКЕ: КОНТУР, ЗАМКНУТОСТЬ, ВОРОТА
// ============================================
// Чистый модуль (без three, React и clipper).
//
// Полигоны городов соседних тайлов сшиваются тем же алгоритмом, что и поля
// (regionStitch.ts), и дают кольца контура в мировых координатах:
// внешнее и, если город обнимает поле или монастырь, внутренние.
//
// 🔒 ЗАМКНУТОСТЬ
//    Город замкнут, если ни одно ребро контура не осталось на линии сетки без пары:
//    всюду, где город доходит до края клетки, по ту сторону лежит город соседа.
//    Это геометрический эквивалент «регион завершён» и работает без RegionManager
//    (песочница). В игре дополнительно смотрим RegionManager: в конце партии он помечает
//    завершёнными и незамкнутые города, а стен у таких быть не должно.
//
// 🚪 ВОРОТА
//    Дорога входит в город «тупиком»: ось дороги заканчивается внутри полигона города того же тайла
//    (не на краю тайла). Конец оси и направление внутрь города — это место ворот;
//    точное положение на контуре находит wallLayout.ts (пересечение луча с кольцом).
// ============================================
import type { MultiPolygon, Point, Polygon, Ring } from '@fiefdom/shared/core/geometry.types';
import { HALF } from './generators/sides';
import { pointInPolygon } from './geometryPointInPolygon';
import { BOARD_TILE_SIZE, normalizeWorldPolygon, stitchItems, tileToWorld, type StitchItem } from './regionStitch';

// ============================================
// 🧩 ТИПЫ
// ============================================

/** Полигон города внутри тайла (локальные координаты) */
export interface CityPolygonRef {
    readonly featureId: string;
    readonly polygon: Polygon;
}

/** Тупик дороги, упирающийся в город (локальные координаты тайла) */
export interface RoadEndRef {
    /** Дорога, которой принадлежит конец */
    readonly featureId: string;
    /** Город этого же тайла, в который она упирается */
    readonly cityFeatureId: string;
    /** Конец оси дороги */
    readonly point: Point;
    /** Единичное направление вдоль дороги ВНУТРЬ города */
    readonly dir: Point;
    /**
     * Ось дороги от тупика наружу (локальные координаты): по ней находится место, где дорога
     * пересекает контур. После шума ось не прямая, поэтому одного направления у конца мало.
     */
    readonly path: readonly Point[];
}

/** Тайл на доске с его городами и тупиками дорог */
export interface CityRegionTile {
    /** Уникальный ключ клетки (для подписи) */
    readonly key: string;
    readonly col: number;
    readonly row: number;
    /** Поворот по часовой стрелке, градусы */
    readonly rotation: number;
    /** id бандла: разные бандлы в одной клетке — разные регионы */
    readonly tileId: string;
    readonly cities: readonly CityPolygonRef[];
    readonly roadEnds: readonly RoadEndRef[];
}

/** Место ворот: конец дороги в мировых координатах и направление внутрь города */
export interface GateSite {
    readonly x: number;
    readonly z: number;
    readonly dirX: number;
    readonly dirZ: number;
    /** Ось дороги от тупика наружу в мировых координатах (без неё берётся луч по направлению) */
    readonly path?: readonly Point[];
}

export interface CityRegion {
    /** Наименьший ключ фичи региона */
    readonly id: string;
    /** Ключи фич `col,row:featureId` (формат RegionManager) */
    readonly featureKeys: readonly string[];
    /** Клетки доски, которые занимает город */
    readonly cells: readonly { readonly col: number; readonly row: number }[];
    /** Объединённые полигоны в мировых координатах: [внешнее кольцо, ...внутренние кольца] */
    readonly polygons: readonly Polygon[];
    /** Контур нигде не упирается в край клетки без соседа */
    readonly closed: boolean;
    readonly gates: readonly GateSite[];
    /** Подпись состава: меняется при любом изменении региона */
    readonly signature: string;
}

/** Всё, что нужно от бандла тайла (подходит и TileBundle, и результат аудита) */
export interface CitySource {
    readonly features: readonly { readonly id: string; readonly type: string }[];
    readonly geometry: {
        readonly tessellation: {
            readonly areas: ReadonlyMap<string, MultiPolygon>;
            readonly lines: ReadonlyMap<string, { readonly center: Ring }>;
        };
    };
}

// ============================================
// 🔎 СБОР ГОРОДОВ И ТУПИКОВ ТАЙЛА
// ============================================

/** Конец оси дальше этого от края тайла считается свободным (не порт) */
const PORT_EPSILON = 1;
/** Конец оси мог оказаться чуть за границей города (шум): допускаем такой зазор */
const CITY_TOLERANCE = 3;
/** Направление дороги берём по точке, отстоящей от конца не меньше чем на столько */
const DIRECTION_LOOKBACK = 4;

function distanceToRing(p: Point, ring: Ring): number {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const abx = b[0] - a[0];
        const abz = b[1] - a[1];
        const len2 = abx * abx + abz * abz;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
        const dx = p[0] - (a[0] + abx * t);
        const dz = p[1] - (a[1] + abz * t);
        best = Math.min(best, Math.hypot(dx, dz));
    }
    return best;
}

const nearPolygon = (p: Point, polygon: Polygon): boolean =>
    pointInPolygon(p, polygon) || polygon.some((ring) => distanceToRing(p, ring) <= CITY_TOLERANCE);

/**
 * Города тайла и тупики дорог, упирающиеся в эти города.
 * Конец оси — точка центральной линии дороги, не лежащая на краю тайла.
 */
export function collectCityRefs(source: CitySource): {
    readonly cities: readonly CityPolygonRef[];
    readonly roadEnds: readonly RoadEndRef[];
} {
    const cities: CityPolygonRef[] = [];
    for (const feature of source.features) {
        if (feature.type !== 'city') continue;
        const area = source.geometry.tessellation.areas.get(feature.id);
        if (!area) continue;
        for (const polygon of area) cities.push({ featureId: feature.id, polygon });
    }

    const roadEnds: RoadEndRef[] = [];
    if (cities.length === 0) return { cities, roadEnds };

    for (const feature of source.features) {
        if (feature.type !== 'road') continue;
        const center = source.geometry.tessellation.lines.get(feature.id)?.center;
        if (!center || center.length < 2) continue;

        for (const atStart of [true, false]) {
            const end = atStart ? center[0] : center[center.length - 1];
            if (Math.max(Math.abs(end[0]), Math.abs(end[1])) >= HALF - PORT_EPSILON) continue; // порт на краю тайла

            const city = cities.find((c) => nearPolygon(end, c.polygon));
            if (!city) continue;

            // Точка вдоль дороги, достаточно далёкая от конца, чтобы шум не вертел направление
            let back = atStart ? center[1] : center[center.length - 2];
            for (let k = 1; k < center.length; k++) {
                const candidate = atStart ? center[k] : center[center.length - 1 - k];
                back = candidate;
                if (Math.hypot(end[0] - candidate[0], end[1] - candidate[1]) >= DIRECTION_LOOKBACK) break;
            }
            const dx = end[0] - back[0];
            const dz = end[1] - back[1];
            const len = Math.hypot(dx, dz);
            if (len < 1e-6) continue;

            roadEnds.push({
                featureId: feature.id,
                cityFeatureId: city.featureId,
                point: end,
                dir: [dx / len, dz / len],
                path: atStart ? [...center] : [...center].reverse(),
            });
        }
    }
    return { cities, roadEnds };
}

const refsCache = new WeakMap<object, ReturnType<typeof collectCityRefs>>();

/** collectCityRefs с кэшем по объекту бандла: города тайла не меняются, пока жив бандл */
export function getCityRefs(source: CitySource): ReturnType<typeof collectCityRefs> {
    let refs = refsCache.get(source);
    if (!refs) {
        refs = collectCityRefs(source);
        refsCache.set(source, refs);
    }
    return refs;
}

// ============================================
// 🧵 РЕГИОНЫ
// ============================================

/**
 * Собирает регионы городов доски. С `onlyFeatureKeys` учитываются только перечисленные
 * города (ключи `col,row:featureId`), например завершённые по RegionManager.
 * Порядок регионов детерминирован (по id).
 */
export function buildCityRegions(
    tiles: readonly CityRegionTile[],
    onlyFeatureKeys?: ReadonlySet<string>
): CityRegion[] {
    interface Item extends StitchItem {
        readonly key: string;
        readonly tile: CityRegionTile;
        readonly featureId: string;
    }

    const items: Item[] = [];
    for (const tile of tiles) {
        for (const city of tile.cities) {
            const key = `${tile.col},${tile.row}:${city.featureId}`;
            if (onlyFeatureKeys && !onlyFeatureKeys.has(key)) continue;
            const rings = normalizeWorldPolygon(city.polygon, (x, z) =>
                tileToWorld(tile.col, tile.row, tile.rotation, x, z)
            );
            if (!rings) continue;
            items.push({ key, tile, featureId: city.featureId, rings });
        }
    }

    const regions: CityRegion[] = [];
    for (const group of stitchItems(items)) {
        const { members, polygons } = group;
        if (polygons.length === 0) continue;

        const featureKeys = [...new Set(members.map((i) => items[i].key))].sort();
        const signature = members
            .map((i) => `${items[i].key}@${items[i].tile.rotation}#${items[i].tile.tileId}`)
            .sort()
            .join(';');

        const cellKeys = new Map<string, { col: number; row: number }>();
        const gates: GateSite[] = [];
        const seenEnds = new Set<string>();
        for (const i of members) {
            const { tile, featureId } = items[i];
            cellKeys.set(`${tile.col},${tile.row}`, { col: tile.col, row: tile.row });

            tile.roadEnds.forEach((end, endIndex) => {
                if (end.cityFeatureId !== featureId) return;
                const id = `${tile.col},${tile.row}:${end.featureId}:${endIndex}`;
                if (seenEnds.has(id)) return;
                seenEnds.add(id);

                const [wx, wz] = tileToWorld(tile.col, tile.row, tile.rotation, end.point[0], end.point[1]);
                const [ox, oz] = tileToWorld(tile.col, tile.row, tile.rotation, 0, 0);
                const [dx, dz] = tileToWorld(tile.col, tile.row, tile.rotation, end.dir[0], end.dir[1]);
                gates.push({
                    x: wx,
                    z: wz,
                    dirX: dx - ox,
                    dirZ: dz - oz,
                    path: end.path.map(([px, pz]) => tileToWorld(tile.col, tile.row, tile.rotation, px, pz)),
                });
            });
        }

        regions.push({
            id: featureKeys[0],
            featureKeys,
            cells: [...cellKeys.values()],
            polygons,
            closed: group.openSeamEdges === 0,
            gates,
            signature,
        });
    }
    return regions.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

/** Центр клетки доски в мировых координатах */
export const cellCenter = (col: number, row: number): Point => [col * BOARD_TILE_SIZE, row * BOARD_TILE_SIZE];
