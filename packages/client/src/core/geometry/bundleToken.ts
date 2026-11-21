// packages/client/src/core/geometry/bundleToken.ts
// ============================================
// 🔖 ТОКЕН БАНДЛА: ИДЕНТИЧНОСТЬ ГЕОМЕТРИИ ТАЙЛА
// ============================================
// Кэши регионов (поля, стены городов) ключуются по составу клеток и параметрам меша.
// Если геометрия тайла изменилась, а id тайла остался прежним (шум, тесселяция, формы
// в песочнице), такой ключ совпадает со старым, и кэш отдаёт устаревший меш.
//
// Токен — короткая строка, уникальная для объекта бандла: пока бандл тот же (его кэш по хэшу
// параметров вернул прежний объект), токен тот же, а новая геометрия даёт новый токен.
// Подмешивается в tileId клетки при сборке регионов.
// ============================================

const tokens = new WeakMap<object, number>();
let counter = 0;

export function bundleToken(bundle: object): string {
    let token = tokens.get(bundle);
    if (token === undefined) {
        token = ++counter;
        tokens.set(bundle, token);
    }
    return `g${token}`;
}

/** id тайла с токеном его геометрии: для поля tileId клетки в регионах */
export const geometryTileId = (tileId: string, bundle: object): string => `${tileId}~${bundleToken(bundle)}`;
