// renderer/CellsOverlay.tsx
import { memo, useMemo, useCallback } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { findDeadCells, rotateFeatures, getTileSides } from '@fiefdom/shared/core/tileUtils';
import type { PlacedTile } from '@fiefdom/shared/core/types';
import { TILE_SIZE } from '@fiefdom/shared/core/constants';
import { getVirtualDeck } from '@/core/deckUtils';

interface CellsOverlayProps {
  onGridClick: (x: number, y: number) => void;
  validCells: Set<string>;
}

/**
 * 🟢💀 Слой клеток: валидные (зелёные), мёртвые (красные), конфликтные (жёлтые).
 * Мемоизирован — перерендеривается при изменении board/previewTile/showDeadCells.
 *
 * 🌟 ОПТИМИЗАЦИЯ КЛИКОВ:
 * Вместо анонимной функции на каждой клетке используем ОДИН общий
 * обработчик `handleCellClick` + data-атрибуты для координат.
 * Это убирает создание десятков замыканий на каждый рендер.
 */
export const CellsOverlay = memo(({ onGridClick, validCells }: CellsOverlayProps) => {
  const board = useGameStore(s => s.board);
  const drawnTile = useGameStore(s => s.drawnTile);
  const phase = useGameStore(s => s.phase);
  const showDeadCells = useGameStore(s => s.showDeadCells);
  const previewTile = useGameStore(s => s.previewTile);

  // ============================================
  // 🌟 ЕДИНЫЙ ОБРАБОТЧИК КЛИКА ДЛЯ ВСЕХ КЛЕТОК
  // ============================================
  /**
   * Читает координаты из data-атрибутов элемента.
   * Стабильная ссылка — создаётся один раз (пока не сменится onGridClick).
   */
  const handleCellClick = useCallback((e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    const x = Number(e.currentTarget.dataset.x);
    const y = Number(e.currentTarget.dataset.y);
    console.log(`🖱️ [CellsOverlay] Клик по клетке (${x}, ${y})`);
    onGridClick(x, y);
  }, [onGridClick]);

  // ============================================
  // 🟢 Валидные клетки БЕЗ позиции preview-тайла
  // ============================================
  const filteredValidCells = useMemo(() => {
    if (!previewTile) return validCells;
    const filtered = new Set(validCells);
    filtered.delete(`${previewTile.x},${previewTile.y}`);
    return filtered;
  }, [validCells, previewTile]);

  // ============================================
  // 💀 Мёртвые клетки с учётом preview-тайла
  // ============================================
  const allDeadCells = useMemo(() => {
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

    const availableDeck = getVirtualDeck(boardToCheck);
    const dead = findDeadCells(boardToCheck, availableDeck);

    if (previewTile) {
      dead.delete(`${previewTile.x},${previewTile.y}`);
    }

    return dead;
  }, [board, drawnTile, phase, previewTile]);

  // ============================================
  // 🟡🟢💀 Разделение на три типа клеток
  // ============================================
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

    // 🟢 Чистые валидные
    for (const cell of filteredValidCells) {
      if (!conflicted.has(cell)) {
        pureValid.add(cell);
      }
    }

    // 💀 Чистые мёртвые
    if (showDeadCells) {
      for (const cell of allDeadCells) {
        if (!conflicted.has(cell)) {
          pureDead.add(cell);
        }
      }
    }

    console.log(
      `🟢 [CellsOverlay] Клетки: ` +
      `валидные=${pureValid.size}, мёртвые=${pureDead.size}, конфликтные=${conflicted.size}`
    );

    return {
      pureValidCells: pureValid,
      pureDeadCells: pureDead,
      conflictedCells: conflicted,
    };
  }, [filteredValidCells, allDeadCells, previewTile, showDeadCells]);

  return (
    <g className="cells-overlay" pointerEvents="none">

      {/* ============================================
          💀 МЁРТВЫЕ КЛЕТКИ — рендерим первыми (под валидными)
          Не кликабельны — pointer-events: none из CSS
          ============================================ */}
      {Array.from(pureDeadCells).map((cellKey) => {
        const [x, y] = cellKey.split(',').map(Number);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const cx = px + TILE_SIZE / 2;
        const cy = py + TILE_SIZE / 2;
        const crossSize = 15;

        return (
          <g key={`dead-${cellKey}`} className="dead-cell-container">
            <rect
              className="dead-cell"
              x={px + 2}
              y={py + 2}
              width={TILE_SIZE - 4}
              height={TILE_SIZE - 4}
            />
            <g className="dead-cell-cross">
              <line x1={cx - crossSize} y1={cy} x2={cx + crossSize} y2={cy} />
              <line x1={cx} y1={cy - crossSize} x2={cx} y2={cy + crossSize} />
            </g>
          </g>
        );
      })}

      {/* ============================================
          🟡 КОНФЛИКТНЫЕ КЛЕТКИ — белая заливка + красный крестик
          🌟 Клик через ЕДИНЫЙ обработчик + data-атрибуты
          ============================================ */}
      {Array.from(conflictedCells).map((cellKey) => {
        const [x, y] = cellKey.split(',').map(Number);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const cx = px + TILE_SIZE / 2;
        const cy = py + TILE_SIZE / 2;
        const crossSize = 15;

        return (
          <g
            key={`conflicted-${cellKey}`}
            className="conflicted-cell-container"
            data-x={x}
            data-y={y}
            onClick={handleCellClick}
          >
            <rect
              className="valid-cell"
              x={px + 2}
              y={py + 2}
              width={TILE_SIZE - 4}
              height={TILE_SIZE - 4}
            />
            <g className="dead-cell-cross">
              <line x1={cx - crossSize} y1={cy} x2={cx + crossSize} y2={cy} />
              <line x1={cx} y1={cy - crossSize} x2={cx} y2={cy + crossSize} />
            </g>
          </g>
        );
      })}

      {/* ============================================
          🟢 ВАЛИДНЫЕ КЛЕТКИ — рендерим поверх мёртвых
          🌟 Клик через ЕДИНЫЙ обработчик + data-атрибуты
          ============================================ */}
      {Array.from(pureValidCells).map((cellKey) => {
        const [x, y] = cellKey.split(',').map(Number);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const cx = px + TILE_SIZE / 2;
        const cy = py + TILE_SIZE / 2;
        const plusSize = 15;

        return (
          <g
            key={`valid-${cellKey}`}
            className="valid-cell-container"
            data-x={x}
            data-y={y}
            onClick={handleCellClick}
          >
            <rect
              className="valid-cell"
              x={px + 2}
              y={py + 2}
              width={TILE_SIZE - 4}
              height={TILE_SIZE - 4}
            />
            <g className="valid-cell-plus">
              <line x1={cx - plusSize} y1={cy} x2={cx + plusSize} y2={cy} />
              <line x1={cx} y1={cy - plusSize} x2={cx} y2={cy + plusSize} />
            </g>
          </g>
        );
      })}

    </g>
  );
});

CellsOverlay.displayName = 'CellsOverlay';