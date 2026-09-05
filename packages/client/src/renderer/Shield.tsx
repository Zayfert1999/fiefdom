// packages/client/src/renderer/Shield.tsx
// 🛡️ Компонент щита. Рендерится поверх тайла.
// Позиция определяется через shieldSpot фичи.
// Поворот компенсируется, чтобы щит всегда был "вертикальным".

import { memo } from 'react';
import ShieldIcon from '@/assets/svg/meeples/shield.svg?react';

interface ShieldProps {
    /** Размер щита (по умолчанию 16) */
    size?: number;
    /** CSS-класс для анимации */
    className?: string;
}

export const Shield = memo(({ size = 16, className }: ShieldProps) => {
    return (
        <ShieldIcon
            width={size}
            height={size}
            className={className}
            style={{
                filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.5))',
                overflow: 'visible',
            }}
        />
    );
});