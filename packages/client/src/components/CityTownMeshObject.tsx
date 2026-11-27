// packages/client/src/components/CityTownMeshObject.tsx
// ============================================
// 🏘 THREE-ОБЪЕКТ ДЛЯ ЗАСТРОЙКИ ОДНОГО ГОРОДА
// ============================================
// Обвязка над мешами из core/geometry/townMesh.ts: тот же материал, что у тайлов и стен
// (вершинные цвета, roughness .75).
//
//   • ground — площадь и улицы: плоские накладки, не растут (видны, пока прогресс > 0);
//   • buckets — дома по частям от площади к краю; каждая часть растёт «из земли» масштабом
//     по y вокруг основания со своей задержкой (волна). Тени растут вместе с домами.
//
// `progress` — линейный прогресс анимации 0–1; числом (песочница) или функцией, которую зовут
// каждый кадр (игра: время считается по часам, без перерисовки React).
// Застройка не участвует в рейкасте: пикинг клеток и фич под ней работает как раньше.
// ============================================
import { memo, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { CityTownModel } from '@/core/geometry/cityTown';
import type { TownBucket } from '@/core/geometry/townMesh';
import { townHouseGrowth } from '@/core/geometry/townParams';
import { useMeshGeometry } from './TileMeshObjects';

/** Ниже этого масштаба дом не рисуется (иначе остаётся «волосок» под землёй) */
const MIN_VISIBLE_GROWTH = 0.002;

const noRaycast: THREE.Object3D['raycast'] = () => undefined;

export type TownProgress = number | (() => number);

const readProgress = (progress: TownProgress): number => (typeof progress === 'function' ? progress() : progress);

interface GroundProps {
  mesh: NonNullable<CityTownModel['meshes']['ground']>;
  progress: TownProgress;
  wireframe: boolean;
}

const TownGround = memo(({ mesh, progress, wireframe }: GroundProps) => {
  const geometry = useMeshGeometry(mesh);
  const ref = useRef<THREE.Mesh>(null);

  const apply = (): void => {
    if (ref.current) ref.current.visible = readProgress(progress) > MIN_VISIBLE_GROWTH;
  };
  useLayoutEffect(apply);
  useFrame(apply);

  return (
    <mesh ref={ref} geometry={geometry} receiveShadow frustumCulled={false} raycast={noRaycast}>
      <meshStandardMaterial vertexColors roughness={0.9} metalness={0} wireframe={wireframe} />
    </mesh>
  );
});
TownGround.displayName = 'TownGround';

interface BucketProps {
  bucket: TownBucket;
  progress: TownProgress;
  stagger: number;
  wireframe: boolean;
}

const TownBucketMesh = memo(({ bucket, progress, stagger, wireframe }: BucketProps) => {
  const geometry = useMeshGeometry(bucket.mesh);
  const ref = useRef<THREE.Mesh>(null);

  const apply = (): void => {
    const mesh = ref.current;
    if (!mesh) return;
    const value = townHouseGrowth(readProgress(progress), bucket.delay, stagger);
    mesh.visible = value > MIN_VISIBLE_GROWTH;
    mesh.scale.y = Math.max(value, MIN_VISIBLE_GROWTH);
  };
  // Первый кадр уже с правильным масштабом (без вспышки готового дома)
  useLayoutEffect(apply);
  useFrame(apply);

  return (
    <mesh ref={ref} geometry={geometry} castShadow receiveShadow frustumCulled={false} raycast={noRaycast}>
      <meshStandardMaterial vertexColors roughness={0.75} metalness={0.05} wireframe={wireframe} />
    </mesh>
  );
});
TownBucketMesh.displayName = 'TownBucketMesh';

interface CityTownMeshObjectProps {
  model: Pick<CityTownModel, 'meshes'>;
  /** Высота поверхности города в мировых координатах */
  baseY: number;
  progress?: TownProgress;
  /** Доля прогресса, на которую растянута волна (0 — все дома растут разом, как стены) */
  stagger?: number;
  wireframe?: boolean;
}

export const CityTownMeshObject = memo(
  ({ model, baseY, progress = 1, stagger = 0, wireframe = false }: CityTownMeshObjectProps) => {
    const { ground, buckets } = model.meshes;
    return (
      <group position={[0, baseY, 0]}>
        {ground && <TownGround mesh={ground} progress={progress} wireframe={wireframe} />}
        {buckets.map((bucket, i) => (
          <TownBucketMesh key={i} bucket={bucket} progress={progress} stagger={stagger} wireframe={wireframe} />
        ))}
      </group>
    );
  }
);
CityTownMeshObject.displayName = 'CityTownMeshObject';
