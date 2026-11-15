// packages/client/src/renderer3d/models/meepleOutline.test.ts
import { describe, expect, it } from 'vitest';
import { hasSelfIntersections, meepleAspect, meepleOutline } from './meepleOutline';

describe('meepleOutline', () => {
  it('нормирован: высота 1, подошвы на 0, центр по x', () => {
    const outline = meepleOutline();
    const ys = outline.map(([, y]) => y);
    const xs = outline.map(([x]) => x);
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
    expect(Math.max(...ys)).toBeCloseTo(1, 9);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
  });

  it('симметричен относительно оси x = 0', () => {
    const outline = meepleOutline(0);
    for (const [x, y] of outline) {
      const mirrored = outline.some(([mx, my]) => Math.abs(mx + x) < 1e-9 && Math.abs(my - y) < 1e-9);
      expect(mirrored).toBe(true);
    }
  });

  it('контур простой (без самопересечений) при любом сглаживании', () => {
    for (const smoothing of [0, 1, 2, 3]) {
      expect(hasSelfIntersections(meepleOutline(smoothing))).toBe(false);
    }
  });

  it('фигурка шире головы и не шире роста', () => {
    const aspect = meepleAspect(meepleOutline());
    expect(aspect).toBeGreaterThan(0.6);
    expect(aspect).toBeLessThan(1.1);
  });
});
