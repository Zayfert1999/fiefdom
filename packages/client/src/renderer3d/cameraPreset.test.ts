// packages/client/src/renderer3d/cameraPreset.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAMERA_PRESET,
  controlsLimits,
  normalizeYaw,
  offsetFromAngles,
  resolveCameraPreset,
} from './cameraPreset';

describe('offsetFromAngles', () => {
  it('сохраняет расстояние, наклон и поворот', () => {
    const { x, y, z } = offsetFromAngles(30, 45, 100);
    expect(Math.hypot(x, y, z)).toBeCloseTo(100, 9);
    expect(Math.asin(y / 100) * (180 / Math.PI)).toBeCloseTo(30, 9);
    expect(Math.atan2(x, z) * (180 / Math.PI)).toBeCloseTo(45, 9);
  });

  it('yaw 0 — камера строго на юге (+z)', () => {
    const { x, z } = offsetFromAngles(30, 0, 100);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeGreaterThan(0);
  });

  it('pitch 30° на единичное расстояние: высота 0.5', () => {
    expect(offsetFromAngles(30, 45, 1).y).toBeCloseTo(0.5, 9);
  });
});

describe('normalizeYaw', () => {
  it('приводит угол к (−180, 180]', () => {
    expect(normalizeYaw(45)).toBe(45);
    expect(normalizeYaw(225)).toBe(-135);
    expect(normalizeYaw(-190)).toBe(170);
    expect(normalizeYaw(180)).toBe(180);
    expect(normalizeYaw(-180)).toBe(180);
    expect(normalizeYaw(720)).toBe(0);
  });
});

describe('resolveCameraPreset', () => {
  it('пустой ввод — значения по умолчанию', () => {
    expect(resolveCameraPreset()).toEqual(DEFAULT_CAMERA_PRESET);
  });

  it('зажимает значения и чинит мусор', () => {
    const preset = resolveCameraPreset({
      pitchDeg: 120,
      yawDeg: 405,
      fov: 'много',
      minDistance: 500,
      maxDistance: 100,
      distance: 10,
    });
    expect(preset.pitchDeg).toBe(89);
    expect(preset.yawDeg).toBe(45);
    expect(preset.fov).toBe(DEFAULT_CAMERA_PRESET.fov);
    expect(preset.maxDistance).toBeGreaterThan(preset.minDistance);
    expect(preset.distance).toBe(preset.minDistance);
  });

  it('границы наклона упорядочены', () => {
    const preset = resolveCameraPreset({ unlocked: { pitchMinDeg: 70, pitchMaxDeg: 30 } });
    expect(preset.pitchMaxDeg).toBeGreaterThan(preset.pitchMinDeg - 1);
  });
});

describe('controlsLimits', () => {
  it('жёсткая камера: вращение выключено, углы зафиксированы', () => {
    const limits = controlsLimits({ ...DEFAULT_CAMERA_PRESET, lockRotation: true });
    expect(limits.enableRotate).toBe(false);
    expect(limits.minPolarAngle).toBe(limits.maxPolarAngle);
    expect(limits.minPolarAngle).toBeCloseTo((60 * Math.PI) / 180, 9);
    expect(limits.minAzimuthAngle).toBeCloseTo(Math.PI / 4, 9);
    expect(limits.maxAzimuthAngle).toBeCloseTo(Math.PI / 4, 9);
  });

  it('свободная камера: наклон в пределах, поворот без ограничений', () => {
    const limits = controlsLimits({ ...DEFAULT_CAMERA_PRESET, lockRotation: false, pitchMinDeg: 20, pitchMaxDeg: 80 });
    expect(limits.enableRotate).toBe(true);
    expect(limits.minPolarAngle).toBeCloseTo((10 * Math.PI) / 180, 9);
    expect(limits.maxPolarAngle).toBeCloseTo((70 * Math.PI) / 180, 9);
    expect(limits.minAzimuthAngle).toBe(-Infinity);
  });
});
