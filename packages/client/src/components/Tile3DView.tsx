// packages/client/src/components/Tile3DView.tsx
// ============================================
// 🎮 3D ВЬЮПОРТ ОДНОГО ТАЙЛА
// ============================================
// 🌟 ЧТО ИЗМЕНИЛОСЬ:
//   • Вместо 6–7 ExtrudeGeometry — один меш из core/geometry/tileMesh.ts
//     (триангуляция earcut, стены без лишних граней, группы по фичам).
//     Тот же меш используется на 3D-доске (Board3D) — они не разойдутся.
//   • Исправлено зеркало: раньше rotateX(-π/2) отправлял y формы в −z,
//     и тайл был перевёрнут по оси север-юг относительно 2D.
//     Теперь (x, y) → (x, высота, y): юг = низ экрана, как в SVG.
//   • Убран циклический импорт PLAZA_COLOR из GeometrySandbox
//     (цвета теперь в MeshParams).
// ============================================
import { memo, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { TileGeometryResult } from '@/core/geometry';
import {
  buildTileMesh,
  type MeshFeature,
  type MeshParamsInput,
} from '@/core/geometry/tileMesh';
import { TileMeshObject } from './TileMeshObjects';

interface Tile3DViewProps {
  result: TileGeometryResult;
  size: number;
  /** Фичи тайла (нужны, чтобы отличить монастырь от города) */
  features?: readonly MeshFeature[];
  meshParams?: MeshParamsInput;
  wireframe?: boolean;
}

export const Tile3DView = memo(({ result, size, features, meshParams, wireframe = false }: Tile3DViewProps) => {
  const mesh = useMemo(() => {
    // Запасной вариант без features: монастырь определяем по id, как раньше
    const meshFeatures: readonly MeshFeature[] =
      features ??
      Array.from(result.tessellation.areas.keys()).map((id) => ({
        id,
        type: id.includes('monastery') ? ('monastery' as const) : ('city' as const),
      }));
    // Одиночный тайл показываем сплошным блоком: стены по периметру нужны,
    // иначе при взгляде сбоку видно «пустоту» под поверхностями
    return buildTileMesh(result, meshFeatures, { ...meshParams, boundaryWalls: true });
  }, [result, features, meshParams]);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
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

        <TileMeshObject mesh={mesh} wireframe={wireframe} />

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
