import { memo } from 'react';
import MeepleIcon from '@/assets/svg/meeples/meeple.svg?react'; 

export const Meeple = memo(({ color, size = 32 }: { color: string; size?: number }) => {
  return (
    <MeepleIcon 
      width={size} 
      height={size} 
      style={{ 
        filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.5))', // Тень для объема
        transition: 'transform 0.2s' 
      }} 
      // В большинстве плагинов SVGR цвет передается через fill или color prop
      // Если твой SVG использует fill="currentColor", то:
      //className="fill-current" 
      color={color} 
    />
  );
});