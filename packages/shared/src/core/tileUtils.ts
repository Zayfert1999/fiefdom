// core/tileUtils.ts
import type { Direction, FeatureType, Tile, TileFeature, PlacedTile } from './types';
import { RegionManager, type FeatureKey } from './regionManager';

const COMPASS_ORDER: Direction[] = ['N','NE(N)', 'NE', 'NE(E)', 'E', 'SE(E)', 'SE', 'SE(S)', 'S', 'SW(S)', 'SW', 'SW(W)', 'W', 'NW(W)', 'NW', 'NW(N)'];

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

/** Поворот компасной точки (включая подточки) */
export const rotateCompass = (point: Direction, rotation: 0 | 90 | 180 | 270): Direction => {
  if (point === 'C') return 'C';
  
  const idx = COMPASS_ORDER.indexOf(point);
  if (idx === -1) {
    console.warn(`⚠️ [rotateCompass] Неизвестное направление: ${point}`);
    return point;
  }
  
  // 🌟 Сдвиг: 90° = 4 позиции, 180° = 8, 270° = 12
  const shift = (rotation / 90) * 4;
  
  // 🌟 Модуль 16 (размер массива)
  return COMPASS_ORDER[(idx + shift) % 16];
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
 * Поддерживает обычные углы (NE, NW, SE, SW) и подточки (NE(E), NW(W) и т.д.).
 * 
 * Подточки соединяются:
 * - С обычными углами соседа
 * - С подточками соседа (если они указывают на ту же сторону)
 */
export const BOUNDARY_MATCHES: Record<string, { my: Direction; their: Direction }[]> = {
  'S-N': [ // Моя нижняя граница (S) стыкуется с его верхней (N)
    // Обычные углы
    { my: 'SW', their: 'NW' },
    { my: 'S', their: 'N' },
    { my: 'SE', their: 'NE' },
    // Подточки моей стороны S
    { my: 'SW(S)', their: 'NW' },
    { my: 'SW(S)', their: 'NW(N)' },
    { my: 'SE(S)', their: 'NE' },
    { my: 'SE(S)', their: 'NE(N)' },
    // Подточки его стороны N
    { my: 'SW', their: 'NW(N)' },
    { my: 'SW(S)', their: 'NW(N)' },
    { my: 'SE', their: 'NE(N)' },
    { my: 'SE(S)', their: 'NE(N)' },
  ],
  'N-S': [ // Моя верхняя (N) с его нижней (S)
    // Обычные углы
    { my: 'NW', their: 'SW' },
    { my: 'N', their: 'S' },
    { my: 'NE', their: 'SE' },
    // Подточки моей стороны N
    { my: 'NW(N)', their: 'SW' },
    { my: 'NW(N)', their: 'SW(S)' },
    { my: 'NE(N)', their: 'SE' },
    { my: 'NE(N)', their: 'SE(S)' },
    // Подточки его стороны S
    { my: 'NW', their: 'SW(S)' },
    { my: 'NW(N)', their: 'SW(S)' },
    { my: 'NE', their: 'SE(S)' },
    { my: 'NE(N)', their: 'SE(S)' },
  ],
  'W-E': [ // Моя левая (W) с его правой (E)
    // Обычные углы
    { my: 'NW', their: 'NE' },
    { my: 'W', their: 'E' },
    { my: 'SW', their: 'SE' },
    // Подточки моей стороны W
    { my: 'NW(W)', their: 'NE' },
    { my: 'NW(W)', their: 'NE(E)' },
    { my: 'SW(W)', their: 'SE' },
    { my: 'SW(W)', their: 'SE(E)' },
    // Подточки его стороны E
    { my: 'NW', their: 'NE(E)' },
    { my: 'NW(W)', their: 'NE(E)' },
    { my: 'SW', their: 'SE(E)' },
    { my: 'SW(W)', their: 'SE(E)' },
  ],
  'E-W': [ // Моя правая (E) с его левой (W)
    // Обычные углы
    { my: 'NE', their: 'NW' },
    { my: 'E', their: 'W' },
    { my: 'SE', their: 'SW' },
    // Подточки моей стороны E
    { my: 'NE(E)', their: 'NW' },
    { my: 'NE(E)', their: 'NW(W)' },
    { my: 'SE(E)', their: 'SW' },
    { my: 'SE(E)', their: 'SW(W)' },
    // Подточки его стороны W
    { my: 'NE', their: 'NW(W)' },
    { my: 'NE(E)', their: 'NW(W)' },
    { my: 'SE', their: 'SW(W)' },
    { my: 'SE(E)', their: 'SW(W)' },
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

/**
 * Возвращает множество ключей клеток "x,y", куда можно поставить данный тайл
 * хотя бы в одном из 4 поворотов.
 * Используется и в UI (для подсветки), и в логике автопропуска тайла.
 */
export const getValidPlacementCells = (
  drawnTile: Tile,
  board: Map<string, any>
): Set<string> => {
  const validSet = new Set<string>();
  const directions = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

  for (const existing of board.values()) {
    for (const { dx, dy } of directions) {
      const nx = existing.x + dx;
      const ny = existing.y + dy;
      const cellKey = `${nx},${ny}`;
      if (board.has(cellKey)) continue;

      for (const rot of [0, 90, 180, 270] as const) {
        const rotatedFeatures = rotateFeatures(drawnTile.features, rot);
        if (isValidPlacement(board, nx, ny, rotatedFeatures)) {
          validSet.add(cellKey);
          break; // Достаточно одного валидного поворота для этой клетки
        }
      }
    }
  }

  return validSet;
};


/**
 * 🌟 Возвращает массив валидных поворотов для тайла на конкретной позиции.
 * Используется при примерке тайла — чтобы знать, какие повороты доступны.
 * 
 * @param tile Тайл из руки
 * @param board Текущая доска
 * @param x Координата X для установки
 * @param y Координата Y для установки
 * @returns Массив валидных поворотов (0, 90, 180, 270). Может быть пустым.
 */
export function getValidRotations(
  tile: Tile,
  board: Map<string, PlacedTile>,
  x: number,
  y: number
): (0 | 90 | 180 | 270)[] {
  const rotations: (0 | 90 | 180 | 270)[] = [];
  
  for (const rotation of [0, 90, 180, 270] as const) {
    const rotatedFeatures = rotateFeatures(tile.features, rotation);
    
    if (isValidPlacement(board, x, y, rotatedFeatures)) {
      rotations.push(rotation);
    }
  }
  
  console.log(
    `🔄 [TileUtils] getValidRotations для ${tile.id} в (${x}, ${y}): ` +
    `валидных поворотов: ${rotations.length}/4 [${rotations.join(', ')}°]`
  );
  
  return rotations;
}

/**
 * 🌟 Применяет тайл к доске и RegionManager.
 * Возвращает новый board и новый RM с объединёнными регионами.
 * 
 * Используется в:
 * - placeTile (окончательная установка)
 * - startPreview (создание previewRM)
 * - rotatePreview (пересоздание previewRM)
 */
export function applyTileToBoardAndRM(
  board: Map<string, PlacedTile>,
  regionManager: RegionManager,
  tile: Tile,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270
): { newBoard: Map<string, PlacedTile>; newRM: RegionManager } {
  const rotatedFeatures = rotateFeatures(tile.features, rotation);

  // 🌟 Новый board
  const newBoard = new Map(board);
  newBoard.set(`${x},${y}`, {
    templateId: tile.id,
    x, y, rotation,
    features: rotatedFeatures,
    derivedSides: getTileSides({ ...tile, features: rotatedFeatures }),
  });

  // 🌟 Новый RM с объединёнными регионами
  const newRM = regionManager.clone();
  
  for (const feature of rotatedFeatures) {
    const featureKey: FeatureKey = `${x},${y}:${feature.id}`;
    newRM.makeSet(featureKey, feature.type, (feature as any).hasShield ?? false);
  }

  for (const { dx, dy, matchKey } of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    const neighborTile = newBoard.get(`${nx},${ny}`);
    if (!neighborTile) continue;

    const matches = BOUNDARY_MATCHES[matchKey];
    for (const { my: myDir, their: theirDir } of matches) {
      const myFeat = rotatedFeatures.find(f => f.directions.includes(myDir));
      const theirFeat = neighborTile.features.find(f => f.directions.includes(theirDir));

      if (myFeat && theirFeat && myFeat.type === theirFeat.type) {
        newRM.union(`${x},${y}:${myFeat.id}`, `${nx},${ny}:${theirFeat.id}`);
      }
    }
  }

  return { newBoard, newRM };
}

/**
 * 💀 Находит все "мёртвые" клетки — пустые клетки-кандидаты,
 * в которые ни один тайл из колоды не может быть поставлен
 * (ни в одном из 4 поворотов).
 * 
 * Используется для подсветки клеток, куда уже нельзя поставить тайл
 * до конца игры.
 * 
 * @param board Текущая доска
 * @param deck Оставшаяся колода тайлов
 * @returns Set координат "мёртвых" клеток в формате "x,y"
 */
export function findDeadCells(
  board: Map<string, PlacedTile>,
  deck: Tile[]
): Set<string> {
  // 🌟 Если колода пуста — все пустые клетки мёртвые
  if (deck.length === 0) {
    const emptyNeighbors = new Set<string>();
    for (const tile of board.values()) {
      for (const { dx, dy } of NEIGHBOR_OFFSETS) {
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        const key = `${nx},${ny}`;
        if (!board.has(key)) {
          emptyNeighbors.add(key);
        }
      }
    }
    console.log(`💀 [TileUtils] Колода пуста — все ${emptyNeighbors.size} соседей мёртвые`);
    return emptyNeighbors;
  }
  
  // 🌟 ШАГ 1: Собираем все пустые клетки-кандидаты (соседи существующих тайлов)
  const candidateCells = new Set<string>();
  for (const tile of board.values()) {
    for (const { dx, dy } of NEIGHBOR_OFFSETS) {
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      const key = `${nx},${ny}`;
      if (!board.has(key)) {
        candidateCells.add(key);
      }
    }
  }
  
  // 🌟 ШАГ 2: Для каждой клетки проверяем все тайлы × все повороты
  const deadCells = new Set<string>();
  
  for (const cellKey of candidateCells) {
    const [xStr, yStr] = cellKey.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    
    let canBePlaced = false;
    
    // 🌟 Перебираем все тайлы в колоде
    for (const tile of deck) {
      // 🌟 Перебираем все 4 поворота
      for (const rotation of [0, 90, 180, 270] as const) {
        const rotatedFeatures = rotateFeatures(tile.features, rotation);
        
        if (isValidPlacement(board, x, y, rotatedFeatures)) {
          canBePlaced = true;
          break; // 🌟 РАННИЙ ВЫХОД: нашли подходящий тайл
        }
      }
      
      if (canBePlaced) break; // 🌟 РАННИЙ ВЫХОД: клетка жива
    }
    
    if (!canBePlaced) {
      deadCells.add(cellKey);
    }
  }
  
  console.log(
    `💀 [TileUtils] Найдено мёртвых клеток: ${deadCells.size} из ${candidateCells.size} кандидатов ` +
    `(колода: ${deck.length} тайлов)`
  );
  
  return deadCells;
}