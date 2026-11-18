// packages/client/src/renderer3d/GameBoard3D.tsx
// ============================================
// 🎲 ИГРОВАЯ 3D-ДОСКА (замена SVG Board)
// ============================================
// Собирает слои на базе скелета components/Board3D.tsx: свет с тенями,
// MapControls, пикинг клетки лучом до плоскости земли. Контракт тот же, что
// у renderer/Board: onGridClick(x, y) и validCells.
//
// Слои (аналоги SVG-слоёв, снизу вверх):
//   пол и сетка → тайлы → щиты → клетки → подсветка регионов → завершение →
//   последние тайлы → debug → превью → падение тайла → мипл-споты → мипли
//
// Клики: ЛКМ — клетка (перетаскивание камеры отличается по event.delta),
//        Ctrl/Cmd+клик — debug-выбор тайла, как в SVG.
// ============================================
import { memo, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { MapControls, useCursor } from '@react-three/drei';
import { TILE_SIZE, WORLD_BOUNDS } from '@fiefdom/shared/core/constants';
import { useGameStore } from '@/state/useGameStore';
import { CAMERA_MAX_DISTANCE, CAMERA_MIN_DISTANCE, CameraRig, DEFAULT_CAMERA_OFFSET } from './CameraRig';
import { CAMERA_PRESET, controlsLimits } from './cameraPreset';
import { FrameOutline } from './primitives';
import { useShieldMaterials } from './models/ShieldModel';
import { worldToCell } from './boardMath';
import { prewarmBundles } from './tileBundles';
import { CellsLayer3D } from './layers/CellsLayer3D';
import { DebugLayer3D, LastPlacedLayer3D } from './layers/MarkerLayers3D';
import { MeepleLayer3D } from './layers/MeepleLayer3D';
import { MeepleSelectionLayer3D } from './layers/MeepleSelectionLayer3D';
import { PlacedTileAnimation3D } from './layers/PlacedTileAnimation3D';
import { PreviewTileLayer3D } from './layers/PreviewTileLayer3D';
import { CompletionOverlay3D, RegionOverlayLayer3D } from './layers/RegionOverlayLayer3D';
import { ShieldsLayer3D } from './layers/ShieldsLayer3D';
import { TilesLayer3D } from './layers/TilesLayer3D';
import { BoardLights } from './BoardLights';

/** Длительность анимации установки (как таймер в SVG Board) */
const PLACEMENT_ANIMATION_MS = 700;
/** Сдвиг курсора между нажатием и отпусканием, после которого это перетаскивание камеры */
const CLICK_DRAG_PX = 5;

const WORLD_TILES_X = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 1;
const WORLD_TILES_Z = WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY + 1;
const WORLD_WIDTH = WORLD_TILES_X * TILE_SIZE;
const WORLD_DEPTH = WORLD_TILES_Z * TILE_SIZE;
const WORLD_CENTER_X = ((WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2) * TILE_SIZE;
const WORLD_CENTER_Z = ((WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY) / 2) * TILE_SIZE;

/** Ограничения MapControls из пресета камеры (жёсткие углы или свободное вращение) */
const LIMITS = controlsLimits(CAMERA_PRESET);

/** Без вращения ПКМ и второй палец тоже панорамируют/зумят — вращать всё равно нечего */
const LOCKED_BUTTONS = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
const LOCKED_TOUCHES = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

type BoardProps = {
  onGridClick: (x: number, y: number) => void;
  validCells: Set<string>;
};

// ============================================
// 🌍 ПОЛ, СЕТКА, ГРАНИЦА МИРА (аналог BoardBackground)
// ============================================
const BoardFloor = memo(() => (
  <group position={[WORLD_CENTER_X, 0, WORLD_CENTER_Z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[WORLD_WIDTH + TILE_SIZE * 4, WORLD_DEPTH + TILE_SIZE * 4]} />
      <meshStandardMaterial color="#202020" roughness={1} metalness={0} />
    </mesh>

    {/* Линии сетки идут по границам тайлов (центры тайлов — в кратных TILE_SIZE) */}
    <gridHelper args={[WORLD_WIDTH, WORLD_TILES_X, '#363636', '#363636']} position={[0, 0.03, 0]} />

    {/* Осевые линии */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, -WORLD_CENTER_Z]}>
      <planeGeometry args={[WORLD_WIDTH, 2]} />
      <meshBasicMaterial color="#444444" />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[-WORLD_CENTER_X, 0.04, 0]}>
      <planeGeometry args={[WORLD_DEPTH, 2]} />
      <meshBasicMaterial color="#444444" />
    </mesh>

    {/* Граница мира (красная, как пунктир в SVG) */}
    <FrameOutline size={WORLD_WIDTH} thickness={8} color="#ff0000" opacity={0.3} y={0.05} />
  </group>
));
BoardFloor.displayName = 'BoardFloor';

// ============================================
// 🎬 СЦЕНА
// ============================================
const Scene = ({ onGridClick, validCells }: BoardProps) => {
  const setDebugSelectedTile = useGameStore((s) => s.setDebugSelectedTile);
  const shieldMaterials = useShieldMaterials();
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);

  const hoverValid = hoverCell !== null && validCells.has(`${hoverCell.x},${hoverCell.y}`);
  useCursor(hoverValid);

  // Прогрев геометрии тайлов в простое: первый тайл в руке не подвесит кадр
  useEffect(() => prewarmBundles(), []);

  /** Единый обработчик кликов по клетке (земля и тайлы) */
  const handleCell = useCallback(
    (x: number, y: number, event: ThreeEvent<MouseEvent>): void => {
      if (event.delta > CLICK_DRAG_PX) return; // это было перетаскивание камеры
      if (event.nativeEvent.ctrlKey || event.nativeEvent.metaKey) {
        setDebugSelectedTile({ x, y });
        return;
      }
      onGridClick(x, y);
    },
    [onGridClick, setDebugSelectedTile]
  );

  const handleGroundClick = useCallback(
    (event: ThreeEvent<MouseEvent>): void => {
      event.stopPropagation();
      const cell = worldToCell(event.point.x, event.point.z);
      handleCell(cell.x, cell.y, event);
    },
    [handleCell]
  );

  const handleGroundMove = useCallback((event: ThreeEvent<PointerEvent>): void => {
    const cell = worldToCell(event.point.x, event.point.z);
    setHoverCell((prev) => (prev && prev.x === cell.x && prev.y === cell.y ? prev : cell));
  }, []);

  return (
    <>
      <color attach="background" args={['#1a1a1a']} />
      <BoardLights />
      <BoardFloor />

      <TilesLayer3D onTileClick={handleCell} />
      <ShieldsLayer3D materials={shieldMaterials} />
      <CellsLayer3D validCells={validCells} hoverCell={hoverCell} />
      <RegionOverlayLayer3D />
      <CompletionOverlay3D />
      <LastPlacedLayer3D />
      <DebugLayer3D />
      <PreviewTileLayer3D materials={shieldMaterials} />
      <PlacedTileAnimation3D materials={shieldMaterials} />
      <MeepleSelectionLayer3D />
      <MeepleLayer3D />

      {/* Невидимая плоскость для пикинга клеток, в том числе пустых */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[WORLD_CENTER_X, 0.01, WORLD_CENTER_Z]}
        onClick={handleGroundClick}
        onPointerMove={handleGroundMove}
        onPointerOut={() => setHoverCell(null)}
      >
        <planeGeometry args={[WORLD_WIDTH + TILE_SIZE * 4, WORLD_DEPTH + TILE_SIZE * 4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <MapControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        screenSpacePanning={false}
        minDistance={CAMERA_MIN_DISTANCE}
        maxDistance={CAMERA_MAX_DISTANCE}
        enableRotate={LIMITS.enableRotate}
        minPolarAngle={LIMITS.minPolarAngle}
        maxPolarAngle={LIMITS.maxPolarAngle}
        minAzimuthAngle={LIMITS.minAzimuthAngle}
        maxAzimuthAngle={LIMITS.maxAzimuthAngle}
        {...(LIMITS.enableRotate ? {} : { mouseButtons: LOCKED_BUTTONS, touches: LOCKED_TOUCHES })}
      />
      <CameraRig />
    </>
  );
};

// ============================================
// 🎲 ДОСКА
// ============================================
export const GameBoard3D = ({ onGridClick, validCells }: BoardProps) => {
  const phase = useGameStore((s) => s.phase);
  const placementAnimation = useGameStore((s) => s.placementAnimation);
  const setPlacementAnimation = useGameStore((s) => s.setPlacementAnimation);

  // Очистка анимации установки (как в SVG Board)
  useEffect(() => {
    if (!placementAnimation) return;
    const timer = setTimeout(() => setPlacementAnimation(null), PLACEMENT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [placementAnimation, setPlacementAnimation]);

  const isBoardLocked = phase === 'endTurn';

  return (
    <div className="board-3d" style={{ pointerEvents: isBoardLocked ? 'none' : 'auto' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: [DEFAULT_CAMERA_OFFSET.x, DEFAULT_CAMERA_OFFSET.y, DEFAULT_CAMERA_OFFSET.z],
          fov: CAMERA_PRESET.fov,
          near: 10,
          far: 8000,
        }}
      >
        <Scene onGridClick={onGridClick} validCells={validCells} />
      </Canvas>
    </div>
  );
};