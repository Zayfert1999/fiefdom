// core/tileUtils.ts
import type { Direction, FeatureType, Tile, TileFeature } from './types';

const COMPASS_ORDER: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const NEIGHBOR_OFFSETS = [
  { dx: 0, dy: -1, mySide: 'N' as Direction, theirSide: 'S' as Direction, matchKey: 'N-S' },
  { dx: 1, dy: 0,  mySide: 'E' as Direction, theirSide: 'W' as Direction, matchKey: 'E-W' },
  { dx: 0, dy: 1,  mySide: 'S' as Direction, theirSide: 'N' as Direction, matchKey: 'S-N' },
  { dx: -1, dy: 0, mySide: 'W' as Direction, theirSide: 'E' as Direction, matchKey: 'W-E' },
] as const;

/** Выводит типы сторон [N, E, S, W] из features */
export const getTileSides = (tile: Tile): [FeatureType, FeatureType, FeatureType, FeatureType] => {
  const sides: FeatureType[] = ['N', 'E', 'S', 'W'].map(side => {
    const feat = tile.features.find(f => f.directions.includes(side as Direction));
    return feat?.type ?? 'field';
  });
  return sides as [FeatureType, FeatureType, FeatureType, FeatureType];
};

/** Поворот компасной точки */
export const rotateCompass = (point: Direction, rotation: 0 | 90 | 180 | 270): Direction => {
  if (point === 'C') return 'C';
  const idx = COMPASS_ORDER.indexOf(point);
  const shift = rotation / 45;
  return COMPASS_ORDER[(idx + shift) % 8];
};

/** Поворот точки (x,y) вокруг центра (50,50) */
export const rotatePoint = (x: number, y: number, rotation: 0 | 90 | 180 | 270) => {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    x: 50 + (x - 50) * cos - (y - 50) * sin,
    y: 50 + (x - 50) * sin + (y - 50) * cos,
  };
};

/** Поворот одной фичи */
export const rotateFeature = (feat: TileFeature, rotation: 0 | 90 | 180 | 270): TileFeature => ({
  ...feat,
  directions: feat.directions.map(p => rotateCompass(p, rotation)),
  spots: feat.spots.map(s => {
    const { x, y } = rotatePoint(s.x, s.y, rotation);
    return { ...s, x, y };
  })
});

export const rotateFeatures = (
  features: TileFeature[], 
  rotation: 0 | 90 | 180 | 270
): TileFeature[] => {
  return features.map(f => rotateFeature(f, rotation));
};

/**
 * Карта точного соответствия точек на стыкуемых границах.
 * Гарантирует, что левое поле соединится только с левым, а правое с правым.
 */
export const BOUNDARY_MATCHES: Record<string, { my: Direction; their: Direction }[]> = {
  'S-N': [ // Моя нижняя граница (S) стыкуется с его верхней (N)
    { my: 'SW', their: 'NW' },
    { my: 'S', their: 'N' },
    { my: 'SE', their: 'NE' }
  ],
  'N-S': [ // Моя верхняя (N) с его нижней (S)
    { my: 'NW', their: 'SW' },
    { my: 'N', their: 'S' },
    { my: 'NE', their: 'SE' }
  ],
  'W-E': [ // Моя левая (W) с его правой (E)
    { my: 'NW', their: 'NE' },
    { my: 'W', their: 'E' },
    { my: 'SW', their: 'SE' }
  ],
  'E-W': [ // Моя правая (E) с его левой (W)
    { my: 'NE', their: 'NW' },
    { my: 'E', their: 'W' },
    { my: 'SE', their: 'SW' }
  ]
};

/** Проверка валидности размещения по features */
export const isValidPlacement = (
  board: Map<string, any>,
  x: number, y: number,
  newFeatures: TileFeature[]
) => {
  let hasAdjacent = false;

  // 🌟 Используем общий массив смещений
  for (const { dx, dy, mySide, theirSide } of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    const neighbor = board.get(`${nx},${ny}`);
    
    if (!neighbor) continue; // Соседа нет, проверяем следующую грань
    hasAdjacent = true;

    // Ищем фичу, которая касается нужной стороны
    const myFeat = newFeatures.find(f => f.directions.includes(mySide));
    const theirFeat = neighbor.features.find((f: TileFeature) => f.directions.includes(theirSide));

    // Если фича не найдена, по правилам Каркассона это считается 'field'
    const myType = myFeat?.type ?? 'field';
    const theirType = theirFeat?.type ?? 'field';

    // Если ни один не поле, они должны строго совпадать
    if (myType !== theirType) {
      return false;
    }
  }

  if (hasAdjacent) {
    console.log(`✅ [Validation] Все грани совпадают! Тайл можно ставить.`);
  } else {
    console.warn(`⚠️ [Validation] У тайла нет соседей. (Должен быть хотя бы один)`);
  }
  
  return hasAdjacent;
};