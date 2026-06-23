// renderer/Board.tsx
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Tile } from './Tile';
import { rotateFeatures } from '@/core/tileUtils';
import { RegionOverlay } from './RegionOverlay';
import { MeepleSelectionLayer } from './MeepleSelectionLayer';
import { MeepleLayer } from './MeepleLayer';
import { CompletionOverlay } from './CompletionOverlay';
import { CellsOverlay } from './CellsOverlay';

const TILE_SIZE = 100;

type BoardProps = {
  onGridClick: (x: number, y: number) => void;
  validCells: Set<string>;
};

export const Board = ({ onGridClick, validCells }: BoardProps) => {
  const board = useGameStore(s => s.board);
  const regionManager = useGameStore(s => s.regionManager);
  const players = useGameStore(s => s.players);
  const debugSelectedTile = useGameStore(s => s.debugSelectedTile);
  const setDebugSelectedTile = useGameStore(s => s.setDebugSelectedTile);

  // 🌟 НОВОЕ: состояние примерки
  const previewTile = useGameStore(s => s.previewTile);
  const previewRegionManager = useGameStore(s => s.previewRegionManager);
  const rotatePreview = useGameStore(s => s.rotatePreview);

  // 🌟 ДИНАМИЧЕСКИЙ VIEWBOX
  const viewBox = useMemo(() => {
    if (board.size === 0) return '-150 -150 300 300';
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const tile of board.values()) {
      if (tile.x < minX) minX = tile.x;
      if (tile.x > maxX) maxX = tile.x;
      if (tile.y < minY) minY = tile.y;
      if (tile.y > maxY) maxY = tile.y;
    }

    // 🌟 Учитываем previewTile в границах
    if (previewTile) {
      if (previewTile.x < minX) minX = previewTile.x;
      if (previewTile.x > maxX) maxX = previewTile.x;
      if (previewTile.y < minY) minY = previewTile.y;
      if (previewTile.y > maxY) maxY = previewTile.y;
    }

    const padding = 2;
    const x = (minX - padding) * TILE_SIZE;
    const y = (minY - padding) * TILE_SIZE;
    const width = (maxX - minX + 1 + padding * 2) * TILE_SIZE;
    const height = (maxY - minY + 1 + padding * 2) * TILE_SIZE;

    return `${x} ${y} ${width} ${height}`;
  }, [board, previewTile]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;
    const pointInViewBox = svgPoint.matrixTransform(ctm.inverse());
    const gridX = Math.floor(pointInViewBox.x / TILE_SIZE);
    const gridY = Math.floor(pointInViewBox.y / TILE_SIZE);
    onGridClick(gridX, gridY);
  };

  const handleDebugClick = (e: React.MouseEvent, x: number, y: number) => {
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setDebugSelectedTile({ x, y });
      console.log(`🐛 [Board] Вызван дебаг для тайла (${x}, ${y})`);
    }
  };

  const handleSvgMainClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      const svg = e.currentTarget;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = e.clientX;
      svgPoint.y = e.clientY;
      const pointInViewBox = svgPoint.matrixTransform(ctm.inverse());
      const gridX = Math.floor(pointInViewBox.x / TILE_SIZE);
      const gridY = Math.floor(pointInViewBox.y / TILE_SIZE);
      setDebugSelectedTile({ x: gridX, y: gridY });
      console.log(`🐛 [Board] Вызван дебаг для тайла (${gridX}, ${gridY}) по клику на SVG.`);
    } else {
      handleSvgClick(e);
    }
  };

    // 🌟 НОВОЕ: обработчик клика на preview-тайл (поворот)
  const handlePreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log(`🔄 [Board] Клик на preview-тайл → поворот`);
    rotatePreview();
  };

  // 🌟 Собираем уникальные комбинации цветов для глобальных паттернов
  const uniqueColorCombinations = useMemo(() => {
    const combinations = new Set<string>();

    // 🌟 Вспомогательная функция: обработка одной фичи
    const processFeature = (
      x: number,
      y: number,
      featureId: string,
      rm: typeof regionManager
    ) => {
      const featureKey = `${x},${y}:${featureId}`;
      const owners = rm.getFeatureOwners(featureKey);

      if (owners.length > 0) {
        const meta = rm.getMetadata(featureKey);
        if (!meta) return;

        const maxCount = Math.max(...owners.map(id => meta.meepleCounts.get(id) || 0));
        const dominantOwners = owners.filter(id => (meta.meepleCounts.get(id) || 0) === maxCount);

        if (dominantOwners.length === 1) {
          const player = players.find(p => p.id === dominantOwners[0]);
          if (player) combinations.add(player.color);
        } else {
          const colors = dominantOwners
            .map(id => players.find(p => p.id === id)?.color || '#ffffff')
            .sort()
            .join('|');
          combinations.add(colors);
        }
      }
    };

    // 🌟 Используем previewRegionManager если есть (он содержит объединённые регионы)
    const activeRM = previewRegionManager || regionManager;

    // 🌟 ШАГ 1: Обычные тайлы из board
    for (const tile of board.values()) {
      for (const feature of tile.features) {
        processFeature(tile.x, tile.y, feature.id, activeRM);
      }
    }

    // 🌟 ШАГ 2: Preview-тайл (если есть)
    if (previewTile && previewRegionManager) {
      const rotatedFeatures = rotateFeatures(previewTile.tile.features, previewTile.rotation);
      for (const feature of rotatedFeatures) {
        processFeature(previewTile.x, previewTile.y, feature.id, previewRegionManager);
      }
    }

    return Array.from(combinations);
  }, [board, regionManager, previewRegionManager, previewTile, players]);

  return (
    <svg
      viewBox={viewBox}
      onClick={handleSvgMainClick}
      className="board-svg"
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

          // 🌟 Константа скорости: 10px в секунду
          // Чем шире паттерн, тем дольше анимация → визуально одинаковая скорость
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
              
              {/* 🌟 АНИМАЦИЯ: длительность пропорциональна ширине паттерна */}
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

      {/* Фон */}
      <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" pointerEvents="none" />
      <line x1="-10000" y1="0" x2="10000" y2="0" className="axis-line" pointerEvents="none" />
      <line x1="0" y1="-10000" x2="0" y2="10000" className="axis-line" pointerEvents="none" />
      
      {/* 🟢💀 СЛОЙ 1: СЛОЙ КЛЕТОК (ВАЛИДНЫЕ И МЕРТВЫЕ) */}
      <CellsOverlay onGridClick={onGridClick} validCells={validCells} />

      {/* 🎨 СЛОЙ 2: ТАЙЛЫ (только графика) */}
      {Array.from(board.values()).map((t) => {
        const key = `${t.x},${t.y}`;
        const isDebugSelected = debugSelectedTile?.x === t.x && debugSelectedTile?.y === t.y;

        return (
          <g
            key={key}
            transform={`translate(${t.x * TILE_SIZE}, ${t.y * TILE_SIZE})`}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) handleDebugClick(e, t.x, t.y);
            }}
            style={{ cursor: 'pointer', overflow: 'visible' }}
          >
            {isDebugSelected && (
              <rect className="debug-selected" x={0} y={0} width={TILE_SIZE} height={TILE_SIZE} />
            )}

            <g transform={`rotate(${t.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`} style={{ overflow: 'visible' }}>
              {/* 🌟 Tile принимает только id и size — миплы и споты в отдельных слоях */}
              <Tile
                id={t.templateId as any}
                size={TILE_SIZE}
              />
            </g>
          </g>
        );
      })}

      {/* 🌟 СЛОЙ 3: ПРИМЕРКА ТАЙЛА */}
      {previewTile && (
        <g
          className="preview-tile"
          transform={`translate(${previewTile.x * TILE_SIZE}, ${previewTile.y * TILE_SIZE})`}
          onClick={handlePreviewClick}
          style={{ cursor: 'pointer', overflow: 'visible' }}
        >
          {/* Поворот содержимого */}
          <g transform={`rotate(${previewTile.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`}>
            <Tile
              id={previewTile.tile.id as any}
              size={TILE_SIZE}
            />
          </g>
          
          {/* Полупрозрачный оверлей с пунктирной рамкой */}
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

      {/* 🎨 СЛОЙ 5: СПОТЫ ДЛЯ РАЗМЕЩЕНИЯ МИПЛОВ */}
      <MeepleSelectionLayer />

      {/* 🎨 СЛОЙ 6: РАЗМЕЩЁННЫЕ МИПЛЫ ПОВЕРХ ВСЕГО */}
      <MeepleLayer />
    </svg>
  );
};