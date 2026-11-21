// packages/client/src/core/geometry/ringOverlap.test.ts
import { describe, it, expect } from 'vitest';
import type { Ring } from '@fiefdom/shared/core/geometry.types';
import { ringsOverlap, ringBounds, boundsOverlap } from './ringOverlap';

const square = (x: number, y: number, size = 10): Ring => [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
];

describe('ringsOverlap', () => {
    it('кольца с общей площадью перекрываются', () => {
        expect(ringsOverlap(square(0, 0), square(5, 5))).toBe(true);
    });

    it('одно кольцо внутри другого — перекрытие', () => {
        expect(ringsOverlap(square(0, 0, 20), square(5, 5, 2))).toBe(true);
        expect(ringsOverlap(square(5, 5, 2), square(0, 0, 20))).toBe(true);
    });

    it('кольца рядом не перекрываются', () => {
        expect(ringsOverlap(square(0, 0), square(20, 0))).toBe(false);
    });

    it('общее ребро — это касание, не перекрытие', () => {
        expect(ringsOverlap(square(0, 0), square(10, 0))).toBe(false);
        // ребро общее лишь частично
        expect(ringsOverlap(square(0, 0), square(10, 4, 3))).toBe(false);
    });

    it('общая вершина — это касание, не перекрытие', () => {
        expect(ringsOverlap(square(0, 0), square(10, 10))).toBe(false);
    });

    it('перекрытие крестом: вершин внутри нет, рёбра пересекаются', () => {
        const wide: Ring = [[0, 4], [20, 4], [20, 6], [0, 6]];
        const tall: Ring = [[9, -5], [11, -5], [11, 15], [9, 15]];
        expect(ringsOverlap(wide, tall)).toBe(true);
    });
});

describe('ограничивающие прямоугольники', () => {
    it('считает границы кольца', () => {
        expect(ringBounds([[1, 2], [5, -3], [4, 9]])).toEqual({ minX: 1, minY: -3, maxX: 5, maxY: 9 });
    });

    it('«нет» точное: разнесённые прямоугольники не пересекаются', () => {
        expect(boundsOverlap(ringBounds(square(0, 0)), ringBounds(square(30, 0)))).toBe(false);
        expect(boundsOverlap(ringBounds(square(0, 0)), ringBounds(square(0, -30)))).toBe(false);
    });

    it('касающиеся и перекрывающиеся прямоугольники — «возможно»', () => {
        expect(boundsOverlap(ringBounds(square(0, 0)), ringBounds(square(10, 0)))).toBe(true);
        expect(boundsOverlap(ringBounds(square(0, 0)), ringBounds(square(5, 5)))).toBe(true);
    });
});
