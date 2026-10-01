// packages/client/src/hooks/useLiveTiles.ts
// ============================================
// 🔄 ХУК ДЛЯ ПОЛУЧЕНИЯ ЖИВЫХ ДАННЫХ ТАЙЛОВ
// ============================================
// Использует useSyncExternalStore для подписки на изменения
// в tileDataLoader. Автоматически обновляется при HMR.
// ============================================
import { useSyncExternalStore } from 'react';
import { getTiles, subscribe } from '@/core/tileDataLoader';
import type { Tile } from '@fiefdom/shared/core/types';

/**
 * Возвращает актуальный массив тайлов.
 * Автоматически обновляется при изменении base.json (через HMR).
 */
export function useLiveTiles(): Tile[] {
    return useSyncExternalStore(subscribe, getTiles, getTiles);
}