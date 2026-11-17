// packages/client/src/renderer3d/layers/PreviewTileLayer3D.tsx
// ============================================
// 👁️ ПРИМЕРКА ТАЙЛА (аналог SVG PreviewTileLayer)
// ============================================
// Тайл из руки висит над выбранной клеткой, мягко парит и светится синим.
// Клик по нему поворачивает (rotatePreview); поворот анимируется по
// накопленному displayRotation — кратчайшим путём, как в SVG-версии.
//
// Внутри группы тайла, то есть вместе с ним вращаются и поднимаются:
//   • сплошной меш (со стенами по периметру — виден как цельный блок);
//   • подсветка регионов превью-тайла (штриховка владельцев);
//   • щиты;
// На земле под ним — синяя рамка клетки. Поверх тайла рамки и заливки нет:
// они закрывали рисунок (в SVG это был .preview-tile-overlay).
// ============================================
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { tileYaw, type TileBundle } from '@/core/geometry/tileMesh';
import { useMeshGeometry } from '@/components/TileMeshObjects';
import { useGameStore } from '@/state/useGameStore';
import { FeatureOverlay } from '../FeatureOverlay';
import { FrameOutline } from '../primitives';
import { useRegionHighlights } from '../useRegionHighlights';
import { getBundle, getSolidMesh } from '../tileBundles';
import type { ShieldMaterials } from '../models/ShieldModel';
import { TileShields } from './ShieldsLayer3D';

const PREVIEW_COLOR = '#4a90e2';
const CLICK_DRAG_PX = 5;
/** На сколько тайл приподнят над доской, юниты */
const LIFT = 7;
const BOB = 1.2;
/** Скорость сглаживания поворота: ~300 мс (PREVIEW_ROTATION_DURATION) */
const ROTATION_RATE = 14;
const REGION_OPACITY = 0.7;

interface PreviewBodyProps {
  bundle: TileBundle;
  templateId: string;
  x: number;
  y: number;
  displayRotation: number;
  materials: ShieldMaterials;
  onRotate: () => void;
}

const PreviewBody = memo(({ bundle, templateId, x, y, displayRotation, materials, onRotate }: PreviewBodyProps) => {
  const mesh = useMemo(() => getSolidMesh(bundle), [bundle]);
  const geometry = useMeshGeometry(mesh);
  const showRegions = useGameStore((s) => s.showRegions);
  const { preview } = useRegionHighlights();
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.75,
        metalness: 0.05,
        emissive: PREVIEW_COLOR,
        emissiveIntensity: 0.1,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  const lifted = useRef<THREE.Group>(null);
  const yaw = useRef(tileYaw(displayRotation));
  const lift = useRef(0);
  const targetYaw = tileYaw(displayRotation);

  useFrame((state, delta) => {
    const group = lifted.current;
    if (!group) return;
    const t = state.clock.elapsedTime;

    yaw.current = THREE.MathUtils.damp(yaw.current, targetYaw, ROTATION_RATE, delta);
    lift.current = THREE.MathUtils.damp(lift.current, LIFT, 10, delta);

    group.rotation.y = yaw.current;
    group.position.y = lift.current + Math.sin(t * 2) * BOB;
    material.emissiveIntensity = (hovered ? 0.28 : 0.1) + 0.06 * Math.sin((t / 2) * Math.PI * 2);
  });

  return (
    <group position={[x * TILE_SIZE, 0, y * TILE_SIZE]}>
      {/* Слот на земле под тайлом */}
      <FrameOutline color={PREVIEW_COLOR} thickness={3} opacity={0.9} y={0.5} />

      <group
        ref={lifted}
        onClick={(event) => {
          event.stopPropagation();
          if (event.delta > CLICK_DRAG_PX) return;
          onRotate();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh geometry={geometry} material={material} castShadow receiveShadow />

        {preview.map((highlight) => (
          <FeatureOverlay
            key={highlight.featureId}
            mesh={mesh}
            featureId={highlight.featureId}
            colors={highlight.colors}
            opacity={showRegions ? REGION_OPACITY : 0}
          />
        ))}

        <TileShields templateId={templateId} bundle={bundle} materials={materials} />
      </group>
    </group>
  );
});
PreviewBody.displayName = 'PreviewBody';

interface PreviewTileLayer3DProps {
  materials: ShieldMaterials;
}

export const PreviewTileLayer3D = memo(({ materials }: PreviewTileLayer3DProps) => {
  const previewTile = useGameStore((s) => s.previewTile);
  const rotatePreview = useGameStore((s) => s.rotatePreview);

  const bundle = previewTile ? getBundle(previewTile.tile.id) : null;
  if (!previewTile || !bundle) return null;

  return (
    <PreviewBody
      // Новая клетка — новое «появление» тайла
      key={`${previewTile.x},${previewTile.y}`}
      bundle={bundle}
      templateId={previewTile.tile.id}
      x={previewTile.x}
      y={previewTile.y}
      displayRotation={previewTile.displayRotation}
      materials={materials}
      onRotate={rotatePreview}
    />
  );
});
PreviewTileLayer3D.displayName = 'PreviewTileLayer3D';