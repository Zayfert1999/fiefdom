// packages/shared/src/core/tileData.ts
import type { Tile } from './types';
import tileSetData from '../data/base.json';

// ============================================
// 🌟 AMBIENT DECLARATION: Vite HMR
// ============================================
// Vite добавляет `import.meta.hot` в dev-режиме, но TypeScript
// в shared пакете не знает об этом (vite/client не в tsconfig).
// Объявляем минимальный тип локально — только то, что мы используем.
// ============================================
declare global {
    interface ImportMeta {
        readonly hot?: {
            accept(path: string, callback?: (module: unknown) => void): void;
            accept(callback?: (module: unknown) => void): void;
        };
    }
}

// ============================================
// 📦 ОСНОВНЫЕ ЭКСПОРТЫ
// ============================================
export const TILE_DEFINITIONS: Tile[] = tileSetData.tiles as unknown as Tile[];

export const ART_ID_MAP: Record<string, string> = Object.fromEntries(
    TILE_DEFINITIONS.map(def => [def.id, def.artId])
);

// ============================================
// 🔥 HMR: предотвращаем full page reload
// ============================================
// Vite по умолчанию делает full reload при изменении JSON-файлов,
// потому что не знает, как обновить статический импорт.
// Подписываемся на изменения и "принимаем" их — это сигнал Vite:
// "я обработал обновление сам, не перезагружай страницу".
// ============================================
if (import.meta.hot) {
    import.meta.hot.accept(
        '../data/base.json',
        // 🌟 ЯВНО указан тип параметра (unknown вместо any)
        (newModule: unknown) => {
            if (newModule) {
                console.log(
                    '🔥 [tileData] base.json изменён. ' +
                    'TILE_DEFINITIONS остаётся статическим (игра не перезагружается). ' +
                    'Песочница обновит данные самостоятельно.'
                );
            }
        }
    );
}