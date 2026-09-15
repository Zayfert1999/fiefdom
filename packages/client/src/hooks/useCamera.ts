// hooks/useCamera.ts
// ============================================
// 📷 Управление камерой игрового поля
// ============================================
// Отвечает за:
// - Позицию и масштаб камеры
// - Ограничение границами мира
// - Программные действия (центрирование, зум, панорамирование)
// - Интерактивные действия (drag мышью, pinch-zoom)
// - Преобразование экранных координат в мировые
// ============================================

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { TILE_SIZE, CAMERA_CONFIG, WORLD_BOUNDS } from '@fiefdom/shared/core/constants';

// ============================================
// 📦 Типы
// ============================================

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  isDragging: boolean;
  isAnimating: boolean;
  lastMouseX: number;
  lastMouseY: number;
}

// ============================================
// 🎣 Хук
// ============================================

export const useCamera = () => {
  // ============================================
  // 💾 Состояние
  // ============================================

  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    y: 0,
    zoom: 1,
    isDragging: false,
    isAnimating: false,
    lastMouseX: 0,
    lastMouseY: 0,
  });

  /**
   * Синхронный доступ к актуальному состоянию камеры.
   * Позволяет читать камеру из callback-ов без зависимостей от React state.
   */
  const cameraRef = useRef<CameraState>(camera);
  cameraRef.current = camera;

  /** Сохранённый зум для restoreZoom (после placeMeeple) */
  const previousZoomRef = useRef<number | null>(null);

  /** Таймер для сброса флага isAnimating */
  const animationTimerRef = useRef<number | null>(null);

  // ============================================
  // 🖥️ Viewport
  // ============================================

  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  /** Ref для синхронного чтения размеров экрана из callback-ов */
  const viewportRef = useRef(viewportSize);
  viewportRef.current = viewportSize;

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============================================
  // 🧹 Очистка при размонтировании
  // ============================================

  useEffect(() => {
    return () => {
      if (animationTimerRef.current !== null) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, []);

  // ============================================
  // 🎬 Управление анимацией
  // ============================================

  /**
   * Включает флаг isAnimating на заданное время.
   * Используется для включения CSS-переходов при программных действиях.
   */
  const animate = useCallback((duration = CAMERA_CONFIG.ANIMATION_DURATION) => {
    setCamera(prev => ({ ...prev, isAnimating: true }));

    if (animationTimerRef.current !== null) {
      clearTimeout(animationTimerRef.current);
    }

    animationTimerRef.current = window.setTimeout(() => {
      setCamera(prev => ({ ...prev, isAnimating: false }));
      animationTimerRef.current = null;
    }, duration);
  }, []);

  // ============================================
  // 📐 Ограничение камеры (clamp)
  // ============================================

  /**
   * Ограничивает позицию камеры границами мира.
   * Если мир помещается на экране — центрирует его.
   */
  const clampCamera = useCallback((x: number, y: number, zoom: number) => {
    const worldLeft = WORLD_BOUNDS.minX * TILE_SIZE;
    const worldRight = (WORLD_BOUNDS.maxX + 1) * TILE_SIZE;
    const worldTop = WORLD_BOUNDS.minY * TILE_SIZE;
    const worldBottom = (WORLD_BOUNDS.maxY + 1) * TILE_SIZE;

    const worldWidthPx = (worldRight - worldLeft) * zoom;
    const worldHeightPx = (worldBottom - worldTop) * zoom;

    const { width: vpWidth, height: vpHeight } = viewportRef.current;

    let clampedX = x;
    let clampedY = y;

    // Ограничение по X
    if (worldWidthPx <= vpWidth) {
      // Мир помещается на экране — центрируем
      clampedX = (vpWidth - worldWidthPx) / 2 - worldLeft * zoom;
    } else {
      // minCameraX — правый край мира у правого края экрана
      const minCameraX = vpWidth - worldRight * zoom;
      // maxCameraX — левый край мира у левого края экрана
      const maxCameraX = -worldLeft * zoom;
      clampedX = Math.max(minCameraX, Math.min(maxCameraX, x));
    }

    // Ограничение по Y
    if (worldHeightPx <= vpHeight) {
      clampedY = (vpHeight - worldHeightPx) / 2 - worldTop * zoom;
    } else {
      const minCameraY = vpHeight - worldBottom * zoom;
      const maxCameraY = -worldTop * zoom;
      clampedY = Math.max(minCameraY, Math.min(maxCameraY, y));
    }

    return { x: clampedX, y: clampedY };
  }, []); // Пустые зависимости — читает из viewportRef

  // ============================================
  // 📐 Реакция на изменение viewport
  // ============================================

  useEffect(() => {
    setCamera(prev => {
      const clamped = clampCamera(prev.x, prev.y, prev.zoom);
      // Если позиция не изменилась — не вызываем re-render
      if (clamped.x === prev.x && clamped.y === prev.y) return prev;
      return { ...prev, x: clamped.x, y: clamped.y };
    });
  }, [viewportSize, clampCamera]);

  // ============================================
  // 🎯 Программные действия (с анимацией)
  // ============================================

  /** Центрирует камеру на указанном тайле */
  const centerOn = useCallback((tileX: number, tileY: number) => {
    const tilePixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const tilePixelY = tileY * TILE_SIZE + TILE_SIZE / 2;

    animate();

    setCamera(prev => {
      const { width: vpWidth, height: vpHeight } = viewportRef.current;
      const newX = vpWidth / 2 - tilePixelX * prev.zoom;
      const newY = vpHeight / 2 - tilePixelY * prev.zoom;
      const clamped = clampCamera(newX, newY, prev.zoom);
      return { ...prev, x: clamped.x, y: clamped.y };
    });
  }, [clampCamera, animate]);

  /** Центрирует камеру на последнем установленном тайле */
  const centerOnLastTile = useCallback((board: Map<string, { x: number; y: number }>) => {
    if (board.size === 0) return;
    const tiles = Array.from(board.values());
    const lastTile = tiles[tiles.length - 1];
    centerOn(lastTile.x, lastTile.y);
  }, [centerOn]);

  /** Приближает камеру к тайлу с сохранением предыдущего зума для restoreZoom */
  const zoomToTile = useCallback((tileX: number, tileY: number, targetZoom: number) => {
    const tilePixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const tilePixelY = tileY * TILE_SIZE + TILE_SIZE / 2;
    const clampedZoom = Math.max(CAMERA_CONFIG.MIN_ZOOM, Math.min(targetZoom, CAMERA_CONFIG.MAX_ZOOM));

    animate();

    setCamera(prev => {
      previousZoomRef.current = prev.zoom;

      const { width: vpWidth, height: vpHeight } = viewportRef.current;
      const newX = vpWidth / 2 - tilePixelX * clampedZoom;
      const newY = vpHeight / 2 - tilePixelY * clampedZoom;
      const clamped = clampCamera(newX, newY, clampedZoom);

      return {
        ...prev,
        x: clamped.x,
        y: clamped.y,
        zoom: clampedZoom,
      };
    });
  }, [clampCamera, animate]);

  /** Восстанавливает зум, сохранённый через zoomToTile */
  const restoreZoom = useCallback((board: Map<string, { x: number; y: number }>) => {
    const savedZoom = previousZoomRef.current;
    if (savedZoom === null) return;

    animate();

    setCamera(prev => {
      const newZoom = savedZoom;
      previousZoomRef.current = null;

      if (board.size > 0) {
        const tiles = Array.from(board.values());
        const lastTile = tiles[tiles.length - 1];
        const tilePixelX = lastTile.x * TILE_SIZE + TILE_SIZE / 2;
        const tilePixelY = lastTile.y * TILE_SIZE + TILE_SIZE / 2;

        const { width: vpWidth, height: vpHeight } = viewportRef.current;
        const newX = vpWidth / 2 - tilePixelX * newZoom;
        const newY = vpHeight / 2 - tilePixelY * newZoom;
        const clamped = clampCamera(newX, newY, newZoom);

        return {
          ...prev,
          x: clamped.x,
          y: clamped.y,
          zoom: newZoom,
        };
      }

      const { width: vpWidth, height: vpHeight } = viewportRef.current;
      const centerX = vpWidth / 2;
      const centerY = vpHeight / 2;
      const zoomRatio = newZoom / prev.zoom;
      const newX = centerX - (centerX - prev.x) * zoomRatio;
      const newY = centerY - (centerY - prev.y) * zoomRatio;
      const clamped = clampCamera(newX, newY, newZoom);

      return {
        ...prev,
        x: clamped.x,
        y: clamped.y,
        zoom: newZoom,
      };
    });
  }, [clampCamera, animate]);

  /** Приближает на один шаг к центру экрана */
  const zoomIn = useCallback(() => {
    animate();

    setCamera(prev => {
      const newZoom = Math.min(prev.zoom * CAMERA_CONFIG.ZOOM_STEP, CAMERA_CONFIG.MAX_ZOOM);
      const { width: vpWidth, height: vpHeight } = viewportRef.current;
      const centerX = vpWidth / 2;
      const centerY = vpHeight / 2;
      const zoomRatio = newZoom / prev.zoom;
      const newX = centerX - (centerX - prev.x) * zoomRatio;
      const newY = centerY - (centerY - prev.y) * zoomRatio;
      const clamped = clampCamera(newX, newY, newZoom);

      return { ...prev, x: clamped.x, y: clamped.y, zoom: newZoom };
    });
  }, [clampCamera, animate]);

  /** Отдаляет на один шаг от центра экрана */
  const zoomOut = useCallback(() => {
    animate();

    setCamera(prev => {
      const newZoom = Math.max(prev.zoom / CAMERA_CONFIG.ZOOM_STEP, CAMERA_CONFIG.MIN_ZOOM);
      const { width: vpWidth, height: vpHeight } = viewportRef.current;
      const centerX = vpWidth / 2;
      const centerY = vpHeight / 2;
      const zoomRatio = newZoom / prev.zoom;
      const newX = centerX - (centerX - prev.x) * zoomRatio;
      const newY = centerY - (centerY - prev.y) * zoomRatio;
      const clamped = clampCamera(newX, newY, newZoom);

      return { ...prev, x: clamped.x, y: clamped.y, zoom: newZoom };
    });
  }, [clampCamera, animate]);

  /** Панорамирование на заданное смещение */
  const pan = useCallback((dx: number, dy: number) => {
    animate(150);

    setCamera(prev => {
      const newX = prev.x + dx;
      const newY = prev.y + dy;
      const clamped = clampCamera(newX, newY, prev.zoom);
      return { ...prev, x: clamped.x, y: clamped.y };
    });
  }, [clampCamera, animate]);

  /** Сбрасывает зум и центрирует на последнем тайле (или в начале координат) */
  const resetAndCenter = useCallback((board: Map<string, { x: number; y: number }>) => {
    animate();
    previousZoomRef.current = null;

    setCamera(() => {
      if (board.size === 0) {
        return {
          x: 0, y: 0, zoom: 1,
          isDragging: false, isAnimating: true,
          lastMouseX: 0, lastMouseY: 0,
        };
      }

      const tiles = Array.from(board.values());
      const lastTile = tiles[tiles.length - 1];
      const tilePixelX = lastTile.x * TILE_SIZE + TILE_SIZE / 2;
      const tilePixelY = lastTile.y * TILE_SIZE + TILE_SIZE / 2;

      const { width: vpWidth, height: vpHeight } = viewportRef.current;
      const newX = vpWidth / 2 - tilePixelX;
      const newY = vpHeight / 2 - tilePixelY;
      const clamped = clampCamera(newX, newY, 1);

      return {
        x: clamped.x,
        y: clamped.y,
        zoom: 1,
        isDragging: false,
        isAnimating: true,
        lastMouseX: 0,
        lastMouseY: 0,
      };
    });
  }, [clampCamera, animate]);

  // ============================================
  // 🖱️ Интерактивные действия (без анимации)
  // ============================================

  /** Зум колесом мыши с центром в позиции курсора */
  const zoomAtPoint = useCallback((delta: number, mouseX: number, mouseY: number) => {
    setCamera(prev => {
      const factor = delta > 0 ? (1 - CAMERA_CONFIG.WHEEL_ZOOM_STEP) : (1 + CAMERA_CONFIG.WHEEL_ZOOM_STEP);
      const newZoom = Math.max(
        CAMERA_CONFIG.MIN_ZOOM,
        Math.min(prev.zoom * factor, CAMERA_CONFIG.MAX_ZOOM)
      );

      const zoomRatio = newZoom / prev.zoom;
      const newX = mouseX - (mouseX - prev.x) * zoomRatio;
      const newY = mouseY - (mouseY - prev.y) * zoomRatio;
      const clamped = clampCamera(newX, newY, newZoom);

      return { ...prev, x: clamped.x, y: clamped.y, zoom: newZoom };
    });
  }, [clampCamera]);

  /**
   * Pinch-to-zoom: масштабирование относительно центра между пальцами.
   * Ранний выход при отсутствии изменений зума — предотвращает лишние re-render.
   */
  const pinchZoom = useCallback((scaleFactor: number, centerX: number, centerY: number) => {
    setCamera(prev => {
      const newZoom = Math.max(CAMERA_CONFIG.MIN_ZOOM, Math.min(prev.zoom * scaleFactor, CAMERA_CONFIG.MAX_ZOOM));

      // Ранний выход: если зум не изменился — не вызываем re-render
      if (Math.abs(newZoom - prev.zoom) < 0.001) return prev;

      const zoomRatio = newZoom / prev.zoom;
      const newX = centerX - (centerX - prev.x) * zoomRatio;
      const newY = centerY - (centerY - prev.y) * zoomRatio;
      const clamped = clampCamera(newX, newY, newZoom);

      return { ...prev, x: clamped.x, y: clamped.y, zoom: newZoom };
    });
  }, [clampCamera]);

  /** Начало перетаскивания (мышь или один палец) */
  const startDrag = useCallback((mouseX: number, mouseY: number) => {
    setCamera(prev => ({
      ...prev,
      isDragging: true,
      isAnimating: false,
      lastMouseX: mouseX,
      lastMouseY: mouseY,
    }));
  }, []);

  /**
   * Перетаскивание камеры.
   * Обновляет lastMouseX/Y только если камера реально сдвинулась —
   * это предотвращает накопление dx/dy когда камера упёрлась в границу.
   */
  const drag = useCallback((mouseX: number, mouseY: number) => {
    setCamera(prev => {
      if (!prev.isDragging) return prev;

      const dx = mouseX - prev.lastMouseX;
      const dy = mouseY - prev.lastMouseY;
      const newX = prev.x + dx;
      const newY = prev.y + dy;
      const clamped = clampCamera(newX, newY, prev.zoom);

      const didMoveX = clamped.x !== prev.x;
      const didMoveY = clamped.y !== prev.y;

      return {
        ...prev,
        x: clamped.x,
        y: clamped.y,
        lastMouseX: didMoveX ? mouseX : prev.lastMouseX,
        lastMouseY: didMoveY ? mouseY : prev.lastMouseY,
      };
    });
  }, [clampCamera]);

  /** Завершение перетаскивания */
  const endDrag = useCallback(() => {
    setCamera(prev => ({ ...prev, isDragging: false }));
  }, []);

  // ============================================
  // 🔧 Утилиты
  // ============================================

  /**
   * Преобразует экранные координаты в мировые.
   * Читает из ref — не зависит от camera state, не пересоздаётся.
   */
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const cam = cameraRef.current;
    const worldX = (screenX - cam.x) / cam.zoom;
    const worldY = (screenY - cam.y) / cam.zoom;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    return { x: tileX, y: tileY, worldX, worldY };
  }, []); // Пустые зависимости — читает из cameraRef

  /** CSS-transform для SVG-группы камеры */
  const transform = useMemo(() => {
    return `translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`;
  }, [camera.x, camera.y, camera.zoom]);

  // ============================================
  // 📤 Public API
  // ============================================

  return {
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
    pinchZoom,
    startDrag,
    drag,
    endDrag,
    pan,
    screenToWorld,
    setCamera,
  };
};