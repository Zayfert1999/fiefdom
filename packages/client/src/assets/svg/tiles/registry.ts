// Vite автоматически соберёт все SVG из директории ./tiles/
const svgModules = import.meta.glob('./*.svg', {
  eager: true,
  query: '?react', 
  import: 'default'
});

// Преобразуем пути в чистые ID: './tile_RFRF.svg' -> 'tile_RFRF'
export const TileRegistry = Object.fromEntries(
  Object.entries(svgModules).map(([path, Component]) => [
    path.replace('./', '').replace('.svg', ''),
    Component
  ])
) as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>;

export type TileId = keyof typeof TileRegistry;
//Отладка
console.log('🧩 Зарегистрировано тайлов:', Object.keys(TileRegistry));