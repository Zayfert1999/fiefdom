// renderer/Board.tsx
import { useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { RegionOverlay } from './RegionOverlay';
import { MeepleSelectionLayer } from './MeepleSelectionLayer';
import { MeepleLayer } from './MeepleLayer';
import { CompletionOverlay } from './CompletionOverlay';
import { CellsOverlay } from './CellsOverlay';
import { DebugOverlay } from './DebugOverlay';
import { BoardDefs } from './BoardDefs';
import { BoardBackground } from './BoardBackground';
import { TilesLayer } from './TilesLayer';
import { PreviewTileLayer } from './PreviewTileLayer';
import { LastPlacedTilesLayer } from './LastPlacedTilesLayer';
import { useBoardCamera } from '@/hooks/useBoardCamera';

type BoardProps = {
  onGridClick: (x: number, y: number) => void;
  validCells: Set<string>;
};

export const Board = ({ onGridClick, validCells }: BoardProps) => {
  // 🌟 МИНИМАЛЬНЫЕ подписки — только то, что нужно самому Board
  const phase = useGameStore(s => s.phase);
  const setDebugSelectedTile = useGameStore(s => s.setDebugSelectedTile);
  const setPlacementAnimation = useGameStore(s => s.setPlacementAnimation);
  const placementAnimation = useGameStore(s => s.placementAnimation);

  // 📷 Камера
  const {
    camera,
    svgRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    screenToWorld,
  } = useBoardCamera();

  // 🌟 Ref для группы камеры — обновляем CSS-переменные без re-render слоёв
  const cameraLayerRef = useRef<SVGGElement>(null);

  // 🌟 Очистка анимации установки
  useEffect(() => {
    if (!placementAnimation) return;
    const timer = setTimeout(() => {
      setPlacementAnimation(null);
      console.log(`🎬 [Board] Анимация установки завершена`);
    }, 700);
    return () => clearTimeout(timer);
  }, [placementAnimation, setPlacementAnimation]);

  // 🌟 Обновляем CSS-переменные камеры через DOM (не триггерит re-render слоёв)
  useEffect(() => {
    const el = cameraLayerRef.current;
    if (!el) return;
    el.style.setProperty('--cam-x', `${camera.x}px`);
    el.style.setProperty('--cam-y', `${camera.y}px`);
    el.style.setProperty('--cam-zoom', `${camera.zoom}`);
  }, [camera.x, camera.y, camera.zoom]);

  // 🌟 Обновляем CSS-классы камеры через DOM
  useEffect(() => {
    const el = cameraLayerRef.current;
    if (!el) return;
    el.classList.toggle('dragging', camera.isDragging);
    el.classList.toggle('animating', camera.isAnimating);
    el.style.willChange = camera.isDragging || camera.isAnimating ? 'transform' : 'auto';
  }, [camera.isDragging, camera.isAnimating]);

  // ============================================
  // 🖱️ Обработчики кликов
  // ============================================
  const handleDebugClick = useCallback((x: number, y: number) => {
    setDebugSelectedTile({ x, y });
    console.log(`🐛 [Board] Дебаг для тайла (${x}, ${y})`);
  }, [setDebugSelectedTile]);

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const { x: gridX, y: gridY } = screenToWorld(e.clientX, e.clientY);
    onGridClick(gridX, gridY);
  }, [screenToWorld, onGridClick]);

  const handleSvgMainClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      const { x: gridX, y: gridY } = screenToWorld(e.clientX, e.clientY);
      setDebugSelectedTile({ x: gridX, y: gridY });
    } else {
      handleSvgClick(e);
    }
  }, [screenToWorld, setDebugSelectedTile, handleSvgClick]);

  const handlePreviewRotate = useCallback(() => {
    useGameStore.getState().rotatePreview();
  }, []);

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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="board-svg"
      style={{
        cursor: camera.isDragging ? 'grabbing' : 'default',
        userSelect: 'none',
        pointerEvents: isBoardLocked ? 'none' : 'auto',
        touchAction: 'none',
      }}
    >
      {/* 🎨 DEFS — паттерны штриховки (сам читает useRegionPatterns) */}
      <BoardDefs />

      {/* 📷 ГРУППА С КАМЕРОЙ */}
      <g
        ref={cameraLayerRef}
        className="board-camera-group"
        style={{
          transform: 'translate(var(--cam-x, 0px), var(--cam-y, 0px)) scale(var(--cam-zoom, 1))',
          transformOrigin: '0 0',
        }}
      >
        {/* СЛОЙ 0: ФОН — статический, memo */}
        <BoardBackground />

        {/* СЛОЙ 1: КЛЕТКИ — memo, принимает onGridClick + validCells */}
        <CellsOverlay onGridClick={onGridClick} validCells={validCells} />

        {/* СЛОЙ 2: ТАЙЛЫ — memo, сам читает board из store */}
        <TilesLayer onDebugClick={handleDebugClick} />

        {/* СЛОЙ 3: ПРИМЕРКА — memo, сам читает previewTile из store */}
        <PreviewTileLayer onRotate={handlePreviewRotate} />

        {/* СЛОЙ 4: ПОДСВЕТКА РЕГИОНОВ — memo, сам читает из store */}
        <RegionOverlay />
        <CompletionOverlay />

        {/* СЛОЙ 5: ПОСЛЕДНИЕ ТАЙЛЫ + DEBUG — memo */}
        <LastPlacedTilesLayer />
        <DebugOverlay />

        {/* СЛОЙ 6: СПОТЫ МИПЛОВ — memo */}
        <MeepleSelectionLayer />

        {/* СЛОЙ 7: МИПЛЫ — memo */}
        <MeepleLayer />
      </g>
    </svg>
  );
};