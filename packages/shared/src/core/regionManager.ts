// core/regionManager.ts
import type { FeatureType } from './types';
import type { SerializedRegionManager, SerializedRegionMetadata, } from './serialization';

export type FeatureKey = string;

export interface RegionMetadata {
  type: FeatureType;
  owners: Set<string>; // ID игроков (всех, кто когда-либо ставил мипла)
  segments: number; // Количество тайлов/сегментов
  hasShield: boolean;
  featureKeys: Set<FeatureKey>; // Все ключи фич, входящих в регион
  // --- Новое поле для миплов ---
  meepleCounts: Map<string, number>; // ID игрока -> количество миплов в регионе
  // ----------------------------
  // --- Поле для статуса завершения ---
  isComplete: boolean; // Пометка, завершён ли регион
  points: number;      // Очки, начисленные за регион
  // ----------------------------------------------------------
}

export class RegionManager {
  private parent = new Map<FeatureKey, FeatureKey>();
  private metadata = new Map<FeatureKey, RegionMetadata>();

  makeSet(key: FeatureKey, type: FeatureType, hasShield: boolean = false) {
    if (this.parent.has(key)) return;
    this.parent.set(key, key);
    this.metadata.set(key, {
      type,
      owners: new Set<string>(),
      segments: 1,
      hasShield,
      featureKeys: new Set([key]),
      // --- Инициализация новых полей ---
      meepleCounts: new Map<string, number>(), // Инициализируем как Map
      isComplete: false,
      points: 0,
      // -------------------------------
    });
  }

  find(key: FeatureKey): FeatureKey | undefined {
    if (!this.parent.has(key)) return undefined;
    let root = key;
    while (root !== this.parent.get(root)) {
      root = this.parent.get(root)!;
    }
    let curr = key;
    while (curr !== root) {
      const nxt = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = nxt;
    }
    return root;
  }

  union(key1: FeatureKey, key2: FeatureKey) {
    const root1 = this.find(key1);
    const root2 = this.find(key2);
    if (!root1 || !root2 || root1 === root2) return;

    const meta1 = this.metadata.get(root1)!;
    const meta2 = this.metadata.get(root2)!;

    this.parent.set(root2, root1);

    const combinedOwners = new Set([...meta1.owners, ...meta2.owners]);
    const combinedFeatureKeys = new Set([...meta1.featureKeys, ...meta2.featureKeys]);

    // --- Объединение meepleCounts ---
    const combinedMeepleCounts = new Map(meta1.meepleCounts);
    for (const [playerId, count] of meta2.meepleCounts) {
      combinedMeepleCounts.set(playerId, (combinedMeepleCounts.get(playerId) || 0) + count);
    }
    // -----------------------------

    const newMeta: RegionMetadata = {
      type: meta1.type,
      owners: combinedOwners,
      segments: meta1.segments + meta2.segments,
      hasShield: meta1.hasShield || meta2.hasShield,
      featureKeys: combinedFeatureKeys,
      // --- Обновление новых полей ---
      meepleCounts: combinedMeepleCounts, // Объединяем миплы
      isComplete: meta1.isComplete || meta2.isComplete,
      points: meta1.points + meta2.points, // Суммируем очки (если нужно, можно пересчитать при завершении)
      // -------------------------------
    };

    this.metadata.set(root1, newMeta);
    this.metadata.delete(root2);
  }

  addOwner(key: FeatureKey, playerId: string) {
    const root = this.find(key);
    if (root) {
      const meta = this.metadata.get(root)!;
      meta.owners.add(playerId);
    } else {
      console.warn(`⚠️ [RegionManager] Попытка добавить владельца к несуществующему региону: ${key}`);
    }
  }

  // --- НОВЫЙ/ОБНОВЛЁННЫЙ МЕТОД: Добавить мипла в регион ---
  addMeeple(key: FeatureKey, meepleId: string) {
    // В данной реализации, meepleId будет равен playerId
    // Если у тебя будет уникальный ID мипла, придётся хранить отдельный Map: meepleId -> playerId
    const playerId = meepleId;
    const root = this.find(key);
    if (root) {
      const meta = this.metadata.get(root)!;
      meta.meepleCounts.set(playerId, (meta.meepleCounts.get(playerId) || 0) + 1);
      // console.log(`🐛 [RegionManager] Мипл ${meepleId} (игрок ${playerId}) добавлен в регион ${key} (корень: ${root}). Миплы: ${JSON.stringify(Object.fromEntries(meta.meepleCounts))}`); // DEBUG
    } else {
      console.warn(`⚠️ [RegionManager] Попытка добавить мипла к несуществующему региону: ${key}`);
    }
  }
  // -----------------------------------------

  getFeatureOwners(featureKey: FeatureKey): string[] {
    const root = this.find(featureKey);
    if (!root) return [];
    const meta = this.metadata.get(root);
    return meta ? Array.from(meta.owners) : [];
  }

  // --- ОБНОВЛЁННЫЙ МЕТОД: Получить метаданные региона ---
  getMetadata(featureKey: FeatureKey): RegionMetadata | undefined {
    const root = this.find(featureKey);
    if (!root) return undefined;
    return this.metadata.get(root);
  }
  // -----------------------------------------------

  // --- ОБНОВЛЁННЫЙ МЕТОД: Пометить регион как завершённый ---
  markComplete(key: FeatureKey, points: number) {
    const root = this.find(key);
    if (!root) return;

    const meta = this.metadata.get(root);
    if (meta) {
      meta.isComplete = true;
      meta.points = points; // Присваиваем очки
      console.log(`✅ [RegionManager] Регион ${Array.from(meta.featureKeys)[0]} помечен как завершённый. Очков: ${points}. Владельцы: ${Array.from(meta.owners)}. Миплы (игрок -> кол-во): ${JSON.stringify(Object.fromEntries(meta.meepleCounts))}`);
    } else {
      console.warn(`⚠️ [RegionManager] Не найдены метаданные для завершения региона: ${key}`);
    }
  }

  clone(): RegionManager {
    const copy = new RegionManager();
    copy.parent = new Map(this.parent);
    copy.metadata = new Map(
      Array.from(this.metadata.entries()).map(([key, meta]) => [
        key,
        {
          type: meta.type,
          hasShield: meta.hasShield,
          segments: meta.segments,
          isComplete: meta.isComplete,
          points: meta.points,
          owners: new Set(meta.owners),
          featureKeys: new Set(meta.featureKeys),
          meepleCounts: new Map(meta.meepleCounts),
        }
      ])
    );
    return copy;
  }

  // ============================================
  // СЕРИАЛИЗАЦИЯ
  // Преобразует Map/Set в Record/Array для JSON
  // ============================================
  serialize(): SerializedRegionManager {
    const parent: Record<string, string> = {};
    this.parent.forEach((value, key) => {
      parent[key] = value;
    });

    const metadata: Record<string, SerializedRegionMetadata> = {};
    this.metadata.forEach((meta, key) => {
      const meepleCounts: Record<string, number> = {};
      meta.meepleCounts.forEach((count, playerId) => {
        meepleCounts[playerId] = count;
      });

      metadata[key] = {
        type: meta.type,
        owners: Array.from(meta.owners),
        segments: meta.segments,
        hasShield: meta.hasShield,
        featureKeys: Array.from(meta.featureKeys),
        meepleCounts,
        isComplete: meta.isComplete,
        points: meta.points,
      };
    });

    console.log(`💾 [RegionManager] Сериализовано: ${Object.keys(parent).length} фич, ${Object.keys(metadata).length} регионов`);
    return { parent, metadata };
  }

  // ============================================
  // ДЕСЕРИАЛИЗАЦИЯ
  // Восстанавливает Map/Set из Record/Array
  // ============================================
  static deserialize(data: SerializedRegionManager): RegionManager {
    const rm = new RegionManager();

    for (const [key, value] of Object.entries(data.parent) as Array<[string, string]>) {
      rm.parent.set(key, value);
    }

    for (const [key, serializedMeta] of Object.entries(data.metadata) as Array<[string, SerializedRegionMetadata]>) {
      const meepleCounts = new Map<string, number>();
      for (const [playerId, count] of Object.entries(serializedMeta.meepleCounts) as Array<[string, number]>) {
        meepleCounts.set(playerId, count);
      }

      rm.metadata.set(key, {
        type: serializedMeta.type,
        owners: new Set(serializedMeta.owners),
        segments: serializedMeta.segments,
        hasShield: serializedMeta.hasShield,
        featureKeys: new Set(serializedMeta.featureKeys),
        meepleCounts,
        isComplete: serializedMeta.isComplete,
        points: serializedMeta.points,
      });
    }

    console.log(`📂 [RegionManager] Десериализовано: ${rm.parent.size} фич, ${rm.metadata.size} регионов`);
    return rm;
  }
}