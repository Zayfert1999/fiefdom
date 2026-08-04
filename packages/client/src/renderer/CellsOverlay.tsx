// renderer/CellsOverlay.tsx
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { findDeadCells } from '@/core/tileUtils';
import { rotateFeatures, getTileSides } from '@/core/tileUtils';
import type { PlacedTile } from '@/core/types';
import {TILE_SIZE} from '@/core/constants'


interface CellsOverlayProps {
  onGridClick: (x: number, y: number) => void;
  validCells: Set<string>;
}

export const CellsOverlay = ({ onGridClick, validCells }: CellsOverlayProps) => {
  const board = useGameStore(s => s.board);
  const deck = useGameStore(s => s.deck);
  const drawnTile = useGameStore(s => s.drawnTile);
  const phase = useGameStore(s => s.phase);
  const showDeadCells = useGameStore(s => s.showDeadCells);
  const previewTile = useGameStore(s => s.previewTile);

  // Валидные клетки БЕЗ позиции preview-тайла
  const filteredValidCells = useMemo(() => {
    if (!previewTile) return validCells;
    
    const filtered = new Set(validCells);
    filtered.delete(`${previewTile.x},${previewTile.y}`);
    return filtered;
  }, [validCells, previewTile]);
  
  // 💀 Мёртвые клетки с учётом preview-тайла
  const allDeadCells = useMemo(() => {
    
    // 🌟 ЛОГИКА:
    // - Если НЕТ previewTile → drawnTile в руке → доступен → добавляем в колоду
    // - Если ЕСТЬ previewTile → drawnTile виртуально поставлен → занят → НЕ добавляем
    const availableDeck = previewTile ? deck : (drawnTile ? [...deck, drawnTile] : deck);
    
    // 🌟 Создаём виртуальный board с preview-тайлом (если есть)
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
            derivedSides: getTileSides({ ...previewTile.tile, features: rotatedFeatures }),
        };
      
        virtualBoard.set(`${previewTile.x},${previewTile.y}`, virtualTile);
        boardToCheck = virtualBoard;
    }
    
    const dead = findDeadCells(boardToCheck, availableDeck);
    
    // 🌟 Исключаем саму клетку preview-тайла из мёртвых (она занята, а не мёртвая)
    if (previewTile) {
      dead.delete(`${previewTile.x},${previewTile.y}`);
    }
    
    return dead;
  }, [board, deck, drawnTile, phase, showDeadCells, previewTile]);

  // 🌟 ОДИН useMemo для всех трёх типов клеток
  const { pureValidCells, pureDeadCells, conflictedCells } = useMemo(() => {
    const conflicted = new Set<string>();
    const pureValid = new Set<string>();
    const pureDead = new Set<string>();

    // 🟡 Конфликтные: валидные сейчас, но станут мёртвыми после preview
    if (previewTile && showDeadCells) {
      for (const cell of filteredValidCells) {
        if (allDeadCells.has(cell)) {
          conflicted.add(cell);
        }
      }
    }

    // 🟢 Чистые валидные (не конфликтные)
    for (const cell of filteredValidCells) {
      if (!conflicted.has(cell)) {
        
        pureValid.add(cell);
      }
    }

    // 💀 Чистые мёртвые (не конфликтные)
    if (showDeadCells) {
      for (const cell of allDeadCells) {
        if (!conflicted.has(cell)) {
          pureDead.add(cell);
        }
      }
    }

    return {
      pureValidCells: pureValid,
      pureDeadCells: pureDead,
      conflictedCells: conflicted,
    };
  }, [filteredValidCells, allDeadCells, previewTile, showDeadCells]);

  return (
    <g className="cells-overlay" pointerEvents="none">
      {/* 💀 МЁРТВЫЕ КЛЕТКИ — рендерим первыми (под валидными) */}
      {Array.from(pureDeadCells).map((cellKey) => {
        const [x, y] = cellKey.split(',').map(Number);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const cx = px + TILE_SIZE / 2;
        const cy = py + TILE_SIZE / 2;
        const crossSize = 15;

        return (
          <g key={`dead-${cellKey}`} className="dead-cell-container">         
            {/* Красная пунктирная рамка */}
            <rect
              className="dead-cell"
              x={px + 2}
              y={py + 2}
              width={TILE_SIZE - 4}
              height={TILE_SIZE - 4}
            />
            {/* Крестик в центре */}
            <g className="dead-cell-cross">
              <line
                x1={cx - crossSize} 
                y1={cy} 
                x2={cx + crossSize} 
                y2={cy} 
              />
              <line
                x1={cx} 
                y1={cy - crossSize} 
                x2={cx} 
                y2={cy + crossSize}
              />
            </g>
          </g>
        );
      })}

      {/* 🟡 КОНФЛИКТНЫЕ КЛЕТКИ — белая заливка + красный крестик */}
      {Array.from(conflictedCells).map(key => {
        const [x, y] = key.split(',').map(Number);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const cx = px + TILE_SIZE / 2;
        const cy = py + TILE_SIZE / 2;
        const crossSize = 15;

        return (
          <g
            key={`conflicted-${key}`}
            className="conflicted-cell-container"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              onGridClick(x, y);
            }}
          >
            {/* 🌟 Заливка и рамка валидной клетки) */}
            <rect 
              className="valid-cell" 
              x={px+2} 
              y={py+2} 
              width={TILE_SIZE-4} 
              height={TILE_SIZE-4} 
            />
            {/* 🌟 Крестик мёртвой клетки */}
            <g className="dead-cell-cross">
              <line
                x1={cx - crossSize} 
                y1={cy} 
                x2={cx + crossSize} 
                y2={cy} 
              />
              <line
                x1={cx} 
                y1={cy - crossSize} 
                x2={cx} 
                y2={cy + crossSize}
              />
            </g>
          </g>
        );
      })}

      {/* 🟢 ВАЛИДНЫЕ КЛЕТКИ — рендерим поверх мёртвых */}
      {Array.from(pureValidCells).map(key => {
        const [x, y] = key.split(',').map(Number);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const cx = px + TILE_SIZE / 2;
        const cy = py + TILE_SIZE / 2;
        const plusSize = 15;

        return (
          <g
            key={`valid-${key}`}
            className="valid-cell-container"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              onGridClick(x, y);
            }}
          >

            <rect
                className="valid-cell"
                x={px+2}
                y={py+2}
                width={TILE_SIZE - 4}
                height={TILE_SIZE - 4}
            />
            <g className="valid-cell-plus">
              <line 
                x1={cx - plusSize} 
                y1={cy} 
                x2={cx + plusSize} 
                y2={cy} 
              />
              <line 
                x1={cx} 
                y1={cy - plusSize} 
                x2={cx} 
                y2={cy + plusSize} 
              />
            </g>
          </g>
        );
      })}
    </g>
  );
};