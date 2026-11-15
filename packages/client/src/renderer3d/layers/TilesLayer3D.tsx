// packages/client/src/renderer3d/layers/TilesLayer3D.tsx
// ============================================
// 🗺️ СЛОЙ ТАЙЛОВ (аналог SVG TilesLayer + TileItem)
// ============================================
// • один InstancedMesh на каждый тип тайла (меш из процедурной геометрии);
// • тайл, который сейчас падает (placementAnimation), в инстансы не входит —
//   его рисует PlacedTileAnimation3D;
// • под каждым тайлом — подложка (слой baseHeight): стены на стыках скрыты
//   соседями, поэтому снизу тайл — тонкий лист, а подложка делает край
//   кластера тайлов цельным.
// ============================================
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { useGameStore } from '@/state/useGameStore';
import type { TileBundle } from '@/core/geometry/tileMesh';
import { TileInstances, type TilePlacement } from '@/components/TileMeshObjects';
import { BOARD_MESH_PARAMS, getBundle } from '../tileBundles';

interface BoardTilePlacement extends TilePlacement {
  readonly tileId: string;
}

interface TilesLayer3DProps {
  /** Клик по поставленному тайлу (координаты клетки) */
  onTileClick: (x: number, y: number, event: ThreeEvent<MouseEvent>) => void;
}

// ============================================
// 🧱 ПОДЛОЖКА
// ============================================
const SLAB_INSET = 0.1;

const Slabs = memo(({ placements }: { placements: readonly TilePlacement[] }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const height = BOARD_MESH_PARAMS.baseHeight;

  const geometry = useMemo(
    () => new THREE.BoxGeometry(TILE_SIZE - SLAB_INSET * 2, height, TILE_SIZE - SLAB_INSET * 2),
    [height]
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BOARD_MESH_PARAMS.colors.base, roughness: 0.85, metalness: 0.02 }),
    []
  );

  useLayoutEffect(() => {
    const instanced = ref.current;
    if (!instanced) return;
    const dummy = new THREE.Object3D();
    placements.forEach((placement, index) => {
      dummy.position.set(placement.col * TILE_SIZE, height / 2, placement.row * TILE_SIZE);
      dummy.updateMatrix();
      instanced.setMatrixAt(index, dummy.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [placements, height, geometry]);

  if (height <= 0 || placements.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, placements.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
});
Slabs.displayName = 'Slabs';

// ============================================
// 🗺️ СЛОЙ
// ============================================
export const TilesLayer3D = memo(({ onTileClick }: TilesLayer3DProps) => {
  const board = useGameStore((s) => s.board);
  const skipKey = useGameStore((s) => {
    const tile = s.placementAnimation?.tile;
    return tile ? `${tile.x},${tile.y}` : null;
  });

  const { placements, groups } = useMemo(() => {
    const all: BoardTilePlacement[] = [];
    const byTile = new Map<string, BoardTilePlacement[]>();
    const bundles = new Map<string, TileBundle>();

    for (const tile of board.values()) {
      if (`${tile.x},${tile.y}` === skipKey) continue;

      let bundle = bundles.get(tile.templateId);
      if (!bundle) {
        const built = getBundle(tile.templateId);
        if (!built) continue;
        bundle = built;
        bundles.set(tile.templateId, bundle);
      }

      const placement: BoardTilePlacement = {
        key: `${tile.x},${tile.y}`,
        tileId: tile.templateId,
        col: tile.x,
        row: tile.y,
        rotation: tile.rotation,
      };
      all.push(placement);
      const list = byTile.get(tile.templateId);
      if (list) list.push(placement);
      else byTile.set(tile.templateId, [placement]);
    }

    return {
      placements: all,
      groups: [...byTile.entries()].map(([tileId, list]) => ({ tileId, list, bundle: bundles.get(tileId)! })),
    };
  }, [board, skipKey]);

  return (
    <>
      <Slabs placements={placements} />
      {groups.map(({ tileId, list, bundle }) => (
        <TileInstances
          key={tileId}
          mesh={bundle.mesh}
          placements={list}
          onClick={(hit, event) => {
            // Клик по тайлу не должен дойти до невидимой плоскости земли под ним
            event.stopPropagation();
            onTileClick(hit.placement.col, hit.placement.row, event);
          }}
        />
      ))}
    </>
  );
});
TilesLayer3D.displayName = 'TilesLayer3D';
