# sandbox: песочница геометрии (dev-инструмент)

Окно для настройки процедурной геометрии тайлов: тесселяция, шум, площади,
3D-меш, рельеф, городские стены. Параметры сохраняются в
`src/core/geometry/geometryParams.json`.

**Песочница не входит в прод-сборку.** `App.tsx` подключает её только при
`import.meta.env.DEV`; в `vite build` эта ветка вырезается, и чанк песочницы
в `dist` не попадает. Открывается клавишей F2 в главном меню (только в dev).
Запись файла идёт через dev-эндпоинт `/__geometry-params` из `vite.config.ts`
(плагин с `apply: 'serve'`).

## Правила

- Из `src/sandbox/**` можно импортировать что угодно из остального клиента.
- Наоборот нельзя: вне этой папки на `@/sandbox` ссылается только `App.tsx`
  (ленивый dev-импорт). Прод-код, который нужен и песочнице, лежит
  в `core/`, `components/`, `renderer3d/`.

## Карта папки

```
sandbox/
  index.ts                    точка входа (lazy-импорт из App.tsx)
  GeometrySandbox.tsx         оболочка: модалка, вкладки, склейка панелей
  types.ts                    SandboxTile, TileLayers, SandboxViewMode
  state/
    useSandboxParams.ts       GeometryParams, «как в файле», все операции над ними
  params/                     левая панель
    ParamsPanel.tsx           блоки параметров по категориям
    ParamGroup.tsx            ParamGroup / ParamCategory / ParamSection (сворачивание)
    SandboxParamsBar.tsx      сохранить / загрузить / откатить файл параметров
    controls/                 по одному файлу на блок параметров + base.tsx
  view/                       вкладка «Тайл»
    SandboxTileView.tsx       генерация геометрии тайла и раскладка по видам
    TileSvgView.tsx           2D схема
    Tile3DView.tsx            3D меш
    TileDiagnostics.tsx       метрики, споты, аудит
    TileToolbar.tsx           выбор тайла, слои, легенда
    colors.ts, svgHelpers.tsx, CompassLabels.tsx
  board/                      вкладки «Галерея», «2D доска», «3D доска»
    GeometryGallery.tsx, Board3D.tsx, TileGeometryLayers.tsx
```

## Как добавить параметр

1. Поле в `GeometryParams` (`core/geometry/geometryParams.ts`).
2. Контрол в `params/controls/` (или новое поле в существующем).
3. Операция в `state/useSandboxParams.ts` (patch/reset) и в `actions`.
4. Блок в `params/ParamsPanel.tsx`; при необходимости флаг «изменено» в `changed`.
