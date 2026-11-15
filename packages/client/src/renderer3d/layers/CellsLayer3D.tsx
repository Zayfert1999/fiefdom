// packages/client/src/renderer3d/layers/CellsLayer3D.tsx
// ============================================
// 🟢💀 СЛОЙ КЛЕТОК (аналог SVG CellsOverlay)
// ============================================
// Валидные клетки (белые, «+»), мёртвые (красные, «×») и конфликтные
// (валидные сейчас, но станут мёртвыми после примерки — белая заливка с
// красным «×»). Логика разбиения — копия CellsOverlay.
//
// Клики по клеткам ловит невидимая плоскость земли в GameBoard3D, этот слой
// только рисует: по одному InstancedMesh на заливку, рамку и символ.
// ============================================
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { findDeadCells, getTilePorts, rotateFeatures } from '@fiefdom/shared/core/tileUtils';
import type { PlacedTile } from '@fiefdom/shared/core/types';
import { getVirtualDeck } from '@/core/deckUtils';
import { useGameStore } from '@/state/useGameStore';
import { FlatSquare, FrameOutline, getRingGeometry } from '../primitives';

// Цвета и прозрачности взяты из cells.css
const VALID_COLOR = '#ffffff';
const DEAD_COLOR = '#e74c3c';

const CELL_INSET = 2;
const FRAME_THICKNESS = 2;
const SYMBOL_LENGTH = 30;
const SYMBOL_THICKNESS = 3;

const Y_FILL = 0.3;
const Y_FRAME = 0.35;
const Y_SYMBOL = 0.4;

const fillGeometry = new THREE.PlaneGeometry(TILE_SIZE - CELL_INSET * 2, TILE_SIZE - CELL_INSET * 2);
const barGeometry = new THREE.PlaneGeometry(SYMBOL_LENGTH, SYMBOL_THICKNESS);

const parseCell = (key: string): [number, number] => {
  const [x, y] = key.split(',').map(Number);
  return [x, y];
};

// ============================================
// 🧩 НАБОР КЛЕТОК ОДНОГО ВИДА
// ============================================
interface CellSetProps {
  cells: readonly string[];
  fillColor: string;
  fillOpacity: number;
  borderColor: string;
  borderOpacity: number;
  symbol: 'plus' | 'cross';
  symbolColor: string;
}

function useFlatMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [color, opacity]
  );
  return material;
}

const CellSet = memo(
  ({ cells, fillColor, fillOpacity, borderColor, borderOpacity, symbol, symbolColor }: CellSetProps) => {
    const fills = useRef<THREE.InstancedMesh>(null);
    const frames = useRef<THREE.InstancedMesh>(null);
    const symbols = useRef<THREE.InstancedMesh>(null);

    const frameGeometry = useMemo(() => getRingGeometry(TILE_SIZE - CELL_INSET * 2, FRAME_THICKNESS), []);
    const fillMaterial = useFlatMaterial(fillColor, fillOpacity);
    const frameMaterial = useFlatMaterial(borderColor, borderOpacity);
    const symbolMaterial = useFlatMaterial(symbolColor, 0.9);

    useLayoutEffect(() => {
      const dummy = new THREE.Object3D();
      const write = (mesh: THREE.InstancedMesh | null, y: number, angles: readonly number[]): void => {
        if (!mesh) return;
        cells.forEach((key, cellIndex) => {
          const [x, z] = parseCell(key);
          angles.forEach((angle, k) => {
            dummy.position.set(x * TILE_SIZE, y, z * TILE_SIZE);
            dummy.rotation.set(-Math.PI / 2, 0, angle);
            dummy.updateMatrix();
            mesh.setMatrixAt(cellIndex * angles.length + k, dummy.matrix);
          });
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      };

      write(fills.current, Y_FILL, [0]);
      write(frames.current, Y_FRAME, [0]);
      // «+» — горизонтальная и вертикальная планки, «×» — две диагонали
      write(symbols.current, Y_SYMBOL, symbol === 'plus' ? [0, Math.PI / 2] : [Math.PI / 4, -Math.PI / 4]);
    }, [cells, symbol]);

    if (cells.length === 0) return null;
    return (
      <>
        <instancedMesh
          key={`f${cells.length}`}
          ref={fills}
          args={[fillGeometry, fillMaterial, cells.length]}
          frustumCulled={false}
        />
        <instancedMesh
          key={`b${cells.length}`}
          ref={frames}
          args={[frameGeometry, frameMaterial, cells.length]}
          frustumCulled={false}
        />
        <instancedMesh
          key={`s${cells.length}`}
          ref={symbols}
          args={[barGeometry, symbolMaterial, cells.length * 2]}
          frustumCulled={false}
        />
      </>
    );
  }
);
CellSet.displayName = 'CellSet';

// ============================================
// 🟢💀 СЛОЙ
// ============================================
interface CellsLayer3DProps {
  validCells: Set<string>;
  /** Клетка под курсором (подсвечивается, если по ней можно кликнуть) */
  hoverCell: { x: number; y: number } | null;
}

export const CellsLayer3D = memo(({ validCells, hoverCell }: CellsLayer3DProps) => {
  const board = useGameStore((s) => s.board);
  const drawnTile = useGameStore((s) => s.drawnTile);
  const phase = useGameStore((s) => s.phase);
  const showDeadCells = useGameStore((s) => s.showDeadCells);
  const previewTile = useGameStore((s) => s.previewTile);

  // Валидные клетки без клетки превью
  const filteredValid = useMemo(() => {
    if (!previewTile) return validCells;
    const filtered = new Set(validCells);
    filtered.delete(`${previewTile.x},${previewTile.y}`);
    return filtered;
  }, [validCells, previewTile]);

  // Мёртвые клетки с учётом превью-тайла
  const allDead = useMemo(() => {
    let boardToCheck = board;

    if (previewTile) {
      const virtualBoard = new Map(board);
      const rotatedFeatures = rotateFeatures(previewTile.tile.features, previewTile.rotation);
      const virtualTile: PlacedTile = {
        templateId: previewTile.tile.id,
        x: previewTile.x,
        y: previewTile.y,
        rotation: previewTile.rotation,
        features: rotatedFeatures,
        derivedPorts: getTilePorts({ ...previewTile.tile, features: rotatedFeatures }),
      };
      virtualBoard.set(`${previewTile.x},${previewTile.y}`, virtualTile);
      boardToCheck = virtualBoard;
    }

    const dead = findDeadCells(boardToCheck, getVirtualDeck(boardToCheck));
    if (previewTile) dead.delete(`${previewTile.x},${previewTile.y}`);
    return dead;
    // drawnTile и phase влияют на колоду/доску через стор, как в SVG-версии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, drawnTile, phase, previewTile]);

  const { valid, dead, conflicted } = useMemo(() => {
    const conflictedCells = new Set<string>();
    if (previewTile && showDeadCells) {
      for (const cell of filteredValid) if (allDead.has(cell)) conflictedCells.add(cell);
    }
    const validOnly = [...filteredValid].filter((cell) => !conflictedCells.has(cell));
    const deadOnly = showDeadCells ? [...allDead].filter((cell) => !conflictedCells.has(cell)) : [];
    return { valid: validOnly, dead: deadOnly, conflicted: [...conflictedCells] };
  }, [filteredValid, allDead, previewTile, showDeadCells]);

  const hoverKey = hoverCell ? `${hoverCell.x},${hoverCell.y}` : null;
  const hoverClickable = hoverKey !== null && (valid.includes(hoverKey) || conflicted.includes(hoverKey));

  return (
    <>
      <CellSet
        cells={dead}
        fillColor={DEAD_COLOR}
        fillOpacity={0.15}
        borderColor={DEAD_COLOR}
        borderOpacity={0.6}
        symbol="cross"
        symbolColor={DEAD_COLOR}
      />
      <CellSet
        cells={conflicted}
        fillColor={VALID_COLOR}
        fillOpacity={0.15}
        borderColor={VALID_COLOR}
        borderOpacity={0.6}
        symbol="cross"
        symbolColor={DEAD_COLOR}
      />
      <CellSet
        cells={valid}
        fillColor={VALID_COLOR}
        fillOpacity={0.15}
        borderColor={VALID_COLOR}
        borderOpacity={0.6}
        symbol="plus"
        symbolColor={VALID_COLOR}
      />

      {hoverClickable && hoverCell && (
        <group position={[hoverCell.x * TILE_SIZE, 0, hoverCell.y * TILE_SIZE]}>
          <FlatSquare size={TILE_SIZE - CELL_INSET * 2} color={VALID_COLOR} opacity={0.18} y={0.45} />
          <FrameOutline size={TILE_SIZE - CELL_INSET * 2} thickness={3} color={VALID_COLOR} opacity={0.95} y={0.5} />
        </group>
      )}
    </>
  );
});
CellsLayer3D.displayName = 'CellsLayer3D';
