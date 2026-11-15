// packages/client/src/renderer3d/regionHighlights.test.ts
import { describe, expect, it } from 'vitest';
import type { FeatureType, PlacedTile, PreviewTile, TileFeature } from '@fiefdom/shared/core/types';
import { computeRegionHighlights, regionColors, type HighlightInput } from './regionHighlights';

const feature = (id: string, type: FeatureType): TileFeature => ({
  id,
  type,
  ports: [],
  meepleSpot: { x: 0, y: 0 },
});

const tile = (x: number, y: number, features: TileFeature[]): PlacedTile => ({
  templateId: 't',
  x,
  y,
  rotation: 0,
  features,
  derivedPorts: [],
});

/** Фейковый RegionManager: ключ фичи → счётчики миплов по игрокам */
const fakeRegions = (regions: Record<string, Record<string, number>>): HighlightInput['regionManager'] => ({
  getFeatureOwners: (key) => Object.keys(regions[key] ?? {}),
  getMetadata: (key) =>
    regions[key] ? ({ meepleCounts: new Map(Object.entries(regions[key])) } as never) : undefined,
});

const players = [
  { id: 'a', color: '#ff5555' },
  { id: 'b', color: '#5555ff' },
];

describe('regionColors', () => {
  it('без владельца — null', () => {
    expect(regionColors(fakeRegions({}), '0,0:c', players)).toBeNull();
  });

  it('один владелец — его цвет', () => {
    expect(regionColors(fakeRegions({ '0,0:c': { a: 1 } }), '0,0:c', players)).toEqual(['#ff5555']);
  });

  it('побеждает тот, у кого больше миплов', () => {
    const rm = fakeRegions({ '0,0:c': { a: 1, b: 3 } });
    expect(regionColors(rm, '0,0:c', players)).toEqual(['#5555ff']);
  });

  it('при равенстве — оба цвета в стабильном порядке', () => {
    const forward = fakeRegions({ '0,0:c': { a: 2, b: 2 } });
    const backward = fakeRegions({ '0,0:c': { b: 2, a: 2 } });
    expect(regionColors(forward, '0,0:c', players)).toEqual(['#5555ff', '#ff5555']);
    expect(regionColors(backward, '0,0:c', players)).toEqual(['#5555ff', '#ff5555']);
  });

  it('неизвестный игрок — белый', () => {
    expect(regionColors(fakeRegions({ '0,0:c': { ghost: 1 } }), '0,0:c', players)).toEqual(['#ffffff']);
  });
});

describe('computeRegionHighlights', () => {
  const base: HighlightInput = {
    board: new Map([
      ['0,0', tile(0, 0, [feature('city1', 'city'), feature('road1', 'road')])],
      ['1,0', tile(1, 0, [feature('city1', 'city')])],
    ]),
    regionManager: fakeRegions({ '0,0:city1': { a: 1 }, '1,0:city1': { a: 1 }, '0,0:road1': { b: 1 } }),
    players,
    visibleFeatureTypes: ['city', 'road'],
    previewTile: null,
    skipTileKey: null,
  };

  it('подсвечивает только фичи с владельцем, по тайлам', () => {
    const { byTile } = computeRegionHighlights(base);
    expect(byTile.get('0,0')).toEqual([
      { featureId: 'city1', colors: ['#ff5555'] },
      { featureId: 'road1', colors: ['#5555ff'] },
    ]);
    expect(byTile.get('1,0')).toEqual([{ featureId: 'city1', colors: ['#ff5555'] }]);
  });

  it('уважает visibleFeatureTypes', () => {
    const { byTile } = computeRegionHighlights({ ...base, visibleFeatureTypes: ['city'] });
    expect(byTile.get('0,0')).toEqual([{ featureId: 'city1', colors: ['#ff5555'] }]);
  });

  it('пропускает падающий тайл', () => {
    const { byTile } = computeRegionHighlights({ ...base, skipTileKey: '1,0' });
    expect(byTile.has('1,0')).toBe(false);
    expect(byTile.has('0,0')).toBe(true);
  });

  it('подсвечивает фичи тайла-превью', () => {
    const previewTile = {
      tile: { id: 't', artId: 't', quantity: 1, features: [feature('city1', 'city')] },
      x: 2,
      y: 0,
      rotation: 90,
      displayRotation: 90,
      validRotations: [90],
      currentRotationIndex: 0,
    } as PreviewTile;
    const regionManager = fakeRegions({ '2,0:city1': { b: 1 } });
    const { preview, byTile } = computeRegionHighlights({ ...base, regionManager, previewTile });
    expect(preview).toEqual([{ featureId: 'city1', colors: ['#5555ff'] }]);
    expect(byTile.size).toBe(0);
  });
});
