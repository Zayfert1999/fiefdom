// core/scoring.ts
import { RegionManager, type FeatureKey } from './regionManager';
import type { PlacedTile, FeatureType } from './types';
import { TILE_DEFINITIONS } from './tileData';

/**
 * 🌟 Универсальная проверка замкнутости региона
 */
export function checkRegionCompleteness(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  rootKey: FeatureKey,
  featureType: FeatureType
): boolean {
  const meta = rm.getMetadata(rootKey);
  if (!meta || meta.type !== featureType) return false;

  for (const featureKey of meta.featureKeys) {
    const [tileCoord, featureId] = featureKey.split(':');
    const [xStr, yStr] = tileCoord.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    const placedTile = board.get(`${x},${y}`);

    if (!placedTile) continue;

    const feature = placedTile.features.find(f => f.id === featureId);
    if (!feature || feature.type !== featureType) continue;

    const externalDirections = feature.directions.filter(dir => dir !== 'C');

    for (const extDir of externalDirections) {
      let neighborX = x;
      let neighborY = y;
      let oppositeDir: string = '';

      switch (extDir) {
        case 'N': neighborY--; oppositeDir = 'S'; break;
        case 'E': neighborX++; oppositeDir = 'W'; break;
        case 'S': neighborY++; oppositeDir = 'N'; break;
        case 'W': neighborX--; oppositeDir = 'E'; break;
        default: continue;
      }

      const neighborKey = `${neighborX},${neighborY}`;
      const neighborTile = board.get(neighborKey);

      if (!neighborTile) return false;

      const neighborFeature = neighborTile.features.find(
        f => f.directions.includes(oppositeDir as any) && f.type === featureType
      );

      if (!neighborFeature) return false;
    }
  }

  return true;
}

/**
 * 🌟 Универсальный подсчёт очков за регион
 * 
 * @param isEndGame Если true — очки НЕ удваиваются (для конца игры)
 */
export function calculateRegionPoints(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  rootKey: FeatureKey,
  isEndGame: boolean = false
): number {
  const meta = rm.getMetadata(rootKey);
  if (!meta) return 0;

  switch (meta.type) {
    case 'road':
      return calculateRoadPoints(board, rm, rootKey, isEndGame);
    case 'city':
      return calculateCityPoints(board, rm, rootKey, isEndGame);
    case 'field':
      return calculateFieldPoints(board, rm, rootKey);
    case 'monastery':
      return calculateMonasteryPointsForRegion(board, rootKey);
    default:
      return 0;
  }
}

/**
 * 🌟 Подсчёт очков за дорогу
 */
function calculateRoadPoints(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  rootKey: FeatureKey,
  isEndGame: boolean = false
): number {
  const meta = rm.getMetadata(rootKey);
  if (!meta || meta.type !== 'road') return 0;

  const uniqueTiles = new Set<string>();
  for (const featureKey of meta.featureKeys) {
    const [tileCoord] = featureKey.split(':');
    uniqueTiles.add(tileCoord);
  }

  const basePoints = uniqueTiles.size;

  const totalPoints = uniqueTiles.size;
  const isComplete = checkRegionCompleteness(board, rm, rootKey, 'road');

  console.log(`🛣️ [Scoring] Дорога ${rootKey}: ${basePoints} тайлов, замкнута: ${isComplete}, endGame: ${isEndGame}, очки: ${totalPoints}`);
  return totalPoints;
}

/**
 * 🌟 Подсчёт очков за город
 */
function calculateCityPoints(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  rootKey: FeatureKey,
  isEndGame: boolean = false
): number {
  const meta = rm.getMetadata(rootKey);
  if (!meta || meta.type !== 'city') return 0;

  let basePoints = 0;
  const processedTiles = new Set<string>();

  for (const featureKey of meta.featureKeys) {
    const [tileCoord, featureId] = featureKey.split(':');

    if (processedTiles.has(tileCoord)) continue;
    processedTiles.add(tileCoord);

    const [xStr, yStr] = tileCoord.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    const placedTile = board.get(`${x},${y}`);

    if (!placedTile) continue;

    const feature = placedTile.features.find(f => f.id === featureId);
    if (!feature || feature.type !== 'city') continue;

    const tileDef = TILE_DEFINITIONS.find(def => def.id === placedTile.templateId);
    const hasShield = tileDef?.features.some(
      f => f.id === featureId && f.hasShield === true
    );

    basePoints += hasShield ? 2 : 1;
  }

  const isComplete = checkRegionCompleteness(board, rm, rootKey, 'city');
  // 🌟 В середине игры завершённые города удваиваются, в конце — нет
  const totalPoints = (!isEndGame && isComplete) ? basePoints * 2 : basePoints;

  console.log(`🏰 [Scoring] Город ${rootKey}: базовые очки: ${basePoints}, замкнут: ${isComplete}, endGame: ${isEndGame}, итого: ${totalPoints}`);
  return totalPoints;
}

/**
 * 🌟 Поиск всех городов, граничащих с полем
 * Экспортируется для использования в DebugPanel
 * 
 * Поле граничит с городом ТОЛЬКО через adjacentCities на том же тайле.
 * Если поле в тайле A соединено через DSU с полем в тайле B,
 * и поле B граничит с городом — то весь регион поля получает очки за этот город.
 * 
 * @returns Map<cityRootKey, isComplete> — ключ города и флаг его завершённости
 */
export function getAdjacentCitiesForField(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  rootKey: FeatureKey
): Map<string, boolean> {
  const meta = rm.getMetadata(rootKey);
  if (!meta || meta.type !== 'field') return new Map();

  const adjacentCities = new Map<string, boolean>();

  // 🌟 Проходим по всем фичам поля в регионе (уже объединены через DSU)
  for (const featureKey of meta.featureKeys) {
    const [tileCoord, featureId] = featureKey.split(':');
    const [xStr, yStr] = tileCoord.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    const placedTile = board.get(`${x},${y}`);
    if (!placedTile) continue;

    const fieldFeature = placedTile.features.find(f => f.id === featureId);
    if (!fieldFeature || fieldFeature.type !== 'field') continue;

    // 🌟 Проверяем adjacentCities на этом поле
    // Это единственный способ, которым поле может граничить с городом
    if (fieldFeature.adjacentCities) {
      for (const cityId of fieldFeature.adjacentCities) {
        const cityFeatureKey = `${x},${y}:${cityId}`;
        const cityRoot = rm.find(cityFeatureKey);
        if (cityRoot) {
          // Проверяем завершённость города и сохраняем результат
          const isComplete = checkRegionCompleteness(board, rm, cityRoot, 'city');
          adjacentCities.set(cityRoot, isComplete);
        }
      }
    }
  }

  return adjacentCities;
}

/**
 * 🌟 Подсчёт очков за поле
 * 3 очка за каждый замкнутый город, граничащий с полем
 * 
 * Поле граничит с городом ТОЛЬКО через adjacentCities на том же тайле.
 * Если поле в тайле A соединено через DSU с полем в тайле B,
 * и поле B граничит с городом — то весь регион поля получает очки за этот город.
 */
function calculateFieldPoints(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  rootKey: FeatureKey
): number {
  const meta = rm.getMetadata(rootKey);
  if (!meta || meta.type !== 'field') return 0;

  // 🌟 Используем вынесенную функцию
  const adjacentCities = getAdjacentCitiesForField(board, rm, rootKey);

  let completedCities = 0;
  for (const isComplete of adjacentCities.values()) {
    if (isComplete) completedCities++;
  }

  const points = completedCities * 3;
  console.log(`🌾 [Scoring] Поле ${rootKey}: граничит с ${adjacentCities.size} городами, замкнуто: ${completedCities}, очки: ${points}`);
  return points;
}

/**
 * Проверка завершённых регионов на конкретном тайле
 * Возвращает список завершённых регионов с их данными
 */
export interface CompletedRegion {
  rootKey: FeatureKey;
  type: FeatureType;
  points: number;
  winners: string[]; // ID игроков-победителей
  allMeepleOwners: string[]; // ID всех игроков с миплами в регионе
  featureKeys: string[]; // Все featureKey в регионе
}

/**
 * 🌟 Формирует CompletedRegion из rootKey.
 * Единый источник истины для формирования данных региона.
 * 
 * Используется и в середине игры (findCompletedRegionsOnTile),
 * и в конце игры (findAllIncompleteRegionsWithMeeples).
 */
export function buildCompletedRegion(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  rootKey: FeatureKey,
  isEndGame: boolean = false
): CompletedRegion | null {
  const meta = rm.getMetadata(rootKey);
  if (!meta) return null;

  // Очки считаются универсальной функцией
  const points = calculateRegionPoints(board, rm, rootKey, isEndGame);

  // Находим победителей (доминантов)
  const counts = Array.from(meta.meepleCounts.values());
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;

  // Если нет миплов — регион всё равно может быть завершён (для анимации)
  const winners = maxCount > 0
    ? Array.from(meta.meepleCounts.entries())
      .filter(([_, count]) => count === maxCount)
      .map(([ownerId]) => ownerId)
    : [];

  const allMeepleOwners = Array.from(meta.meepleCounts.keys());

  return {
    rootKey,
    type: meta.type,
    points,
    winners,
    allMeepleOwners,
    featureKeys: [...meta.featureKeys],
  };
}

export function findCompletedRegionsOnTile(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  tile: PlacedTile
): CompletedRegion[] {
  const completed: CompletedRegion[] = [];
  const processedRoots = new Set<string>();

  // ============================================
  // 🛣️ ШАГ 1: Дороги и города
  // Проверяем только фичи последнего тайла
  // ============================================
  for (const feature of tile.features) {
    // 🌟 В середине игры обрабатываем только дороги, города и монастыри
    if (feature.type !== 'road' && feature.type !== 'city' && feature.type !== 'monastery') continue;

    const featureKey: FeatureKey = `${tile.x},${tile.y}:${feature.id}`;
    const rootKey = rm.find(featureKey);

    if (!rootKey || processedRoots.has(rootKey)) continue;
    processedRoots.add(rootKey);

    const meta = rm.getMetadata(rootKey);
    if (!meta || meta.isComplete) continue;

    let isComplete = false;
    if (feature.type === 'monastery') {
      // ✅ Используем одну функцию — она сама определяет завершённость
      const { isComplete: monasteryComplete } = calculateMonasteryPoints(board, tile.x, tile.y);
      isComplete = monasteryComplete;
    } else {
      isComplete = checkRegionCompleteness(board, rm, rootKey, feature.type);
    }

    if (!isComplete) continue;

    // 🌟 Используем общую функцию
    const region = buildCompletedRegion(board, rm, rootKey, false);
    if (region) completed.push(region);

    console.log(`✅ [Scoring] Регион ${feature.type} с корнем ${rootKey} завершён`);
  }

  // ============================================
  // ⛪ ШАГ 2: Монастыри
  // Проверяем сам тайл + все 8 соседей
  // Монастырь может завершиться от установки ЛЮБОГО соседнего тайла
  // ============================================
  const positionsToCheck: Array<[number, number]> = [
    [tile.x, tile.y],           // сам тайл (если там монастырь)
    [tile.x - 1, tile.y - 1],   // NW
    [tile.x, tile.y - 1],       // N
    [tile.x + 1, tile.y - 1],   // NE
    [tile.x - 1, tile.y],       // W
    [tile.x + 1, tile.y],       // E
    [tile.x - 1, tile.y + 1],   // SW
    [tile.x, tile.y + 1],       // S
    [tile.x + 1, tile.y + 1],   // SE
  ];

  for (const [x, y] of positionsToCheck) {
    const neighborTile = board.get(`${x},${y}`);
    if (!neighborTile) continue;

    // Ищем фичи типа 'monastery' в этом тайле
    for (const feature of neighborTile.features) {
      if (feature.type !== 'monastery') continue;

      const featureKey: FeatureKey = `${x},${y}:${feature.id}`;
      const rootKey = rm.find(featureKey);

      if (!rootKey || processedRoots.has(rootKey)) continue;
      processedRoots.add(rootKey);

      const meta = rm.getMetadata(rootKey);
      if (!meta || meta.isComplete) continue;

      // Монастырь завершён, если все 8 соседей на месте
      const { isComplete, points } = calculateMonasteryPoints(board, x, y);
      if (!isComplete) continue;

      // 🌟 Используем общую функцию
      const region = buildCompletedRegion(board, rm, rootKey, false);
      if (region) completed.push(region);


      console.log(`✅ [Scoring] Монастырь на (${x},${y}) завершён (+${region?.points} очков)`);

    }
  }

  return completed;
}

/**
 * 🌟 Находит все незавершённые регионы с миплами (для конца игры).
 * 
 * В отличие от findCompletedRegionsOnTile:
 * - Итерирует ВСЕ тайлы, а не только последний
 * - Включает поля (которые не обрабатываются в середине игры)
 * - Использует isEndGame=true для подсчёта очков
 */
export function findAllIncompleteRegionsWithMeeples(
    board: Map<string, PlacedTile>,
    rm: RegionManager,
): CompletedRegion[] {
    const regions: CompletedRegion[] = [];
    const processedRoots = new Set<string>();

    for (const tile of board.values()) {
        for (const feature of tile.features) {
            const featureKey: FeatureKey = `${tile.x},${tile.y}:${feature.id}`;
            const rootKey = rm.find(featureKey);

            if (!rootKey || processedRoots.has(rootKey)) continue;
            processedRoots.add(rootKey);

            const meta = rm.getMetadata(rootKey);
            if (!meta) continue;
            if (meta.isComplete) continue;
            if (meta.meepleCounts.size === 0) continue;

            // 🌟 Используем общую функцию с isEndGame=true
            const region = buildCompletedRegion(board, rm, rootKey, true);
            if (region) {
                regions.push(region);
                console.log(`🏆 [Scoring] EndGame: ${meta.type} ${rootKey} → ${region.points} очков`);
            }
        }
    }

    return regions;
}

/**
 * 🌟 Подсчёт очков за монастырь
 * 1 очко за сам монастырь + 1 очко за каждый окружающий тайл (максимум 9)
 * 
 * Завершённость определяется как points === 9 (все 8 соседей на месте)
 */
export function calculateMonasteryPoints(
  board: Map<string, PlacedTile>,
  x: number,
  y: number
): { points: number; isComplete: boolean } {
  // 🌟 8 направлений: N, NE, E, SE, S, SW, W, NW
  const neighbors = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1]
  ];

  let points = 1; // сам монастырь

  for (const [dx, dy] of neighbors) {
    if (board.has(`${x + dx},${y + dy}`)) {
      points++;
    }
  }

  const isComplete = points === 9;
  console.log(`⛪ [Scoring] Монастырь на (${x},${y}): ${points - 1} соседей, очки: ${points}, завершён: ${isComplete}`);

  return { points, isComplete };
}

function calculateMonasteryPointsForRegion(
  board: Map<string, PlacedTile>,
  rootKey: FeatureKey
): number {
  const [tileCoord] = rootKey.split(':');
  const [xStr, yStr] = tileCoord.split(',');
  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);

  return calculateMonasteryPoints(board, x, y).points;
}

