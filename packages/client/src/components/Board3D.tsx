// packages/client/src/components/Board3D.tsx
// ============================================
// 🧱 3D-ДОСКА: СКЕЛЕТ
// ============================================
// Показывает набор расставленных тайлов (PlacedTile → TilePlacement) в 3D:
//   • один InstancedMesh на каждый тип тайла (меш и вершинные цвета общие)
//   • MapControls: ЛКМ — панорама по земле, ПКМ — вращение, колесо — зум
//   • пикинг клетки лучом до плоскости доски (без рейкаста по мешам),
//     пикинг фичи под курсором — по индексу треугольника → группа меша
//   • подсветка клетки под курсором (в том числе пустой — для будущей
//     постановки тайлов)
//
// Мипплы, оверлеи регионов и превью тайла — следующие шаги.
// ============================================
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Line, MapControls } from '@react-three/drei';
import type { MeshGroup, MeshSurface, TileBundle } from '@/core/geometry/tileMesh';
import { TILE_SIZE, TileInstances, type TilePlacement } from './TileMeshObjects';

/** Тайл на доске: ссылка на бандл + позиция */
export interface BoardPlacement extends TilePlacement {
  /** id бандла (TileBundle.tileId) */
  readonly tileId: string;
}

/** Что сейчас под курсором */
export interface Board3DHover {
  readonly col: number;
  readonly row: number;
  /** null — пустая клетка */
  readonly placement: BoardPlacement | null;
  readonly featureId?: string;
  readonly surface?: MeshSurface;
}

interface Board3DProps {
  placements: readonly BoardPlacement[];
  bundles: ReadonlyMap<string, TileBundle>;
  cols: number;
  rows: number;
  shadows?: boolean;
  wireframe?: boolean;
  /** Высота подсветки клетки над доской */
  highlightHeight?: number;
  height?: number | string;
  onHover?: (hover: Board3DHover | null) => void;
}

// ============================================
// 🔲 ПОДСВЕТКА КЛЕТКИ
// ============================================
const CellHighlight = memo(({ col, row, y }: { col: number; row: number; y: number }) => {
  const half = TILE_SIZE / 2;
  const points = useMemo<[number, number, number][]>(
    () => [
      [-half, 0, -half],
      [half, 0, -half],
      [half, 0, half],
      [-half, 0, half],
      [-half, 0, -half],
    ],
    [half]
  );

  return (
    <group position={[col * TILE_SIZE, y, row * TILE_SIZE]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <Line points={points} color="#38bdf8" lineWidth={2} />
    </group>
  );
});
CellHighlight.displayName = 'CellHighlight';

// ============================================
// 🌍 СЦЕНА
// ============================================
export const Board3D = memo(({
  placements,
  bundles,
  cols,
  rows,
  shadows = true,
  wireframe = false,
  highlightHeight = 12,
  height = '68vh',
  onHover,
}: Board3DProps) => {
  const [hoverCell, setHoverCell] = useState<{ col: number; row: number } | null>(null);
  const lastKey = useRef<string>('');

  // Центр доски: сдвигаем всю сцену, чтобы он оказался в мировом (0, 0, 0)
  const centerX = ((cols - 1) * TILE_SIZE) / 2;
  const centerZ = ((rows - 1) * TILE_SIZE) / 2;
  const extent = Math.max(cols, rows) * TILE_SIZE;

  // Размножаем один меш на все клетки с этим тайлом
  const groups = useMemo(() => {
    const byTile = new Map<string, BoardPlacement[]>();
    for (const placement of placements) {
      const list = byTile.get(placement.tileId);
      if (list) list.push(placement);
      else byTile.set(placement.tileId, [placement]);
    }
    return [...byTile.entries()];
  }, [placements]);

  /** Сообщаем наружу только об изменениях, а не о каждом движении мыши */
  const emit = useCallback(
    (next: Board3DHover | null) => {
      const key = next
        ? `${next.col},${next.row},${next.featureId ?? ''},${next.placement?.rotation ?? ''}`
        : '';
      if (key === lastKey.current) return;
      lastKey.current = key;
      setHoverCell(next ? { col: next.col, row: next.row } : null);
      onHover?.(next);
    },
    [onHover]
  );

  const handleInstanceHover = useCallback(
    (hit: { placement: TilePlacement; group: MeshGroup | null } | null) => {
      if (!hit) {
        emit(null);
        return;
      }
      const placement = hit.placement as BoardPlacement;
      emit({
        col: placement.col,
        row: placement.row,
        placement,
        featureId: hit.group?.featureId,
        surface: hit.group?.surface,
      });
    },
    [emit]
  );

  const handleGroundMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      // Точка в мировых координатах → клетка доски
      const col = Math.round((event.point.x + centerX) / TILE_SIZE);
      const row = Math.round((event.point.z + centerZ) / TILE_SIZE);
      const placement = placements.find((p) => p.col === col && p.row === row) ?? null;
      emit({ col, row, placement });
    },
    [centerX, centerZ, placements, emit]
  );

  // Тень покрывает всю доску
  const shadowSize = extent * 0.75;

  return (
    <div style={{ width: '100%', height, borderRadius: 8, overflow: 'hidden' }}>
      <Canvas
        shadows={shadows}
        dpr={[1, 2]}
        camera={{ position: [0, extent * 1.05 + 100, extent * 0.8 + 80], fov: 40, near: 1, far: 10000 }}
        style={{ background: '#0b1020' }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[shadowSize * 0.8, shadowSize * 1.6, shadowSize * 0.55]}
          intensity={1.0}
          castShadow={shadows}
          shadow-mapSize-width={4096}
          shadow-mapSize-height={4096}
          shadow-camera-left={-shadowSize}
          shadow-camera-right={shadowSize}
          shadow-camera-top={shadowSize}
          shadow-camera-bottom={-shadowSize}
          shadow-camera-near={1}
          shadow-camera-far={shadowSize * 5}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-shadowSize * 0.5, shadowSize * 0.8, -shadowSize * 0.5]} intensity={0.3} />

        <group position={[-centerX, 0, -centerZ]}>
          {groups.map(([tileId, list]) => {
            const bundle = bundles.get(tileId);
            if (!bundle) return null;
            return (
              <TileInstances
                key={tileId}
                mesh={bundle.mesh}
                placements={list}
                wireframe={wireframe}
                onHover={handleInstanceHover}
              />
            );
          })}

          {/* Невидимая плоскость для пикинга клеток, в том числе пустых */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[centerX, 0.01, centerZ]}
            onPointerMove={handleGroundMove}
            onPointerOut={() => emit(null)}
          >
            <planeGeometry args={[(cols + 4) * TILE_SIZE, (rows + 4) * TILE_SIZE]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>

          {hoverCell && <CellHighlight col={hoverCell.col} row={hoverCell.row} y={highlightHeight} />}
        </group>

        <MapControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          screenSpacePanning={false}
          minDistance={60}
          maxDistance={extent * 3}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Canvas>
    </div>
  );
});
Board3D.displayName = 'Board3D';
