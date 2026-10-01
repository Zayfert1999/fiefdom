// packages/shared/src/core/proceduralGeometry.ts
// ============================================
// 🏛️ ПРОЦЕДУРНАЯ ГЕНЕРАЦИЯ ПЛОЩАДЕЙ
// ============================================
// Площади генерируются автоматически на пересечении 2+ дорог.
//
// Форма площади: "протоптанные тропинки"
// Площадь идёт ВДОЛЬ дорог, со скруглёнными углами между ними.
//
// 🌟 АРХИТЕКТУРА:
//   Принимает УЖЕ ТЕССЕЛИРОВАННЫЕ дороги из Этапа 1 процессора.
//   Не тесселирует дороги заново — использует кэш.
//
// Алгоритм:
//   1. Берём конечные точки осевых линий из кэша
//   2. Кластеризуем точки (группируем близкие = перекрёсток)
//   3. Для каждого кластера:
//      a. Определяем направления дорог от центра
//      b. Вычисляем края на расстоянии PLAZA_DEPTH вдоль дорог
//      c. Соединяем края соседних дорог вогнутыми кривыми
// ============================================

import type { Point, AreaGeometry, OutlineSegment } from './geometry.types';
import type { TessellatedLine } from './tessellate';

// ============================================
// ⚙️ КОНСТАНТЫ
// ============================================

/** Допуск для кластеризации точек (юниты) */
const CLUSTER_TOLERANCE = 3;

/**
 * Глубина площади вдоль дороги (юниты).
 * Точки краёв вычисляются на этом расстоянии от центра.
 * Больше значение = площадь длиннее вдоль дорог.
 */
const PLAZA_DEPTH = 20;

/**
 * Глубина вогнутости кривой между дорогами (0..1).
 * 0.0 = прямая линия (нет среза угла)
 * 1.0 = кривая проходит через центр
 * 0.3 = умеренный срез (протоптанная тропинка)
 */
const CURVE_DEPTH = 0.1;

/**
 * Порог для определения противоположных направлений.
 * dot product < -0.9 → угол > ~154° → считаем противоположными.
 */
const OPPOSITE_THRESHOLD = -0.9;

// ============================================
// 📐 ГЕНЕРАЦИЯ ГЕОМЕТРИИ ПЛОЩАДИ
// ============================================

/**
 * Строит AreaGeometry площади как "протоптанные тропинки".
 *
 * Контур обходит перекрёсток по часовой стрелке:
 *   • Кривая: от правого края дороги i к левому краю дороги i+1
 *     (вогнутая, срезает угол — люди ходили по диагонали)
 *   • Прямая: поперёк дороги i+1 (от левого края к правому)
 *
 * @param center    Центр площади (точка пересечения осевых линий)
 * @param roadInfos Информация о каждой дороге: направление и полуширина
 * @returns AreaGeometry, готовая к тесселяции
 */
function generatePlazaGeometry(
    center: Point,
    roadInfos: Array<{ dir: Point; halfWidth: number }>
): AreaGeometry {
    const n = roadInfos.length;

    // Сортируем дороги по часовой стрелке
    const sorted = [...roadInfos].sort((a, b) =>
        Math.atan2(b.dir[1], b.dir[0]) - Math.atan2(a.dir[1], a.dir[0])
    );

    // Вычисляем края каждой дороги НА РАССТОЯНИИ PLAZA_DEPTH от центра
    const edgePoints: Array<{ left: Point; right: Point }> = [];

    for (const { dir, halfWidth } of sorted) {
        // Точка на расстоянии PLAZA_DEPTH вдоль дороги от центра
        const alongX = center[0] + dir[0] * PLAZA_DEPTH;
        const alongY = center[1] + dir[1] * PLAZA_DEPTH;

        // Перпендикуляр к направлению (поворот на 90° против часовой)
        const perpX = -dir[1];
        const perpY = dir[0];

        // Левый и правый края в удалённой точке
        const left: Point = [
            alongX + perpX * halfWidth,
            alongY + perpY * halfWidth,
        ];
        const right: Point = [
            alongX - perpX * halfWidth,
            alongY - perpY * halfWidth,
        ];

        edgePoints.push({ left, right });
    }

    // Стартовая точка — правый край первой дороги
    const start = edgePoints[0].right;
    const outline: OutlineSegment[] = [];

    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const dir1 = sorted[i].dir;
        const dir2 = sorted[next].dir;

        const from = edgePoints[i].right;
        const to = edgePoints[next].left;

        // Проверяем угол между дорогами (dot product)
        const dot = dir1[0] * dir2[0] + dir1[1] * dir2[1];

        if (dot < OPPOSITE_THRESHOLD) {
            // Противоположные направления (~180°) — прямая линия
            outline.push({ type: 'line', to });
        } else {
            // Вогнутая кривая (срез угла между дорогами)
            // Контрольная точка смещена К центру
            const midX = (from[0] + to[0]) / 2;
            const midY = (from[1] + to[1]) / 2;

            const controlPoint: Point = [
                midX + (center[0] - midX) * CURVE_DEPTH,
                midY + (center[1] - midY) * CURVE_DEPTH,
            ];

            outline.push({
                type: 'quadratic',
                cp: controlPoint,
                to,
            });
        }

        // Прямая поперёк следующей дороги (от левого края к правому)
        // Пропускаем для последней итерации (замыкание через close)
        if (next !== 0) {
            outline.push({
                type: 'line',
                to: edgePoints[next].right,
            });
        }
    }

    outline.push({ type: 'close' });

    return {
        kind: 'area',
        start,
        outline,
    };
}

// ============================================
// 📍 КЛАСТЕРИЗАЦИЯ
// ============================================

function distance(a: Point, b: Point): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

function averagePoint(points: Point[]): Point {
    const sum = points.reduce(
        (acc, [x, y]) => [acc[0] + x, acc[1] + y] as Point,
        [0, 0] as Point
    );
    return [sum[0] / points.length, sum[1] / points.length];
}

function clusterPointIndices(points: Point[], tolerance: number): number[][] {
    const clusters: number[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < points.length; i++) {
        if (used.has(i)) continue;

        const cluster: number[] = [i];
        used.add(i);

        for (let j = i + 1; j < points.length; j++) {
            if (used.has(j)) continue;
            if (distance(points[i], points[j]) <= tolerance) {
                cluster.push(j);
                used.add(j);
            }
        }

        clusters.push(cluster);
    }

    return clusters;
}

// Вычисляем полуширину из тесселированных контуров
function getHalfWidth(tessellated: TessellatedLine): number {
    const left = tessellated.left[0];
    const right = tessellated.right[0];
    const dx = left[0] - right[0];
    const dy = left[1] - right[1];
    return Math.sqrt(dx * dx + dy * dy) / 2;
}

// ============================================
// 🏛️ ОСНОВНАЯ ФУНКЦИЯ
// ============================================

/**
 * Генерирует площади на перекрёстках дорог.
 *
 * 🌟 ПРИНИМАЕТ КЭШ тесселированных дорог из Этапа 1 процессора.
 * НЕ тесселирует дороги заново.
 *
 * Возвращает AreaGeometry (НЕ тесселированные).
 * Тесселяция происходит в Этапе 2 процессора.
 *
 * @param tessellatedLines Кэш тесселированных дорог из Этапа 1
 * @returns Массив AreaGeometry площадей
 */
export function generatePlazas(
    tessellatedLines: ReadonlyMap<string, TessellatedLine>
): AreaGeometry[] {
    // Нужно минимум 2 дороги для перекрёстка
    if (tessellatedLines.size < 2) return [];

    // 🌟 Собираем данные из КЭША (без повторной тесселяции!)
    const featureIds: string[] = [];
    const endpoints: Point[] = [];
    const roadHalfWidths: number[] = [];

    for (const [featureId, tessellated] of tessellatedLines) {
        featureIds.push(featureId);
        endpoints.push(tessellated.center[0]);
        endpoints.push(tessellated.center[tessellated.center.length - 1]);
        roadHalfWidths.push(getHalfWidth(tessellated));
    }

    // Кластеризуем точки (близкие = одна точка пересечения)
    const clusterIndices = clusterPointIndices(endpoints, CLUSTER_TOLERANCE);

    const plazaGeometries: AreaGeometry[] = [];

    for (const indices of clusterIndices) {
        if (indices.length < 2) continue;

        const clusterPoints = indices.map(i => endpoints[i]);
        const center = averagePoint(clusterPoints);
        const indexSet = new Set(indices);

        // Определяем направления и ширины дорог
        const roadInfos: Array<{ dir: Point; halfWidth: number }> = [];
        const seenRoads = new Set<number>();

        for (const pointIdx of indices) {
            const roadIdx = Math.floor(pointIdx / 2);
            if (seenRoads.has(roadIdx)) continue;
            seenRoads.add(roadIdx);

            // Противоположный конец дороги
            const otherPointIdx = roadIdx * 2 + (pointIdx % 2 === 0 ? 1 : 0);
            if (indexSet.has(otherPointIdx)) continue;

            const otherPoint = endpoints[otherPointIdx];
            const dx = otherPoint[0] - center[0];
            const dy = otherPoint[1] - center[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) continue;

            roadInfos.push({
                dir: [dx / len, dy / len] as Point,
                halfWidth: roadHalfWidths[roadIdx],
            });
        }

        if (roadInfos.length < 2) continue;

        // Проверяем, что есть хотя бы 2 уникальных направления
        const uniqueDirs = new Set<string>();
        for (const { dir } of roadInfos) {
            const key = `${Math.abs(dir[0]).toFixed(2)},${Math.abs(dir[1]).toFixed(2)}`;
            uniqueDirs.add(key);
        }
        if (uniqueDirs.size < 2) continue;

        const plazaGeo = generatePlazaGeometry(center, roadInfos);
        plazaGeometries.push(plazaGeo);

        console.log(
            `🏛️ [Plaza] Площадь сгенерирована: ` +
            `центр=(${center[0].toFixed(1)}, ${center[1].toFixed(1)}), ` +
            `дорог=${roadInfos.length}`
        );
    }

    return plazaGeometries;
}