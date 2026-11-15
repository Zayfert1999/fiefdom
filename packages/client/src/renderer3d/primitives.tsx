// packages/client/src/renderer3d/primitives.tsx
// ============================================
// 🔲 ПЛОСКИЕ ПРИМИТИВЫ ДЛЯ ОВЕРЛЕЕВ
// ============================================
// Рамки и заливки клеток лежат в плоскости XZ на заданной высоте.
// Рамка — плоское кольцо (квадрат с квадратной дырой), а не Line: толщина
// задана в юнитах мира и масштабируется вместе с доской, как stroke-width
// в SVG-версии.
//
// Пульсация opacity (аналог CSS-анимаций preview-pulse, last-tile-breathe)
// считается внутри компонента в useFrame — родителю не нужны ref и state.
// ============================================
import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';

/** Синусоидальная пульсация прозрачности */
export interface PulseOptions {
  readonly min: number;
  readonly max: number;
  /** Период, секунды */
  readonly period: number;
}

const pulseValue = (pulse: PulseOptions, elapsed: number): number =>
  pulse.min + (pulse.max - pulse.min) * (0.5 + 0.5 * Math.sin((elapsed / pulse.period) * Math.PI * 2));

/** Вешает на материал пульсацию opacity; без pulse ничего не делает */
function usePulse(material: THREE.MeshBasicMaterial | null, pulse: PulseOptions | undefined): void {
  useFrame((state) => {
    if (material && pulse) material.opacity = pulseValue(pulse, state.clock.elapsedTime);
  });
}

// ============================================
// 🖼 РАМКА
// ============================================
const ringCache = new Map<string, THREE.ShapeGeometry>();

/** Квадратное кольцо: внешняя сторона size, толщина thickness (в плоскости XY, нормаль +z) */
export function getRingGeometry(size: number, thickness: number): THREE.ShapeGeometry {
  const key = `${size}:${thickness}`;
  const cached = ringCache.get(key);
  if (cached) return cached;

  const outer = size / 2;
  const inner = Math.max(0.01, outer - thickness);
  const shape = new THREE.Shape();
  shape.moveTo(-outer, -outer);
  shape.lineTo(outer, -outer);
  shape.lineTo(outer, outer);
  shape.lineTo(-outer, outer);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner);
  hole.lineTo(-inner, inner);
  hole.lineTo(inner, inner);
  hole.lineTo(inner, -inner);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ShapeGeometry(shape);
  ringCache.set(key, geometry);
  return geometry;
}

interface FrameOutlineProps {
  /** Внешняя сторона квадрата (по умолчанию — тайл целиком) */
  size?: number;
  thickness?: number;
  color: string;
  opacity?: number;
  pulse?: PulseOptions;
  /** Высота над землёй */
  y?: number;
  /** Смещение центра в плоскости XZ */
  x?: number;
  z?: number;
  /** Сдвиг буфера глубины: больше по модулю — рисуется поверх соседей */
  depthOffset?: number;
}

export const FrameOutline = memo(
  ({ size = TILE_SIZE, thickness = 3, color, opacity = 1, pulse, y = 0, x = 0, z = 0, depthOffset = -1 }: FrameOutlineProps) => {
    const geometry = useMemo(() => getRingGeometry(size, thickness), [size, thickness]);
    const material = useMemo(
      () =>
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: depthOffset,
          polygonOffsetUnits: depthOffset,
        }),
      [color, opacity, depthOffset]
    );
    useEffect(() => () => material.dispose(), [material]);
    usePulse(material, pulse);

    return <mesh geometry={geometry} material={material} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} />;
  }
);
FrameOutline.displayName = 'FrameOutline';

// ============================================
// ⬜ ЗАЛИВКА
// ============================================
const squareCache = new Map<number, THREE.PlaneGeometry>();

function getSquareGeometry(size: number): THREE.PlaneGeometry {
  const cached = squareCache.get(size);
  if (cached) return cached;
  const geometry = new THREE.PlaneGeometry(size, size);
  squareCache.set(size, geometry);
  return geometry;
}

interface FlatSquareProps {
  size?: number;
  color: string;
  opacity?: number;
  pulse?: PulseOptions;
  y?: number;
  x?: number;
  z?: number;
  depthOffset?: number;
}

export const FlatSquare = memo(
  ({ size = TILE_SIZE, color, opacity = 0.15, pulse, y = 0, x = 0, z = 0, depthOffset = -1 }: FlatSquareProps) => {
    const geometry = useMemo(() => getSquareGeometry(size), [size]);
    const material = useMemo(
      () =>
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: depthOffset,
          polygonOffsetUnits: depthOffset,
        }),
      [color, opacity, depthOffset]
    );
    useEffect(() => () => material.dispose(), [material]);
    usePulse(material, pulse);

    return <mesh geometry={geometry} material={material} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} />;
  }
);
FlatSquare.displayName = 'FlatSquare';
