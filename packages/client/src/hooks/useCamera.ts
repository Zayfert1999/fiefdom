// hooks/useCamera.ts
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {TILE_SIZE, CAMERA_CONFIG, WORLD_BOUNDS} from '@fiefdom/shared/core/constants'



export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  isDragging: boolean;
  isAnimating: boolean;
  lastMouseX: number;
  lastMouseY: number;
}

export const useCamera = () => {
  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    y: 0,
    zoom: 1,
    isDragging: false,
    isAnimating: false,
    lastMouseX: 0,
    lastMouseY: 0,
  });

  const previousZoomRef = useRef<number | null>(null);
  const animationTimerRef = useRef<number | null>(null);

  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

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

  useEffect(() => {
    return () => {
      if (animationTimerRef.current !== null) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, []);

  // ============================================
  // 🌟 ВКЛЮЧИТЬ АНИМАЦИЮ НА ВРЕМЯ
  // ============================================
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
  // 🌟 ОГРАНИЧЕНИЕ КАМЕРЫ ПО WORLD_BOUNDS
  // ============================================
  const clampCamera = useCallback((x: number, y: number, zoom: number) => {
    const worldLeft = WORLD_BOUNDS.minX * TILE_SIZE;         // -2500
    const worldRight = (WORLD_BOUNDS.maxX + 1) * TILE_SIZE;  // 2600
    const worldTop = WORLD_BOUNDS.minY * TILE_SIZE;          // -2500
    const worldBottom = (WORLD_BOUNDS.maxY + 1) * TILE_SIZE; // 2600

    const worldWidthPx = (worldRight - worldLeft) * zoom;
    const worldHeightPx = (worldBottom - worldTop) * zoom;

    let clampedX = x;
    let clampedY = y;

    // 🌟 Ограничение по X
    if (worldWidthPx <= viewportSize.width) {
      // Мир помещается на экране — центрируем
      clampedX = (viewportSize.width - worldWidthPx) / 2 - worldLeft * zoom;
    } else {
      // 🌟 ИСПРАВЛЕНО: правильные формулы
      // minCameraX — правый край мира у правого края экрана
      const minCameraX = viewportSize.width - worldRight * zoom;
      // maxCameraX — левый край мира у левого края экрана
      const maxCameraX = -worldLeft * zoom;
      clampedX = Math.max(minCameraX, Math.min(maxCameraX, x));
    }

    // 🌟 Ограничение по Y
    if (worldHeightPx <= viewportSize.height) {
      clampedY = (viewportSize.height - worldHeightPx) / 2 - worldTop * zoom;
    } else {
      // 🌟 ИСПРАВЛЕНО: правильные формулы
      const minCameraY = viewportSize.height - worldBottom * zoom;
      const maxCameraY = -worldTop * zoom;
      clampedY = Math.max(minCameraY, Math.min(maxCameraY, y));
    }

    return { x: clampedX, y: clampedY };
  }, [viewportSize]);

  // ============================================
  // 🌟 НОВОЕ: При изменении viewport — пересчитываем позицию камеры
  // ============================================
  useEffect(() => {
    setCamera(prev => {
      const clamped = clampCamera(prev.x, prev.y, prev.zoom);
      // Если позиция не изменилась — не вызываем re-render
      if (clamped.x === prev.x && clamped.y === prev.y) return prev;
      
      console.log(`📐 [Camera] Viewport изменился → пересчёт позиции камеры`);
      return { ...prev, x: clamped.x, y: clamped.y };
    });
  }, [viewportSize, clampCamera]);  // 🌟 Зависит от viewportSize

  // ============================================
  // 🌟 ПРОГРАММНЫЕ ДЕЙСТВИЯ (с анимацией)
  // ============================================

  const centerOn = useCallback((tileX: number, tileY: number) => {
    const tilePixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const tilePixelY = tileY * TILE_SIZE + TILE_SIZE / 2;

    animate();

    setCamera(prev => {
      const newX = viewportSize.width / 2 - tilePixelX * prev.zoom;
      const newY = viewportSize.height / 2 - tilePixelY * prev.zoom;
      const clamped = clampCamera(newX, newY, prev.zoom);

      return { ...prev, x: clamped.x, y: clamped.y };
    });
  }, [viewportSize, clampCamera, animate]);

  const zoomToTile = useCallback((tileX: number, tileY: number, targetZoom: number) => {
    const tilePixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const tilePixelY = tileY * TILE_SIZE + TILE_SIZE / 2;
    const clampedZoom = Math.max(CAMERA_CONFIG.MIN_ZOOM, Math.min(targetZoom, CAMERA_CONFIG.MAX_ZOOM));

    animate();

    setCamera(prev => {
      previousZoomRef.current = prev.zoom;

      const newX = viewportSize.width / 2 - tilePixelX * clampedZoom;
      const newY = viewportSize.height / 2 - tilePixelY * clampedZoom;
      const clamped = clampCamera(newX, newY, clampedZoom);

      return {
        ...prev,
        x: clamped.x,
        y: clamped.y,
        zoom: clampedZoom,
      };
    });
  }, [viewportSize, clampCamera, animate]);

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

        const newX = viewportSize.width / 2 - tilePixelX * newZoom;
        const newY = viewportSize.height / 2 - tilePixelY * newZoom;
        const clamped = clampCamera(newX, newY, newZoom);

        return {
          ...prev,
          x: clamped.x,
          y: clamped.y,
          zoom: newZoom,
        };
      }

      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;
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
  }, [viewportSize, clampCamera, animate]);

  const centerOnLastTile = useCallback((board: Map<string, { x: number; y: number }>) => {
    if (board.size === 0) return;
    const tiles = Array.from(board.values());
    const lastTile = tiles[tiles.length - 1];
    centerOn(lastTile.x, lastTile.y);
  }, [centerOn]);

  const zoomIn = useCallback(() => {
    animate();

    setCamera(prev => {
      const newZoom = Math.min(prev.zoom * CAMERA_CONFIG.ZOOM_STEP, CAMERA_CONFIG.MAX_ZOOM);
      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;
      const zoomRatio = newZoom / prev.zoom;
      const newX = centerX - (centerX - prev.x) * zoomRatio;
      const newY = centerY - (centerY - prev.y) * zoomRatio;
      const clamped = clampCamera(newX, newY, newZoom);

      return { ...prev, x: clamped.x, y: clamped.y, zoom: newZoom };
    });
  }, [viewportSize, clampCamera, animate]);

  const zoomOut = useCallback(() => {
    animate();

    setCamera(prev => {
      const newZoom = Math.max(prev.zoom / CAMERA_CONFIG.ZOOM_STEP, CAMERA_CONFIG.MIN_ZOOM);
      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;
      const zoomRatio = newZoom / prev.zoom;
      const newX = centerX - (centerX - prev.x) * zoomRatio;
      const newY = centerY - (centerY - prev.y) * zoomRatio;
      const clamped = clampCamera(newX, newY, newZoom);

      return { ...prev, x: clamped.x, y: clamped.y, zoom: newZoom };
    });
  }, [viewportSize, clampCamera, animate]);

  const pan = useCallback((dx: number, dy: number) => {
    animate(150);

    setCamera(prev => {
      const newX = prev.x + dx;
      const newY = prev.y + dy;
      const clamped = clampCamera(newX, newY, prev.zoom);

      return { ...prev, x: clamped.x, y: clamped.y };
    });
  }, [clampCamera, animate]);

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

      const newZoom = 1;
      const newX = viewportSize.width / 2 - tilePixelX * newZoom;
      const newY = viewportSize.height / 2 - tilePixelY * newZoom;
      const clamped = clampCamera(newX, newY, newZoom);

      return {
        x: clamped.x,
        y: clamped.y,
        zoom: newZoom,
        isDragging: false,
        isAnimating: true,
        lastMouseX: 0,
        lastMouseY: 0,
      };
    });
  }, [viewportSize, clampCamera, animate]);

  // ============================================
  // 🌟 ИНТЕРАКТИВНЫЕ ДЕЙСТВИЯ (БЕЗ анимации)
  // ============================================

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

  const startDrag = useCallback((mouseX: number, mouseY: number) => {
    setCamera(prev => ({
      ...prev,
      isDragging: true,
      isAnimating: false,
      lastMouseX: mouseX,
      lastMouseY: mouseY,
    }));
  }, []);

  // 🌟 ИСПРАВЛЕНО: drag теперь правильно обрабатывает границы
  const drag = useCallback((mouseX: number, mouseY: number) => {
    setCamera(prev => {
      if (!prev.isDragging) return prev;

      const dx = mouseX - prev.lastMouseX;
      const dy = mouseY - prev.lastMouseY;
      const newX = prev.x + dx;
      const newY = prev.y + dy;
      const clamped = clampCamera(newX, newY, prev.zoom);

      // 🌟 КЛЮЧЕВОЕ: обновляем lastMouse только если камера реально сдвинулась
      // Это предотвращает накопление dx/dy когда камера упёрлась в границу
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

  const endDrag = useCallback(() => {
    setCamera(prev => ({ ...prev, isDragging: false }));
  }, []);

  const pinchZoom = useCallback((scaleFactor: number, centerX: number, centerY: number) => {
  setCamera(prev => {
    const newZoom = Math.max(CAMERA_CONFIG.MIN_ZOOM, Math.min(prev.zoom * scaleFactor, CAMERA_CONFIG.MAX_ZOOM));
    // Если зум не изменился — не вызываем re-render
    if (Math.abs(newZoom - prev.zoom) < 0.001) return prev;

    const zoomRatio = newZoom / prev.zoom;
    const newX = centerX - (centerX - prev.x) * zoomRatio;
    const newY = centerY - (centerY - prev.y) * zoomRatio;
    const clamped = clampCamera(newX, newY, newZoom);
    return { ...prev, x: clamped.x, y: clamped.y, zoom: newZoom };
  });
}, [clampCamera]);

  // ============================================
  // 🌟 УТИЛИТЫ
  // ============================================

  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const worldX = (screenX - camera.x) / camera.zoom;
    const worldY = (screenY - camera.y) / camera.zoom;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    return { x: tileX, y: tileY, worldX, worldY };
  }, [camera.x, camera.y, camera.zoom]);

  const transform = useMemo(() => {
    return `translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`;
  }, [camera.x, camera.y, camera.zoom]);

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
    setCamera
  };
};