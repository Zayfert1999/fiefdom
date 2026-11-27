// packages/client/src/components/ProceduralTile.tsx
// ============================================
// 🖼 ТАЙЛ В HUD: ПРОЦЕДУРНЫЙ SVG
// ============================================
// Рисует тот же тайл, что и 3D-доска: берёт готовый бандл (кэш geometryBundleCache,
// поэтому геометрия повторно не строится) и раскладывает его по слоям, как 2D-вид
// песочницы. Без сетки, портов, спотов, вершин и подсветки. Щит — SVG-компонент Shield
// в вычисленном споте.
//
// Самодостаточный <svg>: оборачивать в другой <svg> не нужно.
// ============================================
import { memo, useMemo } from 'react';
import { getBundle, getTileDefinition } from '@/renderer3d/tileBundles';
import { buildTileSvgModel, type TileSvgLayerKind } from '@/core/geometry/tileSvg';
import { Shield } from '@/components/Shield';
import { COLORS } from '@/sandbox/view/colors';

/** Размер щита в логических единицах тайла (тайл = 100) */
const SHIELD_SIZE = 16;

const FILL: Record<TileSvgLayerKind, string> = {
    field: COLORS.field,
    road: COLORS.road,
    city: COLORS.city,
    monastery: COLORS.monastery,
    plaza: COLORS.plaza,
};

interface ProceduralTileProps {
    /** id шаблона тайла из base.json (например, 'tile_CCFC-S') */
    id: string;
    /** Сторона квадрата в пикселях */
    size?: number;
}

export const ProceduralTile = memo(({ id, size = 100 }: ProceduralTileProps) => {
    const model = useMemo(() => {
        const bundle = getBundle(id);
        return bundle ? buildTileSvgModel(bundle, getTileDefinition(id)) : null;
    }, [id]);

    return (
        <svg
            width={size}
            height={size}
            viewBox="-50 -50 100 100"
            role="img"
            aria-label={id}
            style={{ display: 'block', overflow: 'hidden' }}
        >
            {/* Подложка цвета поля: фон на случай мелких щелей между контурами */}
            <rect x={-50} y={-50} width={100} height={100} fill={COLORS.field} />

            {model?.layers.map((layer) => (
                <path
                    key={layer.key}
                    d={layer.d}
                    fill={FILL[layer.kind]}
                    fillRule="evenodd"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.35}
                />
            ))}

            {model?.shields.map((shield) => (
                <g key={shield.featureId} transform={`translate(${shield.x - SHIELD_SIZE / 2}, ${shield.y - SHIELD_SIZE / 2})`}>
                    <Shield size={SHIELD_SIZE} className="shield-animated" />
                </g>
            ))}
        </svg>
    );
});
ProceduralTile.displayName = 'ProceduralTile';
