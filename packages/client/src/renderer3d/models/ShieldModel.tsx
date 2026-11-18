// packages/client/src/renderer3d/models/ShieldModel.tsx
// ============================================
// 🛡️ 3D-МОДЕЛЬ ЩИТА
// ============================================
// Геральдический щит из двух выдавленных слоёв: золотая кайма и синее поле.
// Стоит на поверхности города, обращён на юг (к камере) и откинут назад —
// «всегда вертикальный» относительно экрана, как в SVG-версии, где поворот
// тайла компенсировался. Цвета вынесены в SHIELD_COLORS: в SVG-версии они
// зашиты в shield.svg, здесь их удобно править.
//
// Щит лежит в группе тайла и поворачивался бы вместе с ним, поэтому каждый кадр его
// разворот пересчитывается: SHIELD_YAW минус текущий поворот родителя вокруг Y. Это
// работает и для поставленных тайлов, и для падающего (доворот), и для превью, у которого
// поворот плавно анимируется, — щит всегда смотрит в камеру.
//
// Начало координат — нижняя точка щита.
// ============================================
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SHIELD_YAW } from '../cameraPreset';

export const SHIELD_WIDTH = 15;
export const SHIELD_HEIGHT = 17;
const SHIELD_LEAN = 0.45;
const RIM_DEPTH = 1.4;
const FACE_DEPTH = 0.9;

export const SHIELD_COLORS = {
  rim: '#d9b44a',
  face: '#2f56c4',
} as const;

/** Контур щита с плоским верхом и острым низом; размеры нормированы по ширине/высоте */
function createShieldShape(width: number, height: number): THREE.Shape {
  const w = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w, height);
  shape.lineTo(w, height);
  shape.lineTo(w, height * 0.55);
  shape.quadraticCurveTo(w, height * 0.18, 0, 0);
  shape.quadraticCurveTo(-w, height * 0.18, -w, height * 0.55);
  shape.closePath();
  return shape;
}

interface ShieldGeometries {
  rim: THREE.ExtrudeGeometry;
  face: THREE.ExtrudeGeometry;
}

let shared: ShieldGeometries | null = null;

function getShieldGeometries(): ShieldGeometries {
  if (shared) return shared;

  const bevel = { bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 1, steps: 1 };
  const rim = new THREE.ExtrudeGeometry(createShieldShape(SHIELD_WIDTH, SHIELD_HEIGHT), { depth: RIM_DEPTH, ...bevel });

  // Синее поле — тот же контур, уменьшенный к центру массы щита
  const inset = 0.72;
  const face = new THREE.ExtrudeGeometry(createShieldShape(SHIELD_WIDTH * inset, SHIELD_HEIGHT * inset), {
    depth: FACE_DEPTH,
    ...bevel,
  });
  face.translate(0, SHIELD_HEIGHT * (1 - inset) * 0.62, RIM_DEPTH - 0.2);

  shared = { rim, face };
  return shared;
}

/** Материалы щита; emissive кайма мерцает (см. ShieldsLayer3D) */
export interface ShieldMaterials {
  rim: THREE.MeshStandardMaterial;
  face: THREE.MeshStandardMaterial;
}

export function useShieldMaterials(): ShieldMaterials {
  const materials = useMemo<ShieldMaterials>(
    () => ({
      rim: new THREE.MeshStandardMaterial({
        color: SHIELD_COLORS.rim,
        roughness: 0.35,
        metalness: 0.55,
        emissive: '#ffd700',
        emissiveIntensity: 0,
      }),
      face: new THREE.MeshStandardMaterial({ color: SHIELD_COLORS.face, roughness: 0.55, metalness: 0.1 }),
    }),
    []
  );

  useEffect(
    () => () => {
      materials.rim.dispose();
      materials.face.dispose();
    },
    [materials]
  );
  return materials;
}

interface ShieldFigureProps {
  materials: ShieldMaterials;
}

const parentQuaternion = new THREE.Quaternion();
const parentEuler = new THREE.Euler();

export const ShieldFigure = memo(({ materials }: ShieldFigureProps) => {
  const { rim, face } = getShieldGeometries();
  const facing = useRef<THREE.Group>(null);

  useFrame(() => {
    const group = facing.current;
    const parent = group?.parent;
    if (!group || !parent) return;

    // Мировой поворот родителя (тайл, превью) вокруг вертикали; матрицы актуальны к этому кадру
    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(parentQuaternion);
    parentEuler.setFromQuaternion(parentQuaternion, 'YXZ');
    group.rotation.y = SHIELD_YAW - parentEuler.y;
  });

  return (
    // Лицом к камере (yaw пресета) с компенсацией поворота тайла, затем откинут назад
    <group ref={facing} rotation={[0, SHIELD_YAW, 0]}>
      <group rotation={[-SHIELD_LEAN, 0, 0]}>
        <mesh geometry={rim} material={materials.rim} castShadow />
        <mesh geometry={face} material={materials.face} castShadow />
      </group>
    </group>
  );
});
ShieldFigure.displayName = 'ShieldFigure';