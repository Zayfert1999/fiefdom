// renderer/PreviewTileLayer.tsx
import { memo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { Tile } from './Tile';

interface PreviewTileLayerProps {
    onRotate: () => void;
}

/**
 * 🌟 Слой примерки тайла.
 * Пересоздаётся ТОЛЬКО при изменении previewTile.
 */
export const PreviewTileLayer = memo(({ onRotate }: PreviewTileLayerProps) => {
    const previewTile = useGameStore(s => s.previewTile);

    if (!previewTile) return null;

    return (
        <g
            className="preview-tile"
            key={`${previewTile.x},${previewTile.y}`}
            transform={`translate(${previewTile.x * TILE_SIZE}, ${previewTile.y * TILE_SIZE})`}
            onClick={(e) => {
                e.stopPropagation();
                onRotate();
            }}
            style={{ cursor: 'pointer', overflow: 'visible' }}
        >
            <g
                className="preview-tile-rotating"
                style={{
                    transform: `rotate(${previewTile.displayRotation}deg)`,
                    transformOrigin: `${TILE_SIZE / 2}px ${TILE_SIZE / 2}px`,
                }}
            >
                <Tile
                    id={previewTile.tile.id as any}
                    size={TILE_SIZE}
                    features={previewTile.tile.features}
                    rotation={previewTile.rotation}
                />
            </g>
            <rect
                className="preview-tile-overlay"
                x={0}
                y={0}
                width={TILE_SIZE}
                height={TILE_SIZE}
            />
        </g>
    );
});
PreviewTileLayer.displayName = 'PreviewTileLayer';