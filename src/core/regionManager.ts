// core/regionManager.ts
import type { FeatureType } from './types';

export type FeatureKey = string;

export interface RegionMetadata {
  type: FeatureType;
  owners: Set<string>;
  segments: number;
  hasShield: boolean;
  featureKeys: Set<FeatureKey>;
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

    const newMeta: RegionMetadata = {
      type: meta1.type,
      owners: combinedOwners,
      segments: meta1.segments + meta2.segments,
      hasShield: meta1.hasShield || meta2.hasShield,
      featureKeys: new Set([...meta1.featureKeys, ...meta2.featureKeys]),
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

  getFeatureOwners(featureKey: FeatureKey): string[] {
    const root = this.find(featureKey);
    if (!root) return [];
    const meta = this.metadata.get(root);
    return meta ? Array.from(meta.owners) : [];
  }

  // 🐛 НОВЫЙ МЕТОД: Получить метаданные региона (нужен для дебага и подсчёта очков)
  getMetadata(featureKey: FeatureKey): RegionMetadata | undefined {
    const root = this.find(featureKey);
    if (!root) return undefined;
    return this.metadata.get(root);
  }
}