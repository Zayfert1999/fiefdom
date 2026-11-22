// packages/client/src/sandbox/view/svgHelpers.tsx
// Мелкие SVG-помощники 2D-вида тайла: координаты портов и отрисовка MultiPolygon.
import { toPathD } from '@/core/geometry';
import type { Port } from '@fiefdom/shared/core/types';
import type { MultiPolygon } from '@fiefdom/shared/core/geometry.types';

// ============================================
// 📍 ГЕОМЕТРИЯ ПОРТОВ ДЛЯ ОТЛАДКИ
// ============================================
// Тайл имеет координаты [-50, 50] × [-50, 50].
// Порты 0..11 распределены по сторонам:
// 0-2  → N
// 3-5  → E
// 6-8  → S
// 9-11 → W
//
// На каждой стороне 3 порта: левый/центральный/правый относительно обхода по часовой.
export const getPortPoint = (port: Port): [number, number] => {
  const side = Math.floor(port / 3);
  const index = port % 3;

  // Три позиции на стороне: -25, 0, +25
  const offset = (index - 1) * 25;

  switch (side) {
    case 0:
      // Север: port 0,1,2
      return [offset, -50];
    case 1:
      // Восток: port 3,4,5
      return [50, offset];
    case 2:
      // Юг: port 6,7,8 — обход справа налево
      return [-offset, 50];
    case 3:
      // Запад: port 9,10,11 — обход снизу вверх
      return [-50, -offset];
    default:
      return [0, 0];
  }
};

// ============================================
// 🛠️ РЕНДЕР MULTI_POLYGON В SVG
// ============================================

interface RenderMultiPolygonOptions {
  keyPrefix: string;
  featureId?: string;
  fill: string;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  generated?: boolean;
  className?: string;
}

export function renderMultiPolygon(
  multi: MultiPolygon | undefined,
  options: RenderMultiPolygonOptions
) {
  if (!multi || multi.length === 0) return null;

  // Сгенерированные фигуры помечаем пунктирной белой обводкой,
  // чтобы визуально отличать procedural geometry от ручной.
  const stroke = options.generated
    ? 'rgba(255,255,255,0.9)'
    : options.stroke ?? 'rgba(255,255,255,0.18)';

  const strokeWidth = options.generated ? 0.7 : options.strokeWidth ?? 0.35;
  const strokeDasharray = options.generated ? '3 2' : undefined;

  return multi.map((polygon, index) => (
    <path
      key={`${options.keyPrefix}-${index}`}
      d={toPathD(polygon)}
      fill={options.fill}
      fillOpacity={options.opacity ?? 0.85}
      fillRule="evenodd"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      className={options.className}
      data-feature-id={options.featureId}
    />
  ));
}
