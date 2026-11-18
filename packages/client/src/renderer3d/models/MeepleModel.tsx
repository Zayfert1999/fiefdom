// packages/client/src/renderer3d/models/MeepleModel.tsx
// ============================================
// 🧍 3D-МОДЕЛЬ МИППЛА
// ============================================
// Фигурка — выдавленный силуэт (см. meepleOutline.ts) со скошенными краями.
// Одна геометрия на всё приложение, материал — на каждый мипл (цвет игрока,
// пульсация, прозрачность при анимациях).
//
// 🧭 ОРИЕНТАЦИЯ (как в SVG-версии: мипл не вращается вместе с тайлом и не следит за камерой)
//   • обычный мипл стоит прямо (STAND_LEAN = 0), повёрнут на 90° влево от «лицом на юг»
//     (STAND_YAW), то есть смотрит на восток;
//   • фермер (фича «поле») лежит на земле головой на север — так же,
//     как в настольной игре и как «+90°» в SVG.
//
// Начало координат фигурки — точка опоры (подошвы / центр лежащего тела
// на земле): родитель ставит группу ровно на поверхность фичи.
// ============================================
import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { meepleOutline } from './meepleOutline';

/** Рост фигурки в юнитах (тайл — 100) */
export const MEEPLE_HEIGHT = 22;
/** Толщина без учёта скоса */
const MEEPLE_THICKNESS = 6;
const BEVEL_THICKNESS = 1.1;
const BEVEL_SIZE = 0.8;
/** Наклон стоящего мипла назад, радианы (0 — стоит прямо) */
const STAND_LEAN = 0;
/** Поворот стоящего мипла вокруг вертикали: +90° — влево (против часовой сверху), лицом на восток */
const STAND_YAW = Math.PI / 2;

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
// ✏️ ОБВОДКА (inverted hull)
// ============================================
// Обводка — копия фигурки с обращёнными гранями (BackSide), вершины которой сдвинуты по
// нормали на толщину обводки: из-за фигурки торчит только кайма. Нормали ExtrudeGeometry
// плоские (по граням), на рёбрах кайма разошлась бы щелями, поэтому для обводки вершины
// склеиваются и нормали пересчитываются сглаженными.
let sharedOutlineGeometry: THREE.BufferGeometry | null = null;

export function getMeepleOutlineGeometry(): THREE.BufferGeometry {
  if (sharedOutlineGeometry) return sharedOutlineGeometry;

  const source = getMeepleGeometry().clone();
  source.deleteAttribute('normal');
  source.deleteAttribute('uv');
  const smooth = mergeVertices(source, 1e-3);
  smooth.computeVertexNormals();
  sharedOutlineGeometry = smooth;
  return smooth;
}

/** Толщина обводки по умолчанию, юниты (рост фигурки — MEEPLE_HEIGHT) */
export const MEEPLE_OUTLINE_THICKNESS = 1.4;

/** Материал обводки: однотонный, без освещения; opacity можно анимировать */
export function useMeepleOutlineMaterial(
  color: string,
  thickness: number = MEEPLE_OUTLINE_THICKNESS
): THREE.MeshBasicMaterial {
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color,
      side: THREE.BackSide,
      transparent: true,
      toneMapped: false,
    });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = position + normal * ${thickness.toFixed(3)};`
      );
    };
    m.customProgramCacheKey = () => `meeple-outline-${thickness}`;
    return m;
  }, [color, thickness]);

  useEffect(() => () => material.dispose(), [material]);
  return material;
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
  /** Обводка вокруг фигурки (материал из useMeepleOutlineMaterial); без неё — без обводки */
  outline?: THREE.Material | null;
}

export const MeepleFigure = memo(({ material, lying = false, outline = null }: MeepleFigureProps) => {
  const geometry = getMeepleGeometry();
  const body = (
    <>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {outline && <mesh geometry={getMeepleOutlineGeometry()} material={outline} />}
    </>
  );

  if (lying) {
    // Поворот на −90° вокруг X: локальный +y → север (−z), толщина → вверх.
    // Сдвиг по z центрирует тело на споте, по y — кладёт на поверхность.
    return (
      <group position={[0, MEEPLE_THICKNESS / 2 + BEVEL_THICKNESS, MEEPLE_HEIGHT / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        {body}
      </group>
    );
  }

  // Сначала откидываем (STAND_LEAN), затем поворачиваем вокруг вертикали (STAND_YAW)
  return (
    <group rotation={[0, STAND_YAW, 0]}>
      <group rotation={[-STAND_LEAN, 0, 0]}>{body}</group>
    </group>
  );
});
MeepleFigure.displayName = 'MeepleFigure';