// packages/client/src/renderer3d/layers/FieldRegionsLayer3D.tsx
// ============================================
// 🌿 ПОЛЯ С РЕЛЬЕФОМ (общие меши регионов)
// ============================================
// Рисует по одному мешу на регион полей: вершины уже в мировых координатах доски,
// поэтому позиция и поворот не нужны. Кликов нет — клик по полю доходит до плоскости
// земли в GameBoard3D (она определяет клетку). Если рельеф выключен, слой пустой:
// поля тогда лежат в мешах тайлов (TilesLayer3D).
// ============================================
import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { FieldRegionMesh } from '@/core/geometry/fieldRegions';
import { useMeshGeometry } from '@/components/TileMeshObjects';
import { useFieldTerrain } from '../useFieldTerrain';

const FieldRegionMesh3D = memo(({ region }: { region: FieldRegionMesh }) => {
  const geometry = useMeshGeometry(region.mesh);
  // Тот же материал, что у мешей тайлов (TileMeshObjects), чтобы поля и дороги не различались по свету
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} castShadow receiveShadow frustumCulled={false} />;
});
FieldRegionMesh3D.displayName = 'FieldRegionMesh3D';

export const FieldRegionsLayer3D = memo(() => {
  const { regions } = useFieldTerrain();

  return (
    <>
      {regions.map((region) => (
        <FieldRegionMesh3D key={region.signature} region={region} />
      ))}
    </>
  );
});
FieldRegionsLayer3D.displayName = 'FieldRegionsLayer3D';
