// packages/client/src/renderer3d/layers/ShieldsLayer3D.tsx
// ============================================
// 🛡️ ЩИТЫ (аналог SVG Shield в Tile.tsx)
// ============================================
// Какие города со щитом — решают данные тайла (shieldSpot), где именно
// стоит щит — геометрия: позицию считает computeTileSpots (spots.ts) у края
// ПРОЦЕДУРНОГО города, поэтому щит не вылезает за контур после шума. Если
// у бандла нет вычисленной позиции, берётся ручной shieldSpot из данных.
//
// Мерцание золотой каймы — аналог shield-shimmer (3 с).
// ============================================
import { memo, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { TileBundle } from '@/core/geometry/tileMesh';
import { useGameStore } from '@/state/useGameStore';
import { BOARD_MESH_PARAMS, getBundle, getTileDefinition } from '../tileBundles';
import { surfaceTopY, type LocalPoint } from '../boardMath';
import { ShieldFigure, type ShieldMaterials } from '../models/ShieldModel';
import { TileTransform } from '../TileTransform';

const SHIMMER_PERIOD = 3;
const SHIMMER_MAX = 0.45;

/** Щиты тайла в его локальных координатах (без поворота) */
export function getTileShields(templateId: string, bundle: TileBundle): LocalPoint[] {
  const definition = getTileDefinition(templateId);
  if (!definition) return [];

  const shields: LocalPoint[] = [];
  for (const feature of definition.features) {
    if (!feature.shieldSpot) continue;
    const computed = bundle.spots.get(feature.id)?.shield;
    shields.push(computed ? { x: computed[0], y: computed[1] } : feature.shieldSpot);
  }
  return shields;
}

/** Мерцание каймы (общий материал на все щиты) */
export function useShieldShimmer(materials: ShieldMaterials): void {
  useFrame((state) => {
    const phase = 0.5 + 0.5 * Math.sin((state.clock.elapsedTime / SHIMMER_PERIOD) * Math.PI * 2);
    materials.rim.emissiveIntensity = phase * SHIMMER_MAX;
  });
}

/** Щиты одного тайла: рисуются внутри группы TileTransform */
export const TileShields = memo(
  ({ templateId, bundle, materials }: { templateId: string; bundle: TileBundle; materials: ShieldMaterials }) => {
    const shields = useMemo(() => getTileShields(templateId, bundle), [templateId, bundle]);
    const y = surfaceTopY(BOARD_MESH_PARAMS, 'city');

    return (
      <>
        {shields.map((spot, index) => (
          <group key={index} position={[spot.x, y, spot.y]}>
            <ShieldFigure materials={materials} />
          </group>
        ))}
      </>
    );
  }
);
TileShields.displayName = 'TileShields';

interface ShieldsLayer3DProps {
  materials: ShieldMaterials;
}

const ShieldsOnBoard = memo(({ materials }: ShieldsLayer3DProps) => {
  const board = useGameStore((s) => s.board);
  const skipKey = useGameStore((s) => {
    const tile = s.placementAnimation?.tile;
    return tile ? `${tile.x},${tile.y}` : null;
  });

  return (
    <>
      {[...board.values()].map((tile) => {
        if (`${tile.x},${tile.y}` === skipKey) return null;
        const bundle = getBundle(tile.templateId);
        if (!bundle) return null;
        return (
          <TileTransform key={`${tile.x},${tile.y}`} x={tile.x} y={tile.y} rotation={tile.rotation}>
            <TileShields templateId={tile.templateId} bundle={bundle} materials={materials} />
          </TileTransform>
        );
      })}
    </>
  );
});
ShieldsOnBoard.displayName = 'ShieldsOnBoard';

/** Слой щитов на поставленных тайлах (материалы можно передать, чтобы делить их с другими слоями) */
export const ShieldsLayer3D = memo(({ materials }: ShieldsLayer3DProps) => {
  useShieldShimmer(materials);
  return <ShieldsOnBoard materials={materials} />;
});
ShieldsLayer3D.displayName = 'ShieldsLayer3D';

