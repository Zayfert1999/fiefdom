// renderer/Board.tsx
import { useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Tile, type FeatureHighlight } from './Tile';
import { rotateFeatures, isValidPlacement } from '@/core/tileUtils';
import { MeepleSelection } from './MeepleSelection';
import { TILE_DEFINITIONS } from '@/core/tileData';

const TILE_SIZE = 100;

type BoardProps = {
  onGridClick: (x: number, y: number) => void;
};

export const Board = ({ onGridClick }: BoardProps) => {
  const board = useGameStore(s => s.board);
  const drawnTile = useGameStore(s => s.drawnTile);
  const phase = useGameStore(s => s.phase);
  const currentPlayer = useGameStore(s => s.players[s.currentTurn]);
  const lastTileKey = Array.from(board.keys()).pop();
  const showRegions = useGameStore(s => s.showRegions);
  const regionManager = useGameStore(s => s.regionManager);
  const players = useGameStore(s => s.players);

  const debugSelectedTile = useGameStore(s => s.debugSelectedTile);
  const setDebugSelectedTile = useGameStore(s => s.setDebugSelectedTile);

  // 🌟 ДИНАМИЧЕСКИЙ VIEWBOX: автоматически подстраивается под границы доски
  const viewBox = useMemo(() => {
    if (board.size === 0) return '-150 -150 300 300'; // Дефолт для пустой доски

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const tile of board.values()) {
      if (tile.x < minX) minX = tile.x;
      if (tile.x > maxX) maxX = tile.x;
      if (tile.y < minY) minY = tile.y;
      if (tile.y > maxY) maxY = tile.y;
    }

    const padding = 2; // Отступ в 2 тайла по краям
    const x = (minX - padding) * TILE_SIZE;
    const y = (minY - padding) * TILE_SIZE;
    const width = (maxX - minX + 1 + padding * 2) * TILE_SIZE;
    const height = (maxY - minY + 1 + padding * 2) * TILE_SIZE;

    return `${x} ${y} ${width} ${height}`;
  }, [board]);

  // 🟢 Расчёт валидных клеток (логика без изменений)
  const validCells = useMemo(() => {
    if (!drawnTile || phase !== 'placeTile') return new Set<string>();
    const validSet = new Set<string>();
    const directions = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

    for (const existing of board.values()) {
      for (const { dx, dy } of directions) {
        const nx = existing.x + dx;
        const ny = existing.y + dy;
        const cellKey = `${nx},${ny}`;
        if (board.has(cellKey)) continue;

        let isPlaceable = false;
        for (const rot of [0, 90, 180, 270] as const) {
          const rotatedFeatures = rotateFeatures(drawnTile.features, rot);
          if (isValidPlacement(board, nx, ny, rotatedFeatures)) {
            isPlaceable = true;
            break;
          }
        }
        if (isPlaceable) validSet.add(cellKey);
      }
    }
    return validSet;
  }, [drawnTile, board, phase]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    // 🎯 Получаем матрицу преобразования из координат viewBox в экранные координаты
    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    // Создаем точку в экранных координатах (клиентские координаты мыши)
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;

    // 🔄 Преобразуем в координаты viewBox с помощью ОБРАТНОЙ матрицы
    const pointInViewBox = svgPoint.matrixTransform(ctm.inverse());

    // 🎲 Конвертируем в координаты сетки
    const gridX = Math.floor(pointInViewBox.x / TILE_SIZE);
    const gridY = Math.floor(pointInViewBox.y / TILE_SIZE);

    // 🎯 Передаем координаты в обработчик
    onGridClick(gridX, gridY);
  };

  // 🐛 Обработчик дебаг-клика (Ctrl + клик)
  const handleDebugClick = (e: React.MouseEvent, x: number, y: number) => {
    // Проверяем, был ли нажат Control или Command (Mac)
    if (e.ctrlKey || e.metaKey) {
        e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал handleSvgClick
        setDebugSelectedTile({ x, y });
        console.log(`🐛 [Board] Вызван дебаг для тайла (${x}, ${y})`);
    }
    // Если клик был без Ctrl/Command, ничего не делаем.
    // Контекстное меню больше не вызывается.
  };

  // 🐛 Обработчик клика на уровне SVG (для дебага по Ctrl/Cmd + левый клик)
  const handleSvgMainClick = (e: React.MouseEvent<SVGSVGElement>) => {
     // Проверяем, был ли нажат Control или Command (Mac)
     if (e.ctrlKey || e.metaKey) {
        e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал handleSvgClick
        // Определяем координаты клика в системе координат доски (аналогично handleSvgClick)
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
        // Если не Ctrl/Cmd, передаём клик на обработку размещения тайла
        handleSvgClick(e);
     }
  };

  return (
    <svg
      viewBox={viewBox} // 🌟 Используем вычисляемый viewBox
      // 🐛 УБРАНО: onClick={handleSvgClick}, onContextMenu={handleContextMenu}
      // 🐛 ДОБАВЛЕНО: onClick={handleSvgMainClick} для обработки Ctrl/Cmd + клик
      onClick={handleSvgMainClick}
      // 🐛 УБРАНО: onContextMenu
      style={{ width: '100%', height: '100vh', background: '#1a1a1a', display: 'block', cursor: 'crosshair' }}
    >
      <defs>
        <pattern id="grid" width={TILE_SIZE} height={TILE_SIZE} patternUnits="userSpaceOnUse">
          <path d={`M ${TILE_SIZE} 0 L 0 0 0 ${TILE_SIZE}`} fill="none" stroke="#2a2a2a" strokeWidth="1" />
        </pattern>
        {/* 🌟 Паттерн для спорных регионов */}
        <pattern id="contested-pattern" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#f59e0b" strokeWidth="6" />
        </pattern>
      </defs>

      {/* Фон (рисуется чуть больше viewBox, чтобы не было пустых углов при скролле) */}
      <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" pointerEvents="none" />
      <line x1="-10000" y1="0" x2="10000" y2="0" stroke="#444" strokeWidth="2" pointerEvents="none" />
      <line x1="0" y1="-10000" x2="0" y2="10000" stroke="#444" strokeWidth="2" pointerEvents="none" />

      {Array.from(validCells).map(key => {
        const [x, y] = key.split(',').map(Number);
        return <rect key={key} x={x * TILE_SIZE} y={y * TILE_SIZE} width={TILE_SIZE} height={TILE_SIZE} fill="rgba(50, 205, 50, 0.3)" stroke="#32cd32" strokeWidth="2" pointerEvents="none" />;
      })}

      {Array.from(board.values()).map((t) => {
        const key = `${t.x},${t.y}`;
        const isLastTile = key === lastTileKey;
        const isDebugSelected = debugSelectedTile?.x === t.x && debugSelectedTile?.y === t.y;

        // 🌟 Собираем массив подсветок ДЛЯ КАЖДОЙ ФИЧИ ОТДЕЛЬНО
        const featureHighlights: FeatureHighlight[] = [];

        if (showRegions) {
          for (const feature of t.features) {
            const featureKey = `${t.x},${t.y}:${feature.id}`;
            const owners = regionManager.getFeatureOwners(featureKey);

            if (owners.length > 0) {
              const firstOwner = players.find(p => p.id === owners[0]);
              const color = firstOwner?.color || '#ffffff';

              featureHighlights.push({
                featureId: feature.id,
                color,
                isContested: owners.length > 1 // Если >1 владельца → спорная
              });
            }
          }
        }

        const baseTileDef = TILE_DEFINITIONS.find(def => def.id === t.templateId);
        const featuresForRendering = baseTileDef ? baseTileDef.features : t.features;

        // 🌟 Фильтруем фичи, оставляя только те, чей регион СВОБОДЕН
        const availableFeaturesForMeeple = featuresForRendering.filter(feature => {
          const featureKey = `${t.x},${t.y}:${feature.id}`;
          const owners = regionManager.getFeatureOwners(featureKey);
          // Разрешаем ставить мипла только если в регионе 0 владельцев
          return owners.length === 0;
        });

        return (
          <g
            key={key}
            transform={`translate(${t.x * TILE_SIZE}, ${t.y * TILE_SIZE})`}
            // 🐛 УБРАНО: onContextMenu={(e) => handleDebugClick(e, t.x, t.y)}
            // 🐛 ДОБАВЛЕНО: onClick={(e) => { if (e.ctrlKey || e.metaKey) handleDebugClick(e, t.x, t.y); }}
            onClick={(e) => {
              // Левый клик с Ctrl/Cmd вызывает дебаг
              if (e.ctrlKey || e.metaKey) handleDebugClick(e, t.x, t.y);
            }}
            style={{ cursor: 'pointer' }}
          >
            {isDebugSelected && (
              <rect x={0} y={0} width={TILE_SIZE} height={TILE_SIZE} fill="transparent" stroke="#ffff00" strokeWidth={4} pointerEvents="none" />
            )}

            <g transform={`rotate(${t.rotation}, ${TILE_SIZE / 2}, ${TILE_SIZE / 2})`}>
              {/* 🌟 Передаём изолированный массив подсветок */}
              <Tile
                id={t.templateId as any}
                size={TILE_SIZE}
                meeple={t.meeple}
                featureHighlights={featureHighlights}
              />

              {phase === 'placeMeeple' && isLastTile && !t.meeple && currentPlayer && availableFeaturesForMeeple.length > 0 && (
                <MeepleSelection
                  features={availableFeaturesForMeeple}
                  playerColor={currentPlayer.color}
                  onPlace={(fid, x, y) => {
                    console.log(`🖱️ [Board] Выбор спота: фича ${fid}, координаты (${x}, ${y})`);
                    useGameStore.getState().placeMeeple(fid, x, y);
                  }}
                />
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
};