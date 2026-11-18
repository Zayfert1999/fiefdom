// packages/client/src/renderer3d/CameraRig.tsx
// ============================================
// 📷 КАМЕРА 3D-ДОСКИ (аналог useBoardCamera + useCamera)
// ============================================
// Ручное управление отдаёт MapControls (ЛКМ — панорама, ПКМ — вращение,
// колесо — зум, на тач-экране — один палец / два). Этот компонент добавляет
// то, что в SVG-версии делал useBoardCamera:
//   • стартовое центрирование на последнем тайле;
//   • плавное центрирование на превью-тайле и на завершённом регионе;
//   • приближение к тайлу в фазе placeMeeple и возврат после неё;
//   • хоткеи: + / = / − (зум), 0 (сброс), стрелки (панорама);
//   • границы мира (WORLD_BOUNDS).
//
// Углы обзора (pitch/yaw), жёсткая или свободная камера — в cameraPreset.json.
// Плавность — экспоненциальное сглаживание цели (target) и смещения камеры
// относительно цели (offset): так камера сохраняет угол обзора, который
// игрок выставил вращением. Любое ручное действие отменяет анимацию.
// ============================================
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CAMERA_CONFIG, TILE_SIZE, WORLD_BOUNDS } from '@fiefdom/shared/core/constants';
import { HOTKEY_DEFINITIONS } from '@fiefdom/shared/core/hotkeys';
import type { CompletedRegion } from '@fiefdom/shared/core/scoring';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useGameStore } from '@/state/useGameStore';
import { parseFeatureKey } from './boardMath';
import { CAMERA_PRESET, DEFAULT_OFFSET } from './cameraPreset';

// Углы, расстояния и скорость камеры задаёт пресет (cameraPreset.json)
/** Смещение камеры от цели по умолчанию: старт и сброс по хоткею */
export const DEFAULT_CAMERA_OFFSET = new THREE.Vector3(DEFAULT_OFFSET.x, DEFAULT_OFFSET.y, DEFAULT_OFFSET.z);
/** Расстояние до цели при выборе мипла (аналог zoom ×2) */
const MEEPLE_DISTANCE = CAMERA_PRESET.meepleDistance;
/** Скорость сглаживания, 1/с */
const SMOOTHING = CAMERA_PRESET.smoothing;

export const CAMERA_MIN_DISTANCE = CAMERA_PRESET.minDistance;
export const CAMERA_MAX_DISTANCE = CAMERA_PRESET.maxDistance;

/** Минимальный интерфейс OrbitControls/MapControls, который нужен ригу */
interface ControlsLike {
  target: THREE.Vector3;
  addEventListener: (type: 'start', listener: () => void) => void;
  removeEventListener: (type: 'start', listener: () => void) => void;
}

interface Goal {
  x: number;
  z: number;
  offset: THREE.Vector3;
}

const WORLD_MIN_X = WORLD_BOUNDS.minX * TILE_SIZE - TILE_SIZE / 2;
const WORLD_MAX_X = WORLD_BOUNDS.maxX * TILE_SIZE + TILE_SIZE / 2;
const WORLD_MIN_Z = WORLD_BOUNDS.minY * TILE_SIZE - TILE_SIZE / 2;
const WORLD_MAX_Z = WORLD_BOUNDS.maxY * TILE_SIZE + TILE_SIZE / 2;

const scratch = new THREE.Vector3();

/** Центр региона в клетках (среднее по тайлам его фич) */
function getRegionCenter(region: CompletedRegion): { x: number; y: number } | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const key of region.featureKeys) {
    const parts = parseFeatureKey(key);
    if (!parts) continue;
    sumX += parts.x;
    sumY += parts.y;
    count++;
  }
  return count > 0 ? { x: sumX / count, y: sumY / count } : null;
}

export const CameraRig = () => {
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const camera = useThree((s) => s.camera);

  const phase = useGameStore((s) => s.phase);
  const board = useGameStore((s) => s.board);
  const previewTile = useGameStore((s) => s.previewTile);
  const completionAnimations = useGameStore((s) => s.completionAnimations);

  const goal = useRef<Goal | null>(null);
  const savedOffset = useRef<THREE.Vector3 | null>(null);

  // ============================================
  // 🎯 ПРИМИТИВЫ
  // ============================================
  const currentOffset = useCallback(
    (): THREE.Vector3 => (controls ? camera.position.clone().sub(controls.target) : DEFAULT_CAMERA_OFFSET.clone()),
    [controls, camera]
  );

  /** Плавно перейти к цели (x, z — мировые координаты), при необходимости сменив смещение камеры */
  const moveTo = useCallback(
    (x: number, z: number, offset?: THREE.Vector3): void => {
      goal.current = { x, z, offset: offset ?? currentOffset() };
    },
    [currentOffset]
  );

  const lastTileCenter = useCallback((): { x: number; z: number } => {
    let last: { x: number; y: number } | undefined;
    for (const tile of board.values()) last = tile;
    return last ? { x: last.x * TILE_SIZE, z: last.y * TILE_SIZE } : { x: 0, z: 0 };
  }, [board]);

  /** Расстояние до цели в пределах допустимого, направление то же */
  const withDistance = useCallback(
    (distance: number): THREE.Vector3 => {
      const offset = currentOffset();
      return offset.setLength(Math.min(CAMERA_MAX_DISTANCE, Math.max(CAMERA_MIN_DISTANCE, distance)));
    },
    [currentOffset]
  );

  // ============================================
  // 🚀 СТАРТ: мгновенно встаём на последний тайл
  // ============================================
  const initialised = useRef(false);
  useEffect(() => {
    if (!controls || initialised.current) return;
    initialised.current = true;

    const { x, z } = lastTileCenter();
    controls.target.set(x, 0, z);
    camera.position.set(x + DEFAULT_CAMERA_OFFSET.x, DEFAULT_CAMERA_OFFSET.y, z + DEFAULT_CAMERA_OFFSET.z);
  }, [controls, camera, lastTileCenter]);

  // Ручное управление отменяет анимацию
  useEffect(() => {
    if (!controls) return;
    const cancel = (): void => {
      goal.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  // ============================================
  // 🎬 АВТОМАТИЧЕСКИЕ ДВИЖЕНИЯ
  // ============================================
  // 1. Превью появилось или сменило клетку → центрируем на нём
  const prevPreview = useRef(previewTile);
  useEffect(() => {
    const prev = prevPreview.current;
    const curr = previewTile;
    const isNew = prev === null && curr !== null;
    const isMoved = prev !== null && curr !== null && (prev.x !== curr.x || prev.y !== curr.y);
    if ((isNew || isMoved) && curr) moveTo(curr.x * TILE_SIZE, curr.y * TILE_SIZE);
    prevPreview.current = curr;
  }, [previewTile, moveTo]);

  // 2–3. Вход в placeMeeple — приближаемся к тайлу, выход — возвращаем обзор
  const prevPhase = useRef(phase);
  useEffect(() => {
    const before = prevPhase.current;
    if (before !== phase) {
      const { x, z } = lastTileCenter();
      if (phase === 'placeMeeple' && board.size > 0) {
        savedOffset.current = currentOffset();
        moveTo(x, z, withDistance(MEEPLE_DISTANCE));
      } else if (before === 'placeMeeple') {
        moveTo(x, z, savedOffset.current ?? undefined);
        savedOffset.current = null;
      }
    }
    prevPhase.current = phase;
  }, [phase, board, lastTileCenter, currentOffset, moveTo, withDistance]);

  // 4. Появилась анимация завершения региона → центрируем на нём (без зума)
  const prevCompletions = useRef(0);
  useEffect(() => {
    const before = prevCompletions.current;
    const now = completionAnimations.length;
    if (before === 0 && now > 0) {
      const center = getRegionCenter(completionAnimations[now - 1].region);
      if (center) moveTo(center.x * TILE_SIZE, center.y * TILE_SIZE);
    }
    prevCompletions.current = now;
  }, [completionAnimations, moveTo]);

  // ============================================
  // ⌨️ ХОТКЕИ
  // ============================================
  const enabled = phase !== 'endTurn';

  const zoomBy = useCallback(
    (factor: number): void => {
      if (!controls) return;
      const offset = currentOffset();
      goal.current = {
        x: controls.target.x,
        z: controls.target.z,
        offset: withDistance(offset.length() * factor),
      };
    },
    [controls, currentOffset, withDistance]
  );

  /** Сдвиг по экрану: forward — «вверх», right — «вправо» (в юнитах мира) */
  const panBy = useCallback(
    (forward: number, right: number): void => {
      if (!controls) return;
      const offset = currentOffset();
      // Направление взгляда на землю: от камеры к цели
      const fx = -offset.x;
      const fz = -offset.z;
      const length = Math.hypot(fx, fz) || 1;
      const dirX = fx / length;
      const dirZ = fz / length;
      moveTo(
        controls.target.x + dirX * forward + -dirZ * right,
        controls.target.z + dirZ * forward + dirX * right,
        offset
      );
    },
    [controls, currentOffset, moveTo]
  );

  const reset = useCallback((): void => {
    const { x, z } = lastTileCenter();
    moveTo(x, z, DEFAULT_CAMERA_OFFSET.clone());
  }, [lastTileCenter, moveTo]);

  const pan = TILE_SIZE;
  useHotkeys([
    { ...HOTKEY_DEFINITIONS.ZOOM_IN, action: () => zoomBy(1 / CAMERA_CONFIG.ZOOM_STEP), enabled },
    { ...HOTKEY_DEFINITIONS.ZOOM_IN_ALT, action: () => zoomBy(1 / CAMERA_CONFIG.ZOOM_STEP), enabled },
    { ...HOTKEY_DEFINITIONS.ZOOM_OUT, action: () => zoomBy(CAMERA_CONFIG.ZOOM_STEP), enabled },
    { ...HOTKEY_DEFINITIONS.RESET_CAMERA, action: reset, enabled },
    { ...HOTKEY_DEFINITIONS.PAN_UP, action: () => panBy(pan, 0), enabled },
    { ...HOTKEY_DEFINITIONS.PAN_DOWN, action: () => panBy(-pan, 0), enabled },
    { ...HOTKEY_DEFINITIONS.PAN_LEFT, action: () => panBy(0, -pan), enabled },
    { ...HOTKEY_DEFINITIONS.PAN_RIGHT, action: () => panBy(0, pan), enabled },
  ]);

  // ============================================
  // 🎞 КАДР
  // ============================================
  useFrame((_, delta) => {
    if (!controls) return;
    const target = controls.target;

    const g = goal.current;
    if (g) {
      const k = 1 - Math.exp(-SMOOTHING * delta);

      // Смещение камеры считаем ДО сдвига цели
      scratch.copy(camera.position).sub(target).lerp(g.offset, k);
      target.x += (g.x - target.x) * k;
      target.z += (g.z - target.z) * k;
      camera.position.copy(target).add(scratch);

      const remaining = Math.hypot(g.x - target.x, g.z - target.z);
      const offsetGap = scratch.distanceTo(g.offset);
      if (remaining < 0.5 && offsetGap < 0.5) goal.current = null;
    }

    // Границы мира: двигаем цель и камеру вместе, угол обзора не меняется
    const clampedX = Math.min(WORLD_MAX_X, Math.max(WORLD_MIN_X, target.x));
    const clampedZ = Math.min(WORLD_MAX_Z, Math.max(WORLD_MIN_Z, target.z));
    if (clampedX !== target.x || clampedZ !== target.z) {
      camera.position.x += clampedX - target.x;
      camera.position.z += clampedZ - target.z;
      target.x = clampedX;
      target.z = clampedZ;
    }
  });

  return null;
};