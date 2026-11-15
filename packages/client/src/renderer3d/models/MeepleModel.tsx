// packages/client/src/renderer3d/models/MeepleModel.tsx
// ============================================
// 🧍 3D-МОДЕЛЬ МИППЛА
// ============================================
// Фигурка — выдавленный силуэт (см. meepleOutline.ts) со скошенными краями.
// Одна геометрия на всё приложение, материал — на каждый мипл (цвет игрока,
// пульсация, прозрачность при анимациях).
//
// 🧭 ОРИЕНТАЦИЯ (как в SVG-версии: мипл не вращается вместе с тайлом)
//   • обычный мипл стоит лицом на юг (к камере) и чуть откинут назад,
//     чтобы при виде сверху не превращаться в «щепку»;
//   • фермер (фича «поле») лежит на земле головой на север — так же,
//     как в настольной игре и как «+90°» в SVG.
//
// Начало координат фигурки — точка опоры (подошвы / центр лежащего тела
// на земле): родитель ставит группу ровно на поверхность фичи.
// ============================================
import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { meepleOutline } from './meepleOutline';

/** Рост фигурки в юнитах (тайл — 100) */
export const MEEPLE_HEIGHT = 22;
/** Толщина без учёта скоса */
const MEEPLE_THICKNESS = 6;
const BEVEL_THICKNESS = 1.1;
const BEVEL_SIZE = 0.8;
/** Наклон стоящего мипла назад, радианы */
const STAND_LEAN = 0.4;

/** Радиус круга, в который гарантированно помещается фигурка (для зон клика) */
export const MEEPLE_HIT_RADIUS = MEEPLE_HEIGHT * 0.6;

let sharedGeometry: THREE.ExtrudeGeometry | null = null;

/** Общая геометрия миппла (строится один раз) */
export function getMeepleGeometry(): THREE.ExtrudeGeometry {
  if (sharedGeometry) return sharedGeometry;

  const shape = new THREE.Shape(
    meepleOutline().map(([x, y]) => new THREE.Vector2(x * MEEPLE_HEIGHT, y * MEEPLE_HEIGHT))
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: MEEPLE_THICKNESS,
    bevelEnabled: true,
    bevelThickness: BEVEL_THICKNESS,
    bevelSize: BEVEL_SIZE,
    bevelSegments: 2,
    steps: 1,
  });
  // Центр по толщине — в нуле: лицевая грань смотрит на +z
  geometry.translate(0, 0, -MEEPLE_THICKNESS / 2);
  geometry.computeBoundingSphere();
  sharedGeometry = geometry;
  return geometry;
}

// ============================================
// 🎨 МАТЕРИАЛ
// ============================================
export interface MeepleMaterialOptions {
  /** Свечение (временный мипл, подсказка выбора) */
  emissive?: string;
  emissiveIntensity?: number;
  /** Полупрозрачность (призрачные споты выбора) */
  opacity?: number;
  /** Сортировать как прозрачный даже при opacity = 1 (мипл, у которого opacity анимируется) */
  transparent?: boolean;
}

/** Материал мипла: пересоздаётся при смене цвета, освобождается при размонтировании */
export function useMeepleMaterial(color: string, options: MeepleMaterialOptions = {}): THREE.MeshStandardMaterial {
  const { emissive = '#000000', emissiveIntensity = 0, opacity = 1, transparent = opacity < 1 } = options;

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.08,
        emissive,
        emissiveIntensity,
        transparent,
        opacity,
      }),
    [color, emissive, emissiveIntensity, opacity, transparent]
  );

  useEffect(() => () => material.dispose(), [material]);
  return material;
}

// ============================================
// 🧍 ФИГУРКА
// ============================================
interface MeepleFigureProps {
  material: THREE.Material;
  /** Фермер: лежит на земле */
  lying?: boolean;
}

export const MeepleFigure = memo(({ material, lying = false }: MeepleFigureProps) => {
  const geometry = getMeepleGeometry();

  if (lying) {
    // Поворот на −90° вокруг X: локальный +y → север (−z), толщина → вверх.
    // Сдвиг по z центрирует тело на споте, по y — кладёт на поверхность.
    return (
      <group position={[0, MEEPLE_THICKNESS / 2 + BEVEL_THICKNESS, MEEPLE_HEIGHT / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={geometry} material={material} castShadow receiveShadow />
      </group>
    );
  }

  return (
    <group rotation={[-STAND_LEAN, 0, 0]}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
    </group>
  );
});
MeepleFigure.displayName = 'MeepleFigure';
