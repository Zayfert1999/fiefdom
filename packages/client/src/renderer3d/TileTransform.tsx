// packages/client/src/renderer3d/TileTransform.tsx
// ============================================
// 📍 СИСТЕМА КООРДИНАТ ТАЙЛА
// ============================================
// Всё, что привязано к тайлу (подсветка фич, щиты, рамки), задаётся в его
// локальных координатах без поворота; эта группа ставит их на клетку (x, y)
// и поворачивает на rotation° по часовой стрелке (как в tileMesh.tileYaw).
// ============================================
import type { ReactNode } from 'react';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { tileYaw } from '@/core/geometry/tileMesh';

interface TileTransformProps {
  x: number;
  y: number;
  rotation: number;
  /** Подъём над землёй */
  lift?: number;
  children?: ReactNode;
}

export const TileTransform = ({ x, y, rotation, lift = 0, children }: TileTransformProps) => (
  <group position={[x * TILE_SIZE, lift, y * TILE_SIZE]} rotation={[0, tileYaw(rotation), 0]}>
    {children}
  </group>
);
