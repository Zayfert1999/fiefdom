// packages/client/src/sandbox/params/controls/ShapeControls.tsx
import { memo } from 'react';
import { MUTED, ParamSlider, ResetButton } from './base';
import { ParamSection } from '../ParamGroup';
import type {
  ShapeParams,
} from '@/core/geometry';
import { SHAPE_PARAM_LIMITS, roadCornerRadiusFloor } from '@/core/geometry';

// ============================================
// 🏗 ФОРМЫ: ГОРОД, МОНАСТЫРЬ, ДОРОГА
// ============================================

interface ShapeControlsProps {
  params: ShapeParams;
  onChange: <G extends keyof ShapeParams>(group: G, patch: Partial<ShapeParams[G]>) => void;
  onReset: () => void;
}

export const ShapeControls = memo(({ params, onChange, onReset }: ShapeControlsProps) => {
  const L = SHAPE_PARAM_LIMITS;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3 }}>
        Формы до шума: из этих параметров строятся контуры городов, монастырей и дорог.
        Диапазоны подобраны так, чтобы форма оставалась простой на любом тайле.
      </div>

      <ParamSection title="Город">
        <ParamSlider
          label="Глубина шапки / выреза" value={params.city.capDepth}
          min={L.city.capDepth[0]} max={L.city.capDepth[1]} step={0.5}
          hint="Глубина дуги, которой город «отрезан» от стороны тайла без дороги."
          onChange={(v) => onChange('city', { capDepth: v })}
        />
        <ParamSlider
          label="Глубина выреза под дорогу" value={params.city.roadArcDepth}
          min={L.city.roadArcDepth[0]} max={L.city.roadArcDepth[1]} step={0.5}
          hint="Глубина дуги там, где к городу подходит дорога."
          onChange={(v) => onChange('city', { roadArcDepth: v })}
        />
        <ParamSlider
          label="Изгиб диагонали" value={params.city.diagBulge}
          min={L.city.diagBulge[0]} max={L.city.diagBulge[1]} step={0.5}
          hint="Насколько выгнута граница города между двумя соседними сторонами. 0 — прямая."
          onChange={(v) => onChange('city', { diagBulge: v })}
        />
      </ParamSection>

      <ParamSection title="Монастырь">
        <ParamSlider
          label="Половина стороны" value={params.monastery.halfExtent}
          min={L.monastery.halfExtent[0]} max={L.monastery.halfExtent[1]} step={0.5}
          hint="Размер монастыря 2× от значения. Тупиковые дороги подстраиваются под него."
          onChange={(v) => onChange('monastery', { halfExtent: v })}
        />
        <ParamSlider
          label="Радиус скругления углов" value={params.monastery.cornerRadius}
          min={L.monastery.cornerRadius[0]} max={Math.min(L.monastery.cornerRadius[1], params.monastery.halfExtent)} step={0.5}
          hint="0 — острые углы. Не больше половины стороны."
          onChange={(v) => onChange('monastery', { cornerRadius: v })}
        />
      </ParamSection>

      <ParamSection title="Дорога">
        <ParamSlider
          label="Ширина" value={params.road.width}
          min={L.road.width[0]} max={L.road.width[1]} step={1}
          hint="Если ширина больше радиуса мипла × 2, мипл помещается на дороге."
          onChange={(v) => onChange('road', { width: v })}
        />
        <ParamSlider
          label="Радиус поворота" value={params.road.cornerRadius}
          min={roadCornerRadiusFloor(params.road.width)} max={L.road.cornerRadius[1]} step={0.5}
          hint="Радиус дуги в поворотной дороге; у краёв тайла остаются прямые хвосты длиной 50 − R. Минимум = половина ширины + 15: при меньшем радиусе внутренний край поворота самопересекается."
          onChange={(v) => onChange('road', { cornerRadius: v })}
        />
        <ParamSlider
          label="Натяжение дуги" value={params.road.cornerTension}
          min={L.road.cornerTension[0]} max={L.road.cornerTension[1]} step={0.01}
          hint="Вынос контрольных точек в долях радиуса. 0.55 — круговая дуга, меньше — срезанный угол, больше — раздутый."
          onChange={(v) => onChange('road', { cornerTension: v })}
        />
        <ParamSlider
          label="Заход под город / монастырь" value={params.road.endOverlap}
          min={L.road.endOverlap[0]} max={L.road.endOverlap[1]} step={0.5}
          hint="Тупиковая дорога заходит под город или монастырь и вычитается из него. Должен перекрывать амплитуду шума на их контуре, иначе у торца видна щель, а при нуле поля по бокам дороги могут слиться (аудит: field-unassigned)."
          onChange={(v) => onChange('road', { endOverlap: v })}
        />
      </ParamSection>

      <div><ResetButton onClick={onReset} label="↺ Сбросить формы" /></div>
    </div>
  );
});
ShapeControls.displayName = 'ShapeControls';
