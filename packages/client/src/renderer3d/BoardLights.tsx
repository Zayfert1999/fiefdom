// packages/client/src/renderer3d/BoardLights.tsx
// ============================================
// 💡 СВЕТ ДОСКИ
// ============================================
// Доска большая (мир 51×51 тайл), а тень строится в ограниченном кадре, поэтому
// направленный свет ездит за целью камеры: тени остаются чёткими там, куда
// смотрит игрок. Позиция света привязывается к сетке в TEXEL_SNAP юнитов, чтобы
// края теней не «плыли» при панораме.
// ============================================
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

/** Половина стороны области теней вокруг цели камеры */
const SHADOW_RANGE = 800;
/** Направление на солнце (как в скелете Board3D: сверху-справа-сзади) */
const SUN_OFFSET = new THREE.Vector3(0.8, 1.6, 0.55).multiplyScalar(SHADOW_RANGE * 0.75);
const TEXEL_SNAP = 10;

export const BoardLights = () => {
  const sun = useRef<THREE.DirectionalLight>(null);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;

  useFrame(() => {
    const light = sun.current;
    if (!light || !controls) return;
    const x = Math.round(controls.target.x / TEXEL_SNAP) * TEXEL_SNAP;
    const z = Math.round(controls.target.z / TEXEL_SNAP) * TEXEL_SNAP;
    light.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
    light.target.position.set(x, 0, z);
    // Цель не добавлена в сцену — матрицу обновляем сами (тень берёт её из matrixWorld)
    light.target.updateMatrixWorld();
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        ref={sun}
        position={[SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-SHADOW_RANGE}
        shadow-camera-right={SHADOW_RANGE}
        shadow-camera-top={SHADOW_RANGE}
        shadow-camera-bottom={-SHADOW_RANGE}
        shadow-camera-near={10}
        shadow-camera-far={SHADOW_RANGE * 5}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-SHADOW_RANGE * 0.4, SHADOW_RANGE * 0.6, -SHADOW_RANGE * 0.4]} intensity={0.3} />
    </>
  );
};
