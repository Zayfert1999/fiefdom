// packages/client/src/core/geometry/geometryAudit.test.ts
// ============================================
// 🧪 АВТОТЕСТЫ ГЕОМЕТРИИ
// ============================================
// Запуск: pnpm --filter @fiefdom/client test
//
// Тесты разделены по зависимости от булевых операций:
//   • «контуры»  — считаются по тесселяции, не зависят от clipper2-ts
//   • «булевы»   — поля получили полигоны, дороги не вырезаны целиком
//
// Мутационные тесты намеренно ломают параметры и проверяют, что аудит
// это ЗАМЕЧАЕТ. Иначе зелёные тесты ничего не доказывают.
// ============================================
import { describe, it, expect } from 'vitest';
import baseData from '@fiefdom/shared/data/base.json';
import { GEOMETRY_PARAMS } from './loadedGeometryParams';
import {
    CLIPPER_DEPENDENT_CODES,
    auditSeams,
    auditTile,
    auditTiles,
    generateSeamBoard,
    type AuditPipelineOptions,
    type AuditTile,
    type TileAudit,
} from './geometryAudit';

const tiles = (baseData as unknown as { tiles: AuditTile[] }).tiles;

/**
 * Геометрия строго из портов — как в целевом пайплайне — с закоммиченными
 * параметрами (geometryParams.json). Если подкрутить параметры в песочнице и
 * сохранить, тесты проверят именно их, а снимок сигнатур покажет, что изменилось.
 */
const GENERATED: AuditPipelineOptions = { overwrite: true, geometryParams: GEOMETRY_PARAMS };

/** Намеренно сломанные края: торцы дорог наклоняются и вылезают за тайл */
const BROKEN_EDGES: AuditPipelineOptions = {
    ...GENERATED,
    noise: {
        lineAmplitude: 8,
        alignNormals: false,
        edgeFadeDistance: 0,
        clampToTile: false,
    },
};

const byId = (audits: readonly TileAudit[]): Map<string, TileAudit> =>
    new Map(audits.map((a) => [a.tileId, a]));

const describeIssues = (audit: TileAudit, clipperDependent: boolean): string[] =>
    audit.issues
        .filter((i) => i.severity === 'error' && CLIPPER_DEPENDENT_CODES.has(i.code) === clipperDependent)
        .map((i) => `[${i.code}] ${i.message}`);

// ============================================
// 🏷 КОНТУРЫ ТАЙЛОВ
// ============================================
describe('контуры тайлов (без булевых операций)', () => {
    const audits = auditTiles(tiles, GENERATED);

    it.each(audits.map((a) => a.tileId))('%s: нет ошибок аудита', (tileId) => {
        const audit = byId(audits).get(tileId)!;
        expect(describeIssues(audit, false)).toEqual([]);
    });

    it('геометрия детерминирована: одинаковые параметры дают одинаковые сигнатуры', () => {
        const again = auditTiles(tiles, GENERATED);
        expect(again.map((a) => a.signature)).toEqual(audits.map((a) => a.signature));
    });

    it('снимок сигнатур: любое изменение формы тайлов видно в диффе', () => {
        const snapshot = Object.fromEntries(audits.map((a) => [a.tileId, a.signature]));
        expect(snapshot).toMatchSnapshot();
    });
});

// ============================================
// 🌊 ШУМ
// ============================================
describe('шум Перлина', () => {
    // Тайлы, где есть контур, не лежащий целиком на границе тайла
    const WITH_FREE_CONTOURS = ['tile_CCFC', 'tile_CRRC', 'tile_FFFF-M', 'tile_FFRF-M'];

    it.each(WITH_FREE_CONTOURS)('%s: шум действительно меняет форму городов/монастырей', (id) => {
        const tile = tiles.find((t) => t.id === id || t.artId === id)!;
        const noisy = auditTile(tile, { ...GENERATED, noiseEnabled: true });
        const clean = auditTile(tile, { ...GENERATED, noiseEnabled: false });
        // Регрессия бага «нулевая нормаль»: раньше сигнатуры совпадали
        expect(noisy.signature).not.toBe(clean.signature);
    });

    it('нулевые амплитуды дают ту же форму, что и выключенный шум', () => {
        const tile = tiles.find((t) => t.id === 'tile_CCFC')!;
        const zero = auditTile(tile, { ...GENERATED, noise: { areaAmplitude: 0, lineAmplitude: 0 } });
        const clean = auditTile(tile, { ...GENERATED, noiseEnabled: false });
        expect(zero.signature).toBe(clean.signature);
    });

    it('даже при огромной амплитуде геометрия не выходит за тайл, а торцы дорог лежат на границе', () => {
        const audits = auditTiles(tiles, {
            ...GENERATED,
            noise: { areaAmplitude: 40, lineAmplitude: 40, widthVariation: 6 },
        });
        for (const audit of audits) {
            expect(audit.outOfTile).toBe(0);
            expect(audit.roadEndGap).toBe(0);
        }
    });

    it('мутация: без выравнивания нормалей аудит ловит торцы дорог', () => {
        const audits = auditTiles(tiles, BROKEN_EDGES);
        const flagged = audits.filter((a) =>
            a.issues.some((i) => i.code === 'out-of-tile' || i.code === 'road-end-gap')
        );
        expect(flagged.length).toBeGreaterThan(0);
    });
});

// ============================================
// 🧵 ШВЫ
// ============================================
describe('швы между тайлами', () => {
    const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    it('доска всегда собирается', () => {
        for (const seed of SEEDS) {
            expect(generateSeamBoard(tiles, 6, 4, seed)).not.toBeNull();
        }
    });

    it('на корректной геометрии типы поверхности на стыках совпадают', () => {
        const audits = byId(auditTiles(tiles, GENERATED));
        for (const seed of SEEDS) {
            const board = generateSeamBoard(tiles, 6, 4, seed)!;
            const report = auditSeams(board, audits);
            expect(report.pairs.length).toBe(6 * 3 + 5 * 4);
            expect(report.badPairs).toBe(0);
        }
    });

    it('мутация: при сломанных краях хотя бы один стык расходится', () => {
        const audits = byId(auditTiles(tiles, BROKEN_EDGES));
        const worst = SEEDS.map((seed) => {
            const board = generateSeamBoard(tiles, 6, 4, seed)!;
            return auditSeams(board, audits).worstFraction;
        });
        expect(Math.max(...worst)).toBeGreaterThan(0);
    });
});

// ============================================
// 🏛 ПЛОЩАДИ НА ПЕРЕКРЁСТКАХ
// ============================================
// «Заливка» площади = её часть вне дорожных полос. Она должна
// складываться ТОЛЬКО из скруглённых углов между дорогами:
// при радиусе 0 она равна нулю, иначе площадь где-то не совпала бы
// с краем зашумлённой дороги (ступенька или щель).
describe('площади на перекрёстках', () => {
    const junctionTiles = tiles.filter(
        (t) => t.features.filter((f) => f.type === 'road').length >= 3
    );
    const junctionIds = junctionTiles.map((t) => t.id);
    const STRONG_NOISE = { noise: { lineAmplitude: 12 } };

    const roadsOf = (id: string): number =>
        tiles.find((t) => t.id === id)!.features.filter((f) => f.type === 'road').length;

    it('в наборе есть тайлы с перекрёстками', () => {
        expect(junctionIds.length).toBeGreaterThan(0);
    });

    it.each(junctionIds)('%s: при радиусе 0 площадь точно повторяет края дорог', (id) => {
        const tile = tiles.find((t) => t.id === id)!;
        const audit = auditTile(tile, { ...GENERATED, ...STRONG_NOISE, plaza: { cornerRadius: 0 } });
        expect(audit.geometry.decorations.plazas.length).toBeGreaterThan(0);
        expect(audit.plazaExcessArea).toBeLessThan(1);
    });

    it.each(junctionIds)('%s: скругление добавляет заливку, но не больше треугольников угла', (id) => {
        const tile = tiles.find((t) => t.id === id)!;
        const radius = 12;
        const audit = auditTile(tile, { ...GENERATED, ...STRONG_NOISE, plaza: { cornerRadius: radius } });
        expect(audit.plazaExcessArea).toBeGreaterThan(1);
        expect(audit.plazaExcessArea).toBeLessThan(roadsOf(id) * (radius * radius) / 2);
    });

    // До амплитуды ~16 сами дороги остаются простыми; площадь не должна ломаться раньше них
    it.each(junctionIds)('%s: контур площади простой и лежит внутри тайла при сильном шуме', (id) => {
        const tile = tiles.find((t) => t.id === id)!;
        const audit = auditTile(tile, { ...GENERATED, noise: { lineAmplitude: 16 } });
        expect(describeIssues(audit, false)).toEqual([]);
        expect(audit.outOfTile).toBe(0);
    });
});

// ============================================
// ✂️ БУЛЕВЫ ОПЕРАЦИИ (нужен настоящий clipper2-ts)
// ============================================
describe('булевы операции', () => {
    const audits = auditTiles(tiles, GENERATED);

    it.each(audits.map((a) => a.tileId))('%s: все поля получили полигоны, дороги не вырезаны', (tileId) => {
        const audit = byId(audits).get(tileId)!;
        expect(describeIssues(audit, true)).toEqual([]);
    });
});
