// renderer/Board.tsx
import { useEffect } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Tile } from './Tile';
import { RegionOverlay } from './RegionOverlay';
import { MeepleSelectionLayer } from './MeepleSelectionLayer';
import { MeepleLayer } from './MeepleLayer';
import { CompletionOverlay } from './CompletionOverlay';
import { CellsOverlay } from './CellsOverlay';
import { DebugOverlay } from './DebugOverlay';
import { useBoardCamera } from '@/hooks/useBoardCamera';
import { useRegionPatterns } from '@/hooks/useRegionPatterns';
import { TILE_SIZE, WORLD_BOUNDS } from '@carcassonne/shared/core/constants'

type BoardProps = {
  onGridClick: (x: number, y: number) => void;
  validCells: Set<string>;
};

export const Board = ({ onGridClick, validCells }: BoardProps) => {
  const board = useGameStore(s => s.board);
  const setDebugSelectedTile = useGameStore(s => s.setDebugSelectedTile);
  const previewTile = useGameStore(s => s.previewTile);
  const previewRegionManager = useGameStore(s => s.previewRegionManager);
  const rotatePreview = useGameStore(s => s.rotatePreview);
  const lastPlacedTiles = useGameStore(s => s.lastPlacedTiles);
  const phase = useGameStore(s => s.phase);

  const placementAnimation = useGameStore(s => s.placementAnimation);
  const setPlacementAnimation = useGameStore(s => s.setPlacementAnimation);

  // 🌟 Очистка анимации после завершения
  useEffect(() => {
    if (!placementAnimation) return;

    const ANIMATION_DURATION = 700;  // Максимальная длительность

    const timer = setTimeout(() => {
      setPlacementAnimation(null);
      console.log(`🎬 [Board] Анимация установки завершена`);
    }, ANIMATION_DURATION);

    return () => clearTimeout(timer);
  }, [placementAnimation, setPlacementAnimation]);

  /* ============================================
  * 📷 КАМЕРА
  * ============================================ */
  const {
    camera,
    transform,
    svgRef,

    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    screenToWorld,
  } = useBoardCamera();


  // ============================================
  // 🖱️ Обработчики кликов
  // ============================================
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const { x: gridX, y: gridY } = screenToWorld(e.clientX, e.clientY);
    onGridClick(gridX, gridY);
  };

  const handleDebugClick = (e: React.MouseEvent, x: number, y: number) => {
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setDebugSelectedTile({ x, y });
      console.log(`🐛 [Board] Дебаг для тайла (${x}, ${y})`);
    }
  };

  const handleSvgMainClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      const { x: gridX, y: gridY } = screenToWorld(e.clientX, e.clientY);
      setDebugSelectedTile({ x: gridX, y: gridY });
    } else {
      handleSvgClick(e);
    }
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log(`🔄 [Board] Клик на preview-тайл → поворот`);
    rotatePreview();
  };

  const uniqueColorCombinations = useRegionPatterns();
  const isBoardLocked = phase === 'endTurn';

  return (
    <svg
      ref={svgRef}
      width="100vw"
      height="100vh"
      onClick={handleSvgMainClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="board-svg"
      style={{
        cursor: camera.isDragging ? 'grabbing' : 'default',
        userSelect: 'none',
        pointerEvents: isBoardLocked ? 'none' : 'auto',
      }}
    >
      <defs>
        <pattern id="grid" width={TILE_SIZE} height={TILE_SIZE} patternUnits="userSpaceOnUse">
          <path d={`M ${TILE_SIZE} 0 L 0 0 0 ${TILE_SIZE}`} fill="none" stroke="#2a2a2a" strokeWidth="1" />
        </pattern>

        {/* 🌟 ГЛОБАЛЬНЫЕ ПАТТЕРНЫ ДЛЯ ШТРИХОВКИ РЕГИОНОВ */}
        {uniqueColorCombinations.map((combo) => {
          const colors = combo.includes('|') ? combo.split('|') : [combo];
          const segmentWidth = 5;
          const patternWidth = segmentWidth * 2 * colors.length;
          const patternId = `hatch-${combo.replace(/#/g, '').replace(/\|/g, '-')}`;

          const SPEED_PX_PER_SEC = 1;
          const duration = patternWidth / SPEED_PX_PER_SEC;

          return (
            <pattern
              key={patternId}
              id={patternId}
              patternUnits="userSpaceOnUse"
              width={patternWidth}
              height="10"
              patternTransform="rotate(45)"
            >
              {colors.map((color, idx) => (
                <rect
                  key={idx}
                  x={idx * segmentWidth * 2}
                  y="0"
                  width={segmentWidth}
                  height="10"
                  fill={color}
                />
              ))}

              <animate
                attributeName="x"
                from="0"
                to={patternWidth}
                dur={`${duration}s`}
                repeatCount="indefinite"
              />
            </pattern>
          );
        })}
      </defs>

      {/* 🌟 ГРУППА С КАМЕРОЙ — всё содержимое доски */}
      <g
        className={`board-camera-group ${camera.isDragging ? 'dragging' : ''}`}
        transform={transform}
      >
        {/* СЛОЙ 0: ФОН */}
        <rect
          x={WORLD_BOUNDS.minX * TILE_SIZE}
          y={WORLD_BOUNDS.minY * TILE_SIZE}
          width={(WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 1) * TILE_SIZE}
          height={(WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY + 1) * TILE_SIZE}
          fill="url(#grid)"
          stroke="#ff0000"
          strokeWidth="4"
          strokeDasharray="20 10"
          strokeOpacity="0.3"
          pointerEvents="none"
        />
        <line
          x1={WORLD_BOUNDS.minX * TILE_SIZE}
          y1="0"
          x2={(WORLD_BOUNDS.maxX + 1) * TILE_SIZE}
          y2="0"
          className="axis-line"
          pointerEvents="none"
        />
        <line
          x1="0"
          y1={WORLD_BOUNDS.minY * TILE_SIZE}
          x2="0"
          y2={(WORLD_BOUNDS.maxY + 1) * TILE_SIZE}
          className="axis-line"
          pointerEvents="none"
        />

        {/* 🟢💀 СЛОЙ 1: СЛОЙ КЛЕТОК (ВАЛИДНЫЕ И МЕРТВЫЕ) */}
        <CellsOverlay onGridClick={onGridClick} validCells={validCells} />

        {/* 🎨 СЛОЙ 2: ТАЙЛЫ (только графика) */}
        {Array.from(board.values()).map((t) => {
          const key = `${t.x},${t.y}`;

          // 🌟 НОВОЕ: Проверяем, анимируется ли этот тайл
          const isAnimatingTile = placementAnimation?.tile &&
            placementAnimation.tile.x === t.x &&
            placementAnimation.tile.y === t.y;

          return (
            <g
              key={key}
              transform={`translate(${t.x * TILE_SIZE}, ${t.y * TILE_SIZE})`}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) handleDebugClick(e, t.x, t.y);
              }}
              style={{ cursor: 'pointer', overflow: 'visible' }}
            >
              {/* 🌟 НОВОЕ: Обёртка для анимации */}
              <g className={isAnimatingTile ? 'tile-placement-animation' : ''}>
                <g transform={`rotate(${t.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`} style={{ overflow: 'visible' }}>
                <Tile
                    id={t.templateId as any}
                    size={TILE_SIZE}
                    features={t.features}
                    rotation={t.rotation}
                  />
                </g>
              </g>
            </g>
          );
        })}

        {/* 🌟 СЛОЙ 3: ПРИМЕРКА ТАЙЛА */}
        {previewTile && (
          <g
            className="preview-tile"
            // 🌟 НОВОЕ: key привязан к координатам
            // При перемещении на новую клетку элемент пересоздаётся,
            // и анимация не запускается с накопленного угла
            key={`${previewTile.x},${previewTile.y}`}
            transform={`translate(${previewTile.x * TILE_SIZE}, ${previewTile.y * TILE_SIZE})`}
            onClick={handlePreviewClick}
            style={{ cursor: 'pointer', overflow: 'visible' }}
          >
            <g
              className="preview-tile-rotating"
              style={{
                transform: `rotate(${previewTile.displayRotation}deg)`,
                transformOrigin: `${TILE_SIZE / 2}px ${TILE_SIZE / 2}px`,
              }}
            >
            <Tile
                id={previewTile.tile.id as any}
                size={TILE_SIZE}
                features={previewTile.tile.features}
                rotation={previewTile.rotation}
            />
            </g>
            <rect
              className="preview-tile-overlay"
              x={0}
              y={0}
              width={TILE_SIZE}
              height={TILE_SIZE}
            />
          </g>
        )}

        {/* 🎨 СЛОЙ 4: ПОДСВЕТКА РЕГИОНОВ */}
        <RegionOverlay regionManagerOverride={previewRegionManager || undefined} />
        <CompletionOverlay />

        {/* 🌟 СЛОЙ 5: ПОДСВЕТКА ПОСЛЕДНИХ ТАЙЛОВ ВСЕХ ИГРОКОВ + Debug */}
        {Array.from(lastPlacedTiles.entries()).map(([playerId, tile]) => (
          <g
            key={`last-${playerId}`}
            className="last-placed-tile"
            transform={`translate(${tile.x * TILE_SIZE}, ${tile.y * TILE_SIZE})`}
            pointerEvents="none"
          >
            <rect
              className="last-placed-tile-glow"
              x={4}
              y={4}
              width={TILE_SIZE - 8}
              height={TILE_SIZE - 8}
              style={{ stroke: tile.color }}
            />
            <rect
              className="last-placed-tile-border"
              x={1.5}
              y={1.5}
              width={TILE_SIZE - 3}
              height={TILE_SIZE - 3}
              style={{ stroke: tile.color }}
            />
          </g>
        ))}
        <DebugOverlay />

        {/* 🎨 СЛОЙ 6: СПОТЫ ДЛЯ РАЗМЕЩЕНИЯ МИПЛОВ */}
        <MeepleSelectionLayer />

        {/* 🎨 СЛОЙ 7: РАЗМЕЩЁННЫЕ МИПЛЫ ПОВЕРХ ВСЕГО */}
        <MeepleLayer />
      </g>
    </svg>
  );
};