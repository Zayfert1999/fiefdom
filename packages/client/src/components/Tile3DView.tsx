// packages/client/src/components/Tile3DView.tsx
// ============================================
// 🎮 3D ВЬЮПОРТ ТАЙЛА
// ============================================
import { useMemo, memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Ring, Polygon, TileGeometryResult } from '@/core/geometry';
import { PLAZA_COLOR } from './GeometrySandbox';

// ============================================
// ⚙️ КОНСТАНТЫ
// ============================================

const HEIGHTS = {
  base: 4.0,
  field: 4.0,
  road: 2.0,
  plaza: 2.0,
  city: 2.0,
  monastery: 4.0,
} as const;

const FEATURE_COLORS_3D: Record<string, string> = {
  base: '#8b7355',
  city: '#a67c52',
  road: '#c9b38c',
  field: '#6a994e',
  monastery: '#d47843',
};

// ============================================
// 🛠️ УТИЛИТЫ: POLYGON → THREE.Shape
// ============================================

/** Создаёт THREE.Shape из Ring */
function pointsToShape(points: Ring): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length === 0) return shape;

  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  return shape;
}

/**
 * Создаёт THREE.Shape из Polygon с дырками.
 * polygon[0] — внешний контур, polygon[1..] — дырки.
 */
function polygonToShapeWithHoles(polygon: Polygon): THREE.Shape {
  const shape = pointsToShape(polygon[0]);

  for (let i = 1; i < polygon.length; i++) {
    const holePath = new THREE.Path();
    const hole = polygon[i];
    if (hole.length === 0) continue;

    holePath.moveTo(hole[0][0], hole[0][1]);
    for (let j = 1; j < hole.length; j++) {
      holePath.lineTo(hole[j][0], hole[j][1]);
    }
    holePath.closePath();
    shape.holes.push(holePath);
  }

  return shape;
}

// ============================================
// 🧊 КОМПОНЕНТ: ЭКСТРУДИРОВАННЫЙ POLYGON
// ============================================

interface ExtrudedPolygonProps {
  polygon: Polygon;
  height: number;
  color: string;
  positionY?: number;
}

const ExtrudedPolygon = memo(({ polygon, height, color, positionY = 0 }: ExtrudedPolygonProps) => {
  const geometry = useMemo(() => {
    const shape = polygonToShapeWithHoles(polygon);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
  }, [polygon, height]);

  return (
    <mesh geometry={geometry} position={[0, positionY, 0]} castShadow receiveShadow>
      <meshStandardMaterial
        color={color}
        side={THREE.FrontSide}
        roughness={0.7}
        metalness={0.1}
      />
    </mesh>
  );
});

ExtrudedPolygon.displayName = 'ExtrudedPolygon';

// ============================================
// 🎮 3D ВЬЮПОРТ ТАЙЛА
// ============================================

interface Tile3DViewProps {
  result: TileGeometryResult;
  size: number;
}

export const Tile3DView = memo(({ result, size }: Tile3DViewProps) => {
  const { tessellation, decorations, clipping, assignments } = result;

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <Canvas
        camera={{
          position: [0, 120, 120],
          fov: 45,
          near: 0.1,
          far: 1000,
        }}
        shadows
        style={{ background: '#1a1a2e' }}
      >
        {/* Освещение */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[50, 80, 50]}
          intensity={1.0}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          shadow-camera-near={1}
          shadow-camera-far={250}
          shadow-bias={-0.001}
        />
        <directionalLight position={[-30, 40, -30]} intensity={0.3} />

        {/* 🌟 ПОДЛОЖКА (base) — фундамент тайла */}
        <ExtrudedPolygon
          key="base"
          polygon={[
            [
              [-50, -50],
              [50, -50],
              [50, 50],
              [-50, 50],
            ]
          ]}
          height={HEIGHTS.base}
          color={FEATURE_COLORS_3D.base}
        />

        {/* Поля: итерируем MultiPolygon → каждый Polygon */}
        {Array.from(assignments.fieldGeometries.entries()).map(([featureId, multiPolygon]) =>
          multiPolygon.map((polygon, i) => (
            <ExtrudedPolygon
              key={`field-${featureId}-${i}`}
              polygon={polygon}
              height={HEIGHTS.field}
              color={FEATURE_COLORS_3D.field}
              positionY={HEIGHTS.base}
            />
          ))
        )}

        {/* Дороги: итерируем MultiPolygon → каждый Polygon */}
        {Array.from(clipping.clippedLines.entries()).map(([featureId, multiPolygon]) =>
          multiPolygon.map((polygon, i) => (
            <ExtrudedPolygon
              key={`road-${featureId}-${i}`}
              polygon={polygon}
              height={HEIGHTS.road}
              color={FEATURE_COLORS_3D.road}
              positionY={HEIGHTS.base}
            />
          ))
        )}

        {/* Площади: plaza is Ring → оборачиваем в Polygon [ring] */}
        {decorations.plazas.map((plaza, i) => (
          <ExtrudedPolygon
            key={`plaza-${i}`}
            polygon={[plaza]}
            height={HEIGHTS.plaza}
            color={PLAZA_COLOR}
            positionY={HEIGHTS.base}
          />
        ))}

        {/* Города и монастыри: итерируем MultiPolygon → каждый Polygon */}
        {Array.from(tessellation.areas.entries()).map(([featureId, multiPolygon]) => {
          const isMonastery = featureId.includes('monastery');
          const height = isMonastery ? HEIGHTS.monastery : HEIGHTS.city;
          const color = isMonastery ? FEATURE_COLORS_3D.monastery : FEATURE_COLORS_3D.city;
          return multiPolygon.map((polygon, i) => (
            <ExtrudedPolygon
              key={`area-${featureId}-${i}`}
              polygon={polygon}
              height={height}
              color={color}
              positionY={HEIGHTS.base}
            />
          ));
        })}

        {/* Управление камерой */}
        <OrbitControls
          makeDefault
          minDistance={30}
          maxDistance={250}
          maxPolarAngle={Math.PI / 2.1}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
});

Tile3DView.displayName = 'Tile3DView';