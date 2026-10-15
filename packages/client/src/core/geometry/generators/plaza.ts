// packages/client/src/core/geometry/generators/plaza.ts
// ============================================
// 🏛️ ГЕНЕРАЦИЯ ПЛОЩАДЕЙ НА ПЕРЕКРЁСТКАХ ДОРОГ
// ============================================
// Площади генерируются автоматически там, где пересекаются 2+ дороги.
// Форма площади: "протоптанные тропинки" (вдоль дорог, со скруглёнными углами).
//
// АРХИТЕКТУРА:
//   Принимает УЖЕ ТЕССЕЛИРОВАННЫЕ дороги из пайплайна.
//   Не тесселирует дороги заново — использует кэш.
// ============================================
import type { Point, AreaGeometry, OutlineSegment } from '@fiefdom/shared/core/geometry.types';
import type { TessellatedLine } from '../tessellate';

// ============================================
// ⚙️ КОНСТАНТЫ
// ============================================
/** Допуск для кластеризации точек (юниты) */
const CLUSTER_TOLERANCE = 3;

/** Глубина площади вдоль дороги (юниты). Больше = площадь длиннее. */
const PLAZA_DEPTH = 20;

/** Глубина вогнутости кривой между дорогами (0..1). 0.3 = умеренный срез. */
const CURVE_DEPTH = 0.1;

/** Порог для определения противоположных направлений (dot product < -0.9). */
const OPPOSITE_THRESHOLD = -0.9;

// ============================================
// 📐 ГЕНЕРАЦИЯ ГЕОМЕТРИИ ПЛОЩАДИ
// ============================================
/**
 * Строит AreaGeometry площади как "протоптанные тропинки".
 * Контур обходит перекрёсток по часовой стрелке.
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
        const alongX = center[0] + dir[0] * PLAZA_DEPTH;
        const alongY = center[1] + dir[1] * PLAZA_DEPTH;

        // Перпендикуляр к направлению (поворот на 90° против часовой)
        const perpX = -dir[1];
        const perpY = dir[0];

        edgePoints.push({
            left: [alongX + perpX * halfWidth, alongY + perpY * halfWidth],
            right: [alongX - perpX * halfWidth, alongY - perpY * halfWidth],
        });
    }

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
            const midX = (from[0] + to[0]) / 2;
            const midY = (from[1] + to[1]) / 2;
            const controlPoint: Point = [
                midX + (center[0] - midX) * CURVE_DEPTH,
                midY + (center[1] - midY) * CURVE_DEPTH,
            ];
            outline.push({ type: 'quadratic', cp: controlPoint, to });
        }

        // Прямая поперёк следующей дороги
        if (next !== 0) {
            outline.push({ type: 'line', to: edgePoints[next].right });
        }
    }
    outline.push({ type: 'close' });

    return { kind: 'area', start, outline };
}

// ============================================
// 📍 КЛАСТЕРИЗАЦИЯ И ХЕЛПЕРЫ
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

function getHalfWidth(tessellated: TessellatedLine): number {
    const left = tessellated.left[0];
    const right = tessellated.right[0];
    const dx = left[0] - right[0];
    const dy = left[1] - right[1];
    return Math.sqrt(dx * dx + dy * dy) / 2;
}

// ============================================
// 🏛️ ОСНОВНАЯ ФУНКЦИЯ (PUBLIC API)
// ============================================
/**
 * Генерирует площади на перекрёстках дорог.
 * Принимает кэш тесселированных дорог. НЕ тесселирует их заново.
 * 
 * @param tessellatedLines Кэш тесселированных дорог
 * @returns Массив AreaGeometry площадей
 */
export function generatePlazas(
    tessellatedLines: ReadonlyMap<string, TessellatedLine>
): AreaGeometry[] {
    if (tessellatedLines.size < 2) return [];

    // Собираем данные из КЭША
    const endpoints: Point[] = [];
    const roadHalfWidths: number[] = [];

    for (const [, tessellated] of tessellatedLines) {
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

        // Проверяем уникальность направлений
        const uniqueDirs = new Set<string>();
        for (const { dir } of roadInfos) {
            uniqueDirs.add(`${Math.abs(dir[0]).toFixed(2)},${Math.abs(dir[1]).toFixed(2)}`);
        }
        if (uniqueDirs.size < 2) continue;

        const plazaGeo = generatePlazaGeometry(center, roadInfos);
        plazaGeometries.push(plazaGeo);
        
        console.log(
            `🏛️ [PlazaGenerator] Площадь сгенерирована: ` +
            `центр=(${center[0].toFixed(1)}, ${center[1].toFixed(1)}), ` +
            `дорог=${roadInfos.length}`
        );
    }
    
    return plazaGeometries;
}