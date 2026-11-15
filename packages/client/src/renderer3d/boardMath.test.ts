// packages/client/src/renderer3d/boardMath.test.ts
import { describe, expect, it } from 'vitest';
import { rotatePoint } from '@fiefdom/shared/core/tileUtils';
import {
  cellToWorld,
  featureSurface,
  fromStorePoint,
  localToWorld,
  maxTopY,
  parseFeatureKey,
  rotateLocal,
  surfaceTopY,
  toStorePoint,
  worldToCell,
} from './boardMath';

/** Копия tileMesh.tileYaw (модуль тянет earcut): поворот на θ° по часовой = rotation.y = −θ */
const tileYaw = (rotationDegrees: number): number => (-rotationDegrees * Math.PI) / 180;

describe('клетки', () => {
  it('cellToWorld и worldToCell обратимы, границы тайла делят клетки пополам', () => {
    expect(cellToWorld(3, -2)).toEqual({ x: 300, z: -200 });
    expect(worldToCell(300, -200)).toEqual({ x: 3, y: -2 });
    expect(worldToCell(349, -151)).toEqual({ x: 3, y: -2 });
    expect(worldToCell(-10, 10)).toEqual({ x: 0, y: 0 });
  });

  it('клетка (0, 0) не превращается в -0', () => {
    const cell = worldToCell(-1, -1);
    expect(Object.is(cell.x, -0)).toBe(false);
    expect(`${cell.x},${cell.y}`).toBe('0,0');
  });
});

describe('поворот спотов', () => {
  it('совпадает с rotatePoint из shared (правила игры)', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const [x, y] of [[10, -20], [-35, 5], [0, 0], [50, 50]]) {
        const expected = rotatePoint(x, y, rotation);
        const actual = rotateLocal(x, y, rotation);
        expect(actual.x).toBeCloseTo(expected.x, 9);
        expect(actual.y).toBeCloseTo(expected.y, 9);
      }
    }
  });

  it('совпадает с поворотом меша tileYaw (вращение three вокруг Y)', () => {
    // Точка (x, z) под rotation.y = φ: x' = x·cosφ + z·sinφ, z' = −x·sinφ + z·cosφ
    for (const rotation of [0, 90, 180, 270]) {
      const phi = tileYaw(rotation);
      const [x, z] = [30, -12];
      const threeX = x * Math.cos(phi) + z * Math.sin(phi);
      const threeZ = -x * Math.sin(phi) + z * Math.cos(phi);
      const mine = rotateLocal(x, z, rotation);
      expect(mine.x).toBeCloseTo(threeX, 9);
      expect(mine.y).toBeCloseTo(threeZ, 9);
    }
  });

  it('localToWorld: центр тайла + повёрнутая точка', () => {
    // Спот на «севере» тайла (0, -30) после поворота на 90° по часовой оказывается на «востоке»
    const world = localToWorld(2, 1, 90, { x: 0, y: -30 });
    expect(world.x).toBeCloseTo(230, 9);
    expect(world.z).toBeCloseTo(100, 9);
  });
});

describe('координаты стора', () => {
  it('[-50, 50] ↔ [0, 100]', () => {
    expect(toStorePoint({ x: -50, y: 0 })).toEqual({ x: 0, y: 50 });
    expect(fromStorePoint({ x: 100, y: 25 })).toEqual({ x: 50, y: -25 });
    expect(fromStorePoint(toStorePoint({ x: 12.5, y: -33 }))).toEqual({ x: 12.5, y: -33 });
  });
});

describe('высоты', () => {
  const params = { baseHeight: 4, heights: { field: 4, road: 2, plaza: 2, city: 2, monastery: 4 } };

  it('верх поверхности = подложка + её толщина', () => {
    expect(surfaceTopY(params, 'city')).toBe(6);
    expect(surfaceTopY(params, 'field')).toBe(8);
    expect(maxTopY(params)).toBe(8);
  });

  it('тип фичи → поверхность', () => {
    expect(featureSurface('city')).toBe('city');
    expect(featureSurface('monastery')).toBe('monastery');
    expect(featureSurface('road')).toBe('road');
    expect(featureSurface('field')).toBe('field');
  });
});

describe('parseFeatureKey', () => {
  it('разбирает ключ фичи', () => {
    expect(parseFeatureKey('3,-2:city1')).toEqual({ x: 3, y: -2, featureId: 'city1' });
    expect(parseFeatureKey('0,0:a:b')).toEqual({ x: 0, y: 0, featureId: 'a:b' });
  });

  it('мусор → null', () => {
    expect(parseFeatureKey('нет двоеточия')).toBeNull();
    expect(parseFeatureKey('x,y:f')).toBeNull();
  });
});
