import { memo } from 'react';
import MeepleIcon from '@/assets/svg/meeples/meeple.svg?react'; 

interface MeepleProps {
  color: string;
  size?: number;
  stroke?: string;       // 🌟 НОВОЕ: цвет обводки
  strokeWidth?: number;  // 🌟 НОВОЕ: толщина обводки
}

export const Meeple = memo(({ color, size = 32, stroke, strokeWidth = 2 }: MeepleProps) => {
  return (
    <MeepleIcon 
      width={size} 
      height={size} 
      style={{ 
        filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.5))',
        transition: 'transform 0.2s',
        overflow: 'visible',
      }} 
      color={color}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
});