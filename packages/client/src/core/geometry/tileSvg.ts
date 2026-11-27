// packages/client/src/core/geometry/tileSvg.ts
// ============================================
// 🖼 2D-МОДЕЛЬ ТАЙЛА ДЛЯ SVG (HUD, колода)
// ============================================
// Чистая функция: бандл тайла (та же процедурная геометрия, что рисует 3D-доска) →
// список залитых контуров по слоям и позиции щитов. Ничего не рисует и не знает про React,
// поэтому тестируется без DOM. Цвета подбирает компонент (components/ProceduralTile.tsx).
//
// Координаты — локальные логические [-50, 50] без поворота (viewBox "-50 -50 100 100").
// Порядок слоёв как в песочнице: поля → дороги → города и монастыри → площади.
// ============================================
import type { FeatureType, Tile } from '@fiefdom/shared/core/types';
import type { MultiPolygon } from '@fiefdom/shared/core/geometry.types';
import { ringToPathD, toPathD } from './geometryToSvg';
import type { TileBundle } from './tileMesh';

export type TileSvgLayerKind = FeatureType | 'plaza';

export interface TileSvgLayer {
    /** Стабильный ключ для React */
    readonly key: string;
    readonly kind: TileSvgLayerKind;
    /** Контур в формате SVG path (дырки — через fill-rule: evenodd) */
    readonly d: string;
}

export interface TileSvgShield {
    readonly featureId: string;
    readonly x: number;
    readonly y: number;
}

export interface TileSvgModel {
    readonly layers: readonly TileSvgLayer[];
    readonly shields: readonly TileSvgShield[];
}

/** Что рисуется раньше: 0 — поля (внизу), 1 — дороги, 2 — города и монастыри */
const layerOrder = (type: FeatureType): number => {
    switch (type) {
        case 'field':
            return 0;
        case 'road':
            return 1;
        default:
            return 2;
    }
};

const pushPolygons = (
    layers: TileSvgLayer[],
    multi: MultiPolygon | undefined,
    featureId: string,
    kind: TileSvgLayerKind
): void => {
    if (!multi) return;
    multi.forEach((polygon, index) => {
        const d = toPathD(polygon);
        if (d) layers.push({ key: `${kind}-${featureId}-${index}`, kind, d });
    });
};

/**
 * Модель тайла по его бандлу.
 *
 * Щит ставится в вычисленный спот (bundle.spots — как на 3D-доске), а если геометрия
 * для спота не построилась — в `shieldSpot` из данных. Фичи без щита щита не получают.
 */
export function buildTileSvgModel(bundle: TileBundle, definition?: Pick<Tile, 'features'>): TileSvgModel {
    const { tessellation, clipping, assignments, decorations } = bundle.geometry;

    const ordered = bundle.features
        .map((feature, index) => ({ feature, index }))
        .sort((a, b) => layerOrder(a.feature.type) - layerOrder(b.feature.type) || a.index - b.index);

    const layers: TileSvgLayer[] = [];
    for (const { feature } of ordered) {
        switch (feature.type) {
            case 'field':
                pushPolygons(layers, assignments.fieldGeometries.get(feature.id), feature.id, 'field');
                break;
            case 'road':
                pushPolygons(layers, clipping.clippedLines.get(feature.id), feature.id, 'road');
                break;
            default:
                pushPolygons(layers, tessellation.areas.get(feature.id), feature.id, feature.type);
        }
    }

    decorations.plazas.forEach((ring, index) => {
        const d = ringToPathD(ring);
        if (d) layers.push({ key: `plaza-${index}`, kind: 'plaza', d });
    });

    const shields: TileSvgShield[] = [];
    for (const feature of definition?.features ?? []) {
        if (!feature.shieldSpot) continue;
        const computed = bundle.spots.get(feature.id)?.shield;
        shields.push({
            featureId: feature.id,
            x: computed ? computed[0] : feature.shieldSpot.x,
            y: computed ? computed[1] : feature.shieldSpot.y,
        });
    }

    return { layers, shields };
}
