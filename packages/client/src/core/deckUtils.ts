// packages/client/src/core/deckUtils.ts
// 🌟 Вычисление виртуальной колоды на клиенте
// Работает и для локальной, и для сетевой игры

import type { Tile, PlacedTile } from '@carcassonne/shared/core/types';
import { TILE_DEFINITIONS } from '@carcassonne/shared/core/tileData';

/**
 * Создаёт "виртуальную колоду" — список тайлов, которые МОГУТ быть в колоде.
 * Вычисляется как TILE_DEFINITIONS минус поставленные тайлы минус тайл в руке.
 * 
 * В локальной игре можно использовать реальную колоду, но эта функция
 * работает универсально и не раскрывает приватную информацию.
 * 
 * @param board Текущая доска
 * @param drawnTile Тайл в руке (если есть)
 * @param previewTile Тайл в preview (если есть — он тоже "взят" из колоды)
 * @returns Массив тайлов, которые могут быть в колоде
 */
export function getVirtualDeck(
    board: Map<string, PlacedTile>,
    drawnTile?: Tile | null,
): Tile[] {
    // Считаем использованные тайлы каждого типа
    const usedCounts = new Map<string, number>();

    // 1. Тайлы на доске
    for (const tile of board.values()) {
        usedCounts.set(tile.templateId, (usedCounts.get(tile.templateId) || 0) + 1);
    }

    // 2. Тайл в руке
    if (drawnTile) {
        usedCounts.set(drawnTile.id, (usedCounts.get(drawnTile.id) || 0) + 1);
    }

    // Вычисляем остатки
    const virtualDeck: Tile[] = [];
    for (const def of TILE_DEFINITIONS) {
        const used = usedCounts.get(def.id) || 0;
        const remaining = Math.max(0, def.quantity - used);
        for (let i = 0; i < remaining; i++) {
            virtualDeck.push(def);
        }
    }

    return virtualDeck;
}