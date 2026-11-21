// packages/client/src/core/geometry/generation.test.ts
// ============================================
// 🧪 ГЕНЕРАЦИЯ ГЕОМЕТРИИ НЕ ЗАВИСИТ ОТ РУЧНЫХ ДАННЫХ
// ============================================
// Раньше был переключатель `overwrite`: при выключенном в игру попадала нарисованная
// вручную `feature.geometry` из base.json. Это был устаревший снимок старого
// генератора: после правок генератора (заход дорог под город, скругление монастыря)
// он расходился с ним и давал щели и острые углы. Теперь форма всегда строится из портов.
// Эти тесты закрепляют это.
// ============================================
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { GEOMETRY_PARAMS } from './loadedGeometryParams';
import { auditTile, type AuditTile } from './geometryAudit';
import { generateFeatureGeometries } from './generators';
import { parseGeometryParams } from './geometryParams';

const tiles = (baseData as unknown as { tiles: AuditTile[] }).tiles;
const OPTIONS = { geometryParams: GEOMETRY_PARAMS } as const;

const SHAPED = new Set(['city', 'road', 'monastery']);

/** Тайл с изменённой ручной геометрией у городов, дорог и монастырей */
const withManualGeometry = (tile: AuditTile, make: (feature: TileFeature) => TileFeature['geometry']): AuditTile => ({
    ...tile,
    features: tile.features.map((f) => (SHAPED.has(f.type) ? { ...f, geometry: make(f) } : f)),
});

/** Заведомо неверная «нарисованная» форма: маленький квадрат в центре */
const BOGUS = {
    kind: 'area' as const,
    start: [-3, -3] as [number, number],
    outline: [
        { type: 'line' as const, to: [3, -3] as [number, number] },
        { type: 'line' as const, to: [3, 3] as [number, number] },
        { type: 'line' as const, to: [-3, 3] as [number, number] },
        { type: 'close' as const },
    ],
};

describe('геометрия строится из портов, а не из данных', () => {
    const ids = tiles.map((t) => t.id);

    it.each(ids)('%s: форма не меняется, если убрать нарисованную геометрию из данных', (id) => {
        const tile = tiles.find((t) => t.id === id)!;
        const reference = auditTile(tile, OPTIONS).signature;
        const stripped = auditTile(withManualGeometry(tile, () => undefined), OPTIONS).signature;
        expect(stripped).toBe(reference);
    });

    it.each(ids)('%s: форма не меняется, если нарисованная геометрия заведомо неверна', (id) => {
        const tile = tiles.find((t) => t.id === id)!;
        const reference = auditTile(tile, OPTIONS).signature;
        const corrupted = auditTile(withManualGeometry(tile, () => BOGUS), OPTIONS).signature;
        expect(corrupted).toBe(reference);
    });

    it('поля находят полигоны и без маркера geometry.kind = derived в данных', () => {
        for (const tile of tiles) {
            const noMarker: AuditTile = {
                ...tile,
                features: tile.features.map((f) => (f.type === 'field' ? { ...f, geometry: undefined } : f)),
            };
            const audit = auditTile(noMarker, OPTIONS);
            for (const field of tile.features.filter((f) => f.type === 'field')) {
                expect(audit.geometry.assignments.fieldGeometries.get(field.id)?.length ?? 0).toBeGreaterThan(0);
            }
        }
    });
});

describe('запасной вариант, если генератор не справился', () => {
    const manual = {
        kind: 'area' as const,
        start: [-30, -30] as [number, number],
        outline: [
            { type: 'line' as const, to: [30, -30] as [number, number] },
            { type: 'line' as const, to: [30, 30] as [number, number] },
            { type: 'line' as const, to: [-30, 30] as [number, number] },
            { type: 'close' as const },
        ],
    };
    // Порты [0, 5] (два угла разных сторон) генератор города не поддерживает
    const unsupported: TileFeature = {
        id: 'city_odd',
        type: 'city',
        ports: [0, 5],
        meepleSpot: { x: 0, y: 0 },
        geometry: manual,
    } as TileFeature;

    it('генератор сообщает о проблеме и не подменяет форму', () => {
        const result = generateFeatureGeometries([unsupported]);
        expect(result.geometries.has('city_odd')).toBe(false);
        expect(result.warnings.length).toBe(1);
    });

    it('у такой фичи остаётся нарисованная геометрия, остальные берутся из портов', () => {
        const tile: AuditTile = {
            id: 'tile_odd',
            features: [unsupported],
        };
        // Без шума: амплитуда шума в geometryParams.json может быть любой, а проверяется форма
        const audit = auditTile(tile, { ...OPTIONS, noiseEnabled: false });
        const ring = audit.geometry.tessellation.areas.get('city_odd');
        expect(ring).toBeDefined();
        // Нарисованный квадрат ±30, а не форма генератора
        const xs = ring![0][0].map((p) => p[0]);
        expect(Math.max(...xs)).toBeCloseTo(30, 3);
        expect(Math.min(...xs)).toBeCloseTo(-30, 3);
        expect(audit.issues.some((i) => i.code === 'generation')).toBe(true);
    });
});

describe('старая секция generation', () => {
    it('overwrite молча игнорируется, roadWidth и roadEndOverlap переезжают в shapes.road', () => {
        const { params, warnings } = parseGeometryParams({
            version: 1,
            generation: { overwrite: true, roadWidth: 22, roadEndOverlap: 9 },
        });
        expect(warnings).toEqual([]);
        expect(params.shapes.road.width).toBe(22);
        expect(params.shapes.road.endOverlap).toBe(9);
        expect('generation' in params).toBe(false);
    });

    it('значение из shapes.road важнее перенесённого из generation', () => {
        const { params } = parseGeometryParams({
            version: 1,
            generation: { roadWidth: 22 },
            shapes: { road: { width: 16 } },
        });
        expect(params.shapes.road.width).toBe(16);
    });

    it('неизвестный ключ generation попадает в замечания', () => {
        const { warnings } = parseGeometryParams({ version: 1, generation: { lolwut: 1 } });
        expect(warnings.some((w) => w.includes('generation.lolwut'))).toBe(true);
    });
});
