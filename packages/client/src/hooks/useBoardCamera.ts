// hooks/useBoardCamera.ts
import { useEffect, useRef} from 'react';
import { useGameStore } from '@/state/useGameStore';
import { useCamera } from './useCamera';
import { useHotkeys } from './useHotkeys';
import { CAMERA_CONFIG} from '@carcassonne/shared/core/constants';
import type { CompletedRegion } from '@carcassonne/shared/core/scoring';
import { HOTKEY_DEFINITIONS } from '@carcassonne/shared/core/hotkeys';

// 🌟 Хелпер: геометрический центр региона
const getRegionCenter = (region: CompletedRegion): { x: number; y: number } => {
  let sumX = 0, sumY = 0, count = 0;
  for (const featureKey of region.featureKeys) {
    const [coords] = featureKey.split(':');
    const [x, y] = coords.split(',').map(Number);
    sumX += x;
    sumY += y;
    count++;
  }
  return { x: sumX / count, y: sumY / count };
};

/**
 * 🌟 Хук, объединяющий всю логику камеры для доски:
 * - Инициализация useCamera
 * - Центрирование при старте
 * - Анимации при preview / placeMeeple / completionAnimations
 * - Wheel-обработчик (с passive: false)
 * - Хоткеи камеры (+, -, 0, стрелки)
 * - Обработчики drag мыши
 */
export const useBoardCamera = () => {
  // 🌟 Ref для SVG (нужен и внутри хука для wheel, и снаружи для рендеринга)
  const svgRef = useRef<SVGSVGElement>(null);

  // 🌟 Подписки на store
  const board = useGameStore(s => s.board);
  const previewTile = useGameStore(s => s.previewTile);
  const phase = useGameStore(s => s.phase);
  const completionAnimations = useGameStore(s => s.completionAnimations);

  // 🌟 Базовая логика камеры
  const cameraApi = useCamera();
  const {
    camera,
    transform,
    centerOn,
    centerOnLastTile,
    zoomToTile,
    restoreZoom,
    resetAndCenter,
    zoomIn,
    zoomOut,
    zoomAtPoint,
    startDrag,
    drag,
    endDrag,
    pan,
    screenToWorld,
  } = cameraApi;


  // ============================================
  // 🎬 АНИМАЦИЯ 0: Центрирование на последнем тайле при старте
  // ============================================
  useEffect(() => {
    if (board.size > 0) {
      centerOnLastTile(board);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // 🎬 АНИМАЦИЯ 1: Центрирование при появлении/смене previewTile
  // ============================================
  const prevPreviewRef = useRef(previewTile);
  useEffect(() => {
    const prev = prevPreviewRef.current;
    const curr = previewTile;

    const isNew = prev === null && curr !== null;
    const isMoved = prev !== null && curr !== null && (
      prev.x !== curr.x || prev.y !== curr.y
    );

    if ((isNew || isMoved) && curr) {
      centerOn(curr.x, curr.y);
      console.log(`🎯 [Camera] Центрирование на preview (${curr.x}, ${curr.y})`);
    }

    prevPreviewRef.current = curr;
  }, [previewTile, centerOn]);

  // ============================================
  // 🎬 АНИМАЦИЯ 2: Приближение при placeMeeple
  // 🎬 АНИМАЦИЯ 3: Восстановление при startTurn
  // ============================================
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;

    if (prevPhase !== phase) {
      if (phase === 'placeMeeple' && board.size > 0) {
        const tiles = Array.from(board.values());
        const lastTile = tiles[tiles.length - 1];
        zoomToTile(lastTile.x, lastTile.y, CAMERA_CONFIG.MAX_ZOOM);
        console.log(`🔍 [Camera] Приближение к миплу: zoom → ${CAMERA_CONFIG.MAX_ZOOM}`);
      }

      if (phase === 'startTurn' && prevPhase === 'placeMeeple') {
        restoreZoom(board);
        console.log(`🔭 [Camera] Восстановление исходного масштаба`);
      }
    }

    prevPhaseRef.current = phase;
  }, [phase, board, zoomToTile, restoreZoom]);

  // ============================================
  // 🎬 АНИМАЦИЯ 2: Завершение региона
  // 🌟 ТОЛЬКО ЦЕНТРИРОВАНИЕ, БЕЗ ЗУМА
  // ============================================
  const prevAnimCountRef = useRef(0);

  useEffect(() => {
    const prevCount = prevAnimCountRef.current;
    const currCount = completionAnimations.length;

    // 🎬 Анимация ПОЯВИЛАСЬ
    if (prevCount === 0 && currCount > 0) {
      const animation = completionAnimations[currCount - 1];
      const center = getRegionCenter(animation.region);

      // 🌟 Просто центрируемся на регионе, не меняя zoom
      centerOn(center.x, center.y);
      console.log(`🎯 [Camera] Центрирование на регионе: (${center.x.toFixed(1)}, ${center.y.toFixed(1)})`);

      prevAnimCountRef.current = currCount;
    }

    prevAnimCountRef.current = currCount;
  }, [completionAnimations, centerOn]);

  // ============================================
  // 🖱️ Wheel-обработчик (с passive: false)
  // ============================================
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAtPoint(e.deltaY, e.clientX, e.clientY);
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [zoomAtPoint]);

  // ============================================
  // ⌨️ Хоткеи камеры
  // ============================================
  const isGameLocked = phase === 'endTurn';
  
  useHotkeys([
    { ...HOTKEY_DEFINITIONS.ZOOM_IN, action: zoomIn, enabled: !isGameLocked },
    { ...HOTKEY_DEFINITIONS.ZOOM_IN_ALT, action: zoomIn, enabled: !isGameLocked },
    { ...HOTKEY_DEFINITIONS.ZOOM_OUT,  action: zoomOut, enabled: !isGameLocked },
    {
      ...HOTKEY_DEFINITIONS.RESET_CAMERA, 
      action: () => resetAndCenter(board),
      enabled: !isGameLocked
    },
    { ...HOTKEY_DEFINITIONS.PAN_UP, action: () => pan(0, 100), enabled: !isGameLocked },
    { ...HOTKEY_DEFINITIONS.PAN_DOWN,  action: () => pan(0, -100), enabled: !isGameLocked },
    { ...HOTKEY_DEFINITIONS.PAN_LEFT, action: () => pan(100, 0), enabled: !isGameLocked },
    { ...HOTKEY_DEFINITIONS.PAN_RIGHT, action: () => pan(-100, 0), enabled: !isGameLocked },
  ]);

  // ============================================
  // 🖱️ Обработчики мыши для drag
  // ============================================
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    drag(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    endDrag();
  };

  return {
    // 📷 Состояние камеры
    camera,
    transform,

    // 📐 Ref для SVG (нужен в Board для рендеринга)
    svgRef,

    // 🖱️ Обработчики мыши
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,

    // 🌍 Для кликов по клеткам
    screenToWorld
  };
};