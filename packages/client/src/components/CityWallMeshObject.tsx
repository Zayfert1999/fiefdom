// packages/client/src/components/CityWallMeshObject.tsx
// ============================================
// 🏰 THREE-ОБЪЕКТ ДЛЯ СТЕН ОДНОГО ГОРОДА
// ============================================
// Обвязка над мешем из core/geometry/cityWalls.ts: один меш на город, тот же материал,
// что у тайлов (вершинные цвета, roughness .75).
//
// «Рост из земли» — масштаб по y вокруг основания: меш построен от нуля вверх,
// а группа стоит на высоте поверхности города. growth: 0 — стен нет, 1 — полная высота.
// Значение можно передать числом (песочница) или функцией, которую зовут каждый кадр
// (игра: время считается по часам, без перерисовки React).
//
// Стены не участвуют в рейкасте: пикинг клеток и фич под ними работает как раньше.
// ============================================
import { memo, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { CityWallModel } from '@/core/geometry/cityWalls';
import { useMeshGeometry } from './TileMeshObjects';

/** Стена ниже этого масштаба не рисуется (иначе остаётся «волосок» под землёй) */
const MIN_VISIBLE_GROWTH = 0.002;

const noRaycast: THREE.Object3D['raycast'] = () => undefined;

export type WallGrowth = number | (() => number);

interface CityWallMeshObjectProps {
  model: Pick<CityWallModel, 'mesh'>;
  /** Высота поверхности города в мировых координатах */
  baseY: number;
  growth?: WallGrowth;
  wireframe?: boolean;
}

export const CityWallMeshObject = memo(({ model, baseY, growth = 1, wireframe = false }: CityWallMeshObjectProps) => {
  const geometry = useMeshGeometry(model.mesh);
  const ref = useRef<THREE.Mesh>(null);

  const apply = (): void => {
    const mesh = ref.current;
    if (!mesh) return;
    const value = typeof growth === 'function' ? growth() : growth;
    mesh.visible = value > MIN_VISIBLE_GROWTH;
    mesh.scale.y = Math.max(value, MIN_VISIBLE_GROWTH);
  };

  // Первый кадр уже с правильным масштабом (без вспышки полной стены)
  useLayoutEffect(apply);
  useFrame(apply);

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      position={[0, baseY, 0]}
      castShadow
      receiveShadow
      frustumCulled={false}
      raycast={noRaycast}
    >
      <meshStandardMaterial vertexColors roughness={0.75} metalness={0.05} wireframe={wireframe} />
    </mesh>
  );
});
CityWallMeshObject.displayName = 'CityWallMeshObject';
