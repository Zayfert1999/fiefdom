// packages/client/src/renderer3d/layers/MarkerLayers3D.tsx
// ============================================
// 🎯 МАРКЕРЫ ТАЙЛОВ
// ============================================
// • LastPlacedLayer3D — «дышащая» рамка цвета игрока вокруг его последнего
//   тайла (аналог SVG LastPlacedTilesLayer);
// • DebugLayer3D — фиолетовая рамка тайла, выбранного Ctrl+кликом
//   (аналог SVG DebugOverlay).
//
// Рамки лежат чуть выше самой высокой точки тайла (с учётом холмов полей).
// ============================================
import { memo } from 'react';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { useGameStore } from '@/state/useGameStore';
import { FrameOutline } from '../primitives';
import { BOARD_TOP_Y } from '../tileBundles';

/** Выше самого высокого холма полей, чтобы рамку не закрывал рельеф */
const FRAME_Y = BOARD_TOP_Y + 0.6;
const DEBUG_COLOR = '#e100ff';
const BREATHE = { min: 0.5, max: 0.9, period: 2.5 } as const;

export const LastPlacedLayer3D = memo(() => {
  const lastPlacedTiles = useGameStore((s) => s.lastPlacedTiles);

  return (
    <>
      {Array.from(lastPlacedTiles.entries()).map(([playerId, tile]) => (
        <group key={`last-${playerId}`} position={[tile.x * TILE_SIZE, 0, tile.y * TILE_SIZE]}>
          {/* Свечение: широкая бледная рамка внутри */}
          <FrameOutline size={TILE_SIZE - 8} thickness={6} color={tile.color} opacity={0.3} y={FRAME_Y} />
          {/* Рамка по краю тайла */}
          <FrameOutline size={TILE_SIZE - 3} thickness={3} color={tile.color} pulse={BREATHE} y={FRAME_Y + 0.1} />
        </group>
      ))}
    </>
  );
});
LastPlacedLayer3D.displayName = 'LastPlacedLayer3D';

export const DebugLayer3D = memo(() => {
  const selected = useGameStore((s) => s.debugSelectedTile);
  if (!selected) return null;

  return (
    <group position={[selected.x * TILE_SIZE, 0, selected.y * TILE_SIZE]}>
      <FrameOutline size={TILE_SIZE} thickness={3} color={DEBUG_COLOR} y={FRAME_Y + 0.2} />
    </group>
  );
});
DebugLayer3D.displayName = 'DebugLayer3D';