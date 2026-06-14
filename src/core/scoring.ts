// core/scoring.ts

import { RegionManager, type FeatureKey } from './regionManager';
import type { PlacedTile } from './types';
import { TILE_DEFINITIONS } from './tileData';

/**
 * Проверяет, завершён ли регион дороги.
 * @param board Карта всех размещенных тайлов.
 * @param rm Экземпляр RegionManager.
 * @param rootKey Корневой ключ (ID) региона дороги.
 * @returns true, если регион завершён, иначе false.
 */
export function checkRoadCompleteness(
  board: Map<string, PlacedTile>,
  rm: RegionManager,
  rootKey: FeatureKey
): boolean {
  const meta = rm.getMetadata(rootKey);
  if (!meta || meta.type !== 'road') return false;

  console.log(`🔍 [Scoring] Проверяем завершение дороги для региона с корнем ${rootKey}.`);

  // Проходим по всем фичам, входящим в регион
  for (const featureKey of meta.featureKeys) {
    const [tileCoord, featureId] = featureKey.split(':');
    const [xStr, yStr] = tileCoord.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);

    const placedTile = board.get(`${x},${y}`);
    if (!placedTile) continue; // Не должно происходить, если DSU согласован

    // Находим конкретную фичу в тайле по её ID
    const feature = placedTile.features.find(f => f.id === featureId);
    if (!feature || feature.type !== 'road') continue;

    // Проверяем каждую *внешнюю* сторону этой фичи
    // Стороны, которые могут быть "концом" дороги (N, E, S, W), исключаем 'C'
    const externalDirections = feature.directions.filter(dir => dir !== 'C');

    for (const extDir of externalDirections) {
      let neighborX = x;
      let neighborY = y;
      let oppositeDir: string = '';

      // Определим координаты соседа и противоположную сторону
      switch (extDir) {
        case 'N':
          neighborY--;
          oppositeDir = 'S';
          break;
        case 'E':
          neighborX++;
          oppositeDir = 'W';
          break;
        case 'S':
          neighborY++;
          oppositeDir = 'N';
          break;
        case 'W':
          neighborX--;
          oppositeDir = 'E';
          break;
        // Добавьте другие внешние стороны, если используются
        default:
          continue; // Игнорируем 'C' и неизвестные
      }

      const neighborKey = `${neighborX},${neighborY}`;
      const neighborTile = board.get(neighborKey);

      // Если соседа нет, это открытый конец -> дорога не завершена
      if (!neighborTile) {
        console.log(
          `🐛 [Scoring] Открытый конец дороги на (${x},${y}), сторона ${extDir} -> (${neighborX},${neighborY})`
        );
        return false;
      }

      // Проверим, есть ли дорога на противоположной стороне у соседа
      let isConnected = false;
      const neighborFeature = neighborTile.features.find(f => f.directions.includes(oppositeDir as any));
      if (neighborFeature && neighborFeature.type === 'road') {
        isConnected = true;
      }

      if (!isConnected) {
        console.log(
          `🐛 [Scoring] Конец дороги на (${x},${y}), сторона ${extDir} не соединён с дорогой у соседа (${neighborX},${neighborY}).`
        );
        return false; // Найден незакрытый конец
      }
      // Если isConnected = true, этот конец закрыт, переходим к следующему
    }
    // Продолжаем проверку для других фич типа road в этом же тайле, если они есть в регионе
  }

  // Если все проверенные внешние концы дороги в регионе соединены, регион завершён
  console.log(`✅ [Scoring] Регион дороги с корнем ${rootKey} завершён.`);
  return true;
}

// --- Аналогичные функции для других типов регионов (город, поле) будут добавлены позже ---
// export function checkCityCompleteness(...) { ... }
// export function calculateRoadPoints(segments: number, hasShield: boolean): number { ... }
// export function calculateCityPoints(segments: number, hasShield: boolean): number { ... }
// export function calculateFieldPoints(cities: number): number { ... }
// export function processCompletedRegions(...) { ... }
// export function returnMeeples(...) { ... }
