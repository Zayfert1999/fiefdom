// renderer/Tile.tsx
import { memo } from 'react';
import { TileRegistry, type TileId } from '@/assets/svg/tiles/registry';
import { Shield } from './Shield';
import { ART_ID_MAP } from '@fiefdom/shared/core/tileData';
import type { TileFeature } from '@fiefdom/shared/core/types';

// 🌟 Базовый размер тайла, в котором заданы координаты shieldSpot
const BASE_TILE_SIZE = 100;

interface TileProps {
    /** Логический идентификатор тайла (например, 'tile_CCFC-S') */
    id: string;
    size?: number;
    features?: TileFeature[];
    rotation?: 0 | 90 | 180 | 270;
}

export const Tile = memo(({
    id,
    size = 100,
    features,
    rotation = 0,
}: TileProps) => {
    // 🌟 Резолвим графику через artId:
    // тайлы с -S используют графику базового тайла
    const artId = ART_ID_MAP[id] ?? id;
    const Component = TileRegistry[artId as TileId];

    if (!Component) {
        console.warn(`⚠️ [Tile] Графика "${artId}" для тайла "${id}" не найдена в реестре`);
        return null;
    }

    // 🌟 Находим щит в фичах
    const shieldFeature = features?.find(f => f.shieldSpot);
    const shieldSpot = shieldFeature?.shieldSpot;

    // 🌟 Коэффициент масштабирования относительно базового размера
    const scale = size / BASE_TILE_SIZE;

    return (
        <g style={{ overflow: 'visible' }}>
            {/* SVG тайла (через artId) */}
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
                        {/* 🌟 Компенсация поворота через CSS — плавная анимация */}
                        <g
                            className="shield-rotation-wrapper"
                            style={{
                                transform: `rotate(${-rotation}deg)`,
                                transition: 'transform 0.3s ease-out',
                                transformOrigin: 'center',
                                transformBox: 'fill-box',
                            }}
                        >
                            {/* Центрирование щита */}
                            <g transform="translate(-8, -8)">
                                <Shield size={16} className="shield-animated" />
                            </g>
                        </g>
                    </g>
                </g>
            )}
        </g>
    );
});