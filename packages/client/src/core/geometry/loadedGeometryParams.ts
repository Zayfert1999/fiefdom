// packages/client/src/core/geometry/loadedGeometryParams.ts
// ============================================
// 📂 ЗАГРУЖЕННЫЕ ПАРАМЕТРЫ ГЕОМЕТРИИ
// ============================================
// Читает geometryParams.json, проверяет и достраивает значениями
// по умолчанию. Это «истина по умолчанию» для игры, песочницы и тестов.
//
// HMR: модуль принимает собственные обновления и не проталкивает их
// выше. Когда песочница пишет файл на диск, страница не перезагружается,
// а состояние песочницы остаётся источником правды до перезагрузки.
// ============================================
import rawParams from './geometryParams.json';
import { parseGeometryParams, type GeometryParams } from './geometryParams';

const parsed = parseGeometryParams(rawParams);

if (parsed.warnings.length > 0) {
    console.warn(
        `⚠️ [GeometryParams] geometryParams.json: ${parsed.warnings.length} замечаний\n` +
        parsed.warnings.map((w) => `  • ${w}`).join('\n')
    );
}

export const GEOMETRY_PARAMS: Readonly<GeometryParams> = parsed.params;
export const GEOMETRY_PARAMS_WARNINGS: readonly string[] = parsed.warnings;

/** Путь файла относительно packages/client (для подсказок в интерфейсе) */
export const GEOMETRY_PARAMS_FILE = 'src/core/geometry/geometryParams.json';

if (import.meta.hot) {
    import.meta.hot.accept();
}
