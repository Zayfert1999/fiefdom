// packages/client/src/components/TileMeshObjects.tsx
// ============================================
// 🧊 THREE-ОБЪЕКТЫ ДЛЯ МЕША ТАЙЛА
// ============================================
// • useMeshGeometry — буферы TileMeshData → THREE.BufferGeometry
// • TileMeshObject  — один тайл одним мешем
// • TileInstances   — один и тот же тайл, размноженный через InstancedMesh
//                     (поворот и позиция — в матрице инстанса)
//
// Геометрия строится в core/geometry/tileMesh.ts, здесь только обвязка.
// ============================================
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { findMeshGroup, tileYaw, type MeshGroup, type TileMeshData } from '@/core/geometry/tileMesh';

/** Сторона тайла в мировых единицах */
export const TILE_SIZE = 100;

/** Где и как стоит тайл на доске */
export interface TilePlacement {
  /** Уникальный ключ клетки */
  readonly key: string;
  readonly col: number;
  readonly row: number;
  /** Поворот по часовой стрелке (как в 2D/SVG), градусы */
  readonly rotation: number;
}

/** Результат наведения на инстанс */
export interface InstanceHit {
  readonly placement: TilePlacement;
  /** Фича под курсором (по индексу треугольника) */
  readonly group: MeshGroup | null;
}

// ============================================
// 📐 ГЕОМЕТРИЯ
// ============================================
export function useMeshGeometry(mesh: TileMeshData): THREE.BufferGeometry {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [mesh]);

  // dispose только освобождает GPU-буферы; при повторном использовании three загрузит их снова
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

// ============================================
// 🧊 ОДИН ТАЙЛ
// ============================================
interface TileMeshObjectProps {
  mesh: TileMeshData;
  wireframe?: boolean;
}

export const TileMeshObject = memo(({ mesh, wireframe = false }: TileMeshObjectProps) => {
  const geometry = useMeshGeometry(mesh);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.75} metalness={0.05} wireframe={wireframe} />
    </mesh>
  );
});
TileMeshObject.displayName = 'TileMeshObject';

// ============================================
// 🧱 ИНСТАНСЫ ОДНОГО ТАЙЛА
// ============================================
interface TileInstancesProps {
  mesh: TileMeshData;
  placements: readonly TilePlacement[];
  wireframe?: boolean;
  onHover?: (hit: InstanceHit | null) => void;
}

export const TileInstances = memo(({ mesh, placements, wireframe = false, onHover }: TileInstancesProps) => {
  const geometry = useMeshGeometry(mesh);
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const instanced = ref.current;
    if (!instanced) return;

    const dummy = new THREE.Object3D();
    placements.forEach((placement, index) => {
      dummy.position.set(placement.col * TILE_SIZE, 0, placement.row * TILE_SIZE);
      // Поворот на θ° по часовой стрелке сверху = rotation.y = −θ (см. tileYaw)
      dummy.rotation.set(0, tileYaw(placement.rotation), 0);
      dummy.updateMatrix();
      instanced.setMatrixAt(index, dummy.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    // Без пересчёта рейкаст использует устаревшую сферу
    instanced.computeBoundingSphere();
  }, [placements, geometry]);

  const handleMove = (event: ThreeEvent<PointerEvent>): void => {
    if (!onHover) return;
    event.stopPropagation();

    const placement = event.instanceId === undefined ? undefined : placements[event.instanceId];
    if (!placement) return;

    onHover({
      placement,
      group: event.faceIndex == null ? null : findMeshGroup(mesh, event.faceIndex),
    });
  };

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, placements.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
      onPointerMove={handleMove}
      onPointerOut={() => onHover?.(null)}
    >
      <meshStandardMaterial vertexColors roughness={0.75} metalness={0.05} wireframe={wireframe} />
    </instancedMesh>
  );
});
TileInstances.displayName = 'TileInstances';
