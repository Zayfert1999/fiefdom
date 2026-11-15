// packages/client/src/renderer3d/models/meepleOutline.ts
// ============================================
// 🧍 СИЛУЭТ МИППЛА (чистая геометрия, без three)
// ============================================
// Классический силуэт: круглая голова, широко расставленные руки,
// расходящиеся ноги. Контур один (без самопересечений), поэтому его можно
// сразу выдавливать через ExtrudeGeometry.
//
// Координаты нормированы: высота 1, низ (подошвы) на y = 0, центр по x = 0.
// Размер в юнитах задаёт MeepleModel (MEEPLE_HEIGHT).
// ============================================

export type OutlinePoint = readonly [number, number];

const HEAD_CENTER_Y = 0.83;
const HEAD_RADIUS = 0.15;
const HEAD_ARC_STEPS = 12;
/** Полуширина шеи: на ней дуга головы переходит в плечи */
const NECK_HALF_WIDTH = 0.08;

/** Правая половина туловища от шеи до промежности (x ≥ 0), по часовой стрелке */
const RIGHT_HALF: readonly OutlinePoint[] = [
  [0.22, 0.69], // плечо сверху
  [0.5, 0.6], // кисть: верх
  [0.5, 0.47], // кисть: низ
  [0.27, 0.45], // подмышка
  [0.34, 0.2], // бок
  [0.46, 0.0], // стопа снаружи
  [0.14, 0.0], // стопа внутри
];
const CROTCH: OutlinePoint = [0, 0.2];

/** Срезает углы замкнутого контура (Чайкин): сглаживает силуэт без потери формы */
function chaikin(points: readonly OutlinePoint[], iterations: number): OutlinePoint[] {
  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: OutlinePoint[] = [];
    for (let i = 0; i < current.length; i++) {
      const [ax, ay] = current[i];
      const [bx, by] = current[(i + 1) % current.length];
      next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by]);
      next.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    current = next;
  }
  return [...current];
}

/** Контур миппла: высота 1, подошвы на y = 0, симметричен относительно x = 0 */
export function meepleOutline(smoothing = 2): OutlinePoint[] {
  // Дуга головы: от макушки по часовой стрелке до шеи
  const neckY = HEAD_CENTER_Y - Math.sqrt(HEAD_RADIUS ** 2 - NECK_HALF_WIDTH ** 2);
  const endAngle = Math.atan2(neckY - HEAD_CENTER_Y, NECK_HALF_WIDTH);
  const arc: OutlinePoint[] = [];
  for (let i = 0; i <= HEAD_ARC_STEPS; i++) {
    const angle = Math.PI / 2 + ((endAngle - Math.PI / 2) * i) / HEAD_ARC_STEPS;
    arc.push([HEAD_RADIUS * Math.cos(angle), HEAD_CENTER_Y + HEAD_RADIUS * Math.sin(angle)]);
  }

  // Макушка (x = 0) входит в контур один раз, остальное зеркалится
  const right: OutlinePoint[] = [...arc, ...RIGHT_HALF];
  const left: OutlinePoint[] = [...right]
    .slice(1)
    .reverse()
    .map(([x, y]) => [-x, y] as OutlinePoint);

  const raw: OutlinePoint[] = [...right, CROTCH, ...left];
  const smooth = smoothing > 0 ? chaikin(raw, smoothing) : raw;

  // Нормировка: высота 1, подошвы на 0, центр по x
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of smooth) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const height = maxY - minY || 1;
  const centerX = (minX + maxX) / 2;
  return smooth.map(([x, y]) => [(x - centerX) / height, (y - minY) / height] as OutlinePoint);
}

/** Ширина нормированного контура (при высоте 1) */
export function meepleAspect(points: readonly OutlinePoint[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [x] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  return maxX - minX;
}

/** Есть ли у контура пересекающиеся несмежные рёбра (для тестов) */
export function hasSelfIntersections(points: readonly OutlinePoint[]): boolean {
  const n = points.length;
  const cross = (o: OutlinePoint, a: OutlinePoint, b: OutlinePoint): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const intersects = (p1: OutlinePoint, p2: OutlinePoint, p3: OutlinePoint, p4: OutlinePoint): boolean => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };

  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // соседние рёбра замкнутого контура
      if (intersects(a1, a2, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}
