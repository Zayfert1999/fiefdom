// renderer/Tile.tsx
import { memo } from 'react';
import { TileRegistry, type TileId } from '@/assets/svg/tiles/registry';
import { Shield } from './Shield';
import type { TileFeature } from '@carcassonne/shared/core/types';

// 🌟 Базовый размер тайла, в котором заданы координаты shieldSpot
const BASE_TILE_SIZE = 100;

export const Tile = memo(({
    id,
    size = 100,
    features,
    rotation = 0,
}: {
    id: TileId;
    size?: number;
    features?: TileFeature[];
    rotation?: 0 | 90 | 180 | 270;
}) => {
    const Component = TileRegistry[id];
    if (!Component) {
        console.warn(`⚠️ [Tile] Компонент для id "${id}" не найден в реестре`);
        return null;
    }

    // 🌟 Находим щит в фичах
    const shieldFeature = features?.find(f => f.shieldSpot);
    const shieldSpot = shieldFeature?.shieldSpot;

    // 🌟 Коэффициент масштабирования относительно базового размера
    const scale = size / BASE_TILE_SIZE;

    return (
        <g style={{ overflow: 'visible' }}>
            {/* SVG тайла */}
            <Component
                width={size}
                height={size}
                style={{ display: 'block', overflow: 'hidden' }}
                preserveAspectRatio="xMidYMid meet"
            />

            {/* 🌟 Щит поверх тайла */}
            {shieldSpot && (
                // 🌟 МАСШТАБИРОВАНИЕ: координаты и размер щита
                // пропорциональны размеру тайла
                <g transform={`scale(${scale})`}>
                    {/* Позиционирование по координатам shieldSpot (в системе 100×100) */}
                    <g transform={`translate(${shieldSpot.x}, ${shieldSpot.y})`}>
                        {/* Компенсация поворота тайла — щит всегда вертикальный */}
                        <g transform={`rotate(${-rotation})`}>
                            {/* Центрирование щита */}
                            <g transform="translate(-8, -8)">
                                <Shield size={16} />
                            </g>
                        </g>
                    </g>
                </g>
            )}
        </g>
    );
});