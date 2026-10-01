// packages/client/src/core/tileDataLoader.ts
// ============================================
// 🔄 ДИНАМИЧЕСКАЯ ЗАГРУЗКА ТАЙЛОВ ДЛЯ ПЕСОЧНИЦЫ
// ============================================
// Использует ?url импорт + fetch, чтобы:
//   • Не зависеть от ESM-кеша Vite
//   • Получать свежий JSON при каждом обновлении
//   • Не триггерить full page reload
// ============================================
import type { Tile } from '@fiefdom/shared/core/types';
// 🌟 ?url возвращает URL к JSON-файлу, а не его содержимое
import tilesJsonUrl from '@fiefdom/shared/data/base.json?url';

// ============================================
// 📦 ВНУТРЕННЕЕ СОСТОЯНИЕ
// ============================================
let currentTiles: Tile[] = [];
const listeners = new Set<() => void>();
let lastEtag: string | null = null;

function notify(): void {
    for (const listener of listeners) {
        listener();
    }
}

// ============================================
// 📥 ЗАГРУЗКА ЧЕРЕЗ FETCH
// ============================================
async function loadTiles(): Promise<void> {
    try {
        // Добавляем cache-buster, чтобы браузер не кешировал
        const url = `${tilesJsonUrl}?t=${Date.now()}`;
        const response = await fetch(url, {
            // Условный запрос: если ETag совпадает — сервер вернёт 304
            headers: lastEtag ? { 'If-None-Match': lastEtag } : {},
        });

        if (response.status === 304) {
            // Данные не изменились — ничего не делаем
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // Сохраняем новый ETag для условных запросов
        lastEtag = response.headers.get('etag');

        const data = await response.json();
        if (data?.tiles) {
            currentTiles = data.tiles as Tile[];
            console.log(`🔄 [TileLoader] Загружено ${currentTiles.length} тайлов`);
            notify();
        }
    } catch (err) {
        console.error('❌ [TileLoader] Ошибка загрузки:', err);
    }
}

// ============================================
// 🔥 HMR: перезагружаем данные при изменении JSON
// ============================================
if (import.meta.hot) {
    // Слушаем изменения URL ассета
    import.meta.hot.accept(() => {
        console.log('🔥 [TileLoader] URL base.json обновлён — перезагрузка данных');
        loadTiles();
    });
}

// ============================================
// ⏱️ POLLING (страховка на случай, если HMR не сработал)
// ============================================
// В dev-режиме опрашиваем файл каждые 2 секунды
if (import.meta.env.DEV) {
    setInterval(() => {
        loadTiles();
    }, 2000);
}

// Начальная загрузка
loadTiles();

// ============================================
// 📤 PUBLIC API
// ============================================
export function getTiles(): Tile[] {
    return currentTiles;
}

export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function reloadTiles(): void {
    loadTiles();
}