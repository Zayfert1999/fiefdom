// packages/client/src/renderer3d/layers/PlacedTileAnimation3D.tsx
// ============================================
// 🎬 АНИМАЦИЯ УСТАНОВКИ ТАЙЛА (аналог .tile-placement-animation)
// ============================================
// Когда приходит чужой ход, тайл не появляется сразу: он падает на клетку,
// вырастая с лёгким доворотом (0 → ×1.1 → ×1 за 0.5 с, как tile-appear).
// Пока идёт анимация, тайл исключён из инстансов, подсветки и щитов доски
// (TilesLayer3D / ShieldsLayer3D / useRegionHighlights); мипл анимирует
// MeepleLayer3D. Сам placementAnimation сбрасывает GameBoard3D через 700 мс.
// ============================================
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { tileYaw, type TileBundle } from '@/core/geometry/tileMesh';
import { useMeshGeometry } from '@/components/TileMeshObjects';
import { useGameStore } from '@/state/useGameStore';
import { clamp01, easeOutCubic, lerp } from '../boardMath';
import type { ShieldMaterials } from '../models/ShieldModel';
import { getBundle, getSolidMesh } from '../tileBundles';
import { TileShields } from './ShieldsLayer3D';

const DURATION = 0.5;
const DROP_HEIGHT = 30;

interface DroppingTileProps {
  bundle: TileBundle;
  templateId: string;
  x: number;
  y: number;
  rotation: number;
  materials: ShieldMaterials;
}

const DroppingTile = memo(({ bundle, templateId, x, y, rotation, materials }: DroppingTileProps) => {
  const clock = useThree((s) => s.clock);
  const mesh = useMemo(() => getSolidMesh(bundle), [bundle]);
  const geometry = useMeshGeometry(mesh);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  const group = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  useEffect(() => {
    start.current = clock.elapsedTime;
  }, [clock]);

  const baseYaw = tileYaw(rotation);

  useFrame((state) => {
    const node = group.current;
    if (!node) return;

    // До первого эффекта анимация считается ещё не начатой
    const p = start.current === null ? 0 : clamp01((state.clock.elapsedTime - start.current) / DURATION);

    // Как tile-appear: масштаб 0 → 1.1 (60%) → 1, доворот −10° → 3° → 0°
    let scale: number;
    let wobbleDeg: number;
    if (p < 0.6) {
      const k = easeOutCubic(p / 0.6);
      scale = lerp(0.0001, 1.1, k);
      wobbleDeg = lerp(-10, 3, k);
    } else {
      const k = easeOutCubic((p - 0.6) / 0.4);
      scale = lerp(1.1, 1, k);
      wobbleDeg = lerp(3, 0, k);
    }

    node.scale.setScalar(scale);
    node.position.y = DROP_HEIGHT * (1 - easeOutCubic(p));
    // Положительный CSS-поворот — по часовой, в three это отрицательный yaw
    node.rotation.y = baseYaw - (wobbleDeg * Math.PI) / 180;
  });

  return (
    <group position={[x * TILE_SIZE, 0, y * TILE_SIZE]}>
      <group ref={group} scale={0.0001}>
        <mesh geometry={geometry} material={material} castShadow receiveShadow />
        <TileShields templateId={templateId} bundle={bundle} materials={materials} />
      </group>
    </group>
  );
});
DroppingTile.displayName = 'DroppingTile';

interface PlacedTileAnimation3DProps {
  materials: ShieldMaterials;
}

export const PlacedTileAnimation3D = memo(({ materials }: PlacedTileAnimation3DProps) => {
  const animation = useGameStore((s) => s.placementAnimation);
  const tile = animation?.tile;
  const bundle = tile ? getBundle(tile.templateId) : null;
  if (!animation || !tile || !bundle) return null;

  return (
    <DroppingTile
      key={`${tile.x},${tile.y},${animation.startTime}`}
      bundle={bundle}
      templateId={tile.templateId}
      x={tile.x}
      y={tile.y}
      rotation={tile.rotation}
      materials={materials}
    />
  );
});
PlacedTileAnimation3D.displayName = 'PlacedTileAnimation3D';
