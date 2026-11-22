// packages/client/src/sandbox/params/controls/TessellationControls.tsx
import { memo } from 'react';
import { ParamSlider, ParamCheckbox, ResetButton } from './base';
import { ParamSection } from '../ParamGroup';
import type {
  TessellationParams,
} from '@/core/geometry';

// ============================================
// 📐 ТЕССЕЛЯЦИЯ
// ============================================

interface TessellationControlsProps {
  params: TessellationParams;
  onChange: (patch: Partial<TessellationParams>) => void;
  onReset: () => void;
}

export const TessellationControls = memo(({ params, onChange, onReset }: TessellationControlsProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <ParamSection title="Кривые Безье">
      <ParamSlider
        label="Плотность кривых" value={params.curveDensity} min={0.02} max={1.5} step={0.01}
        hint="Сегментов на юнит длины. Больше — гладче кривая и точнее нормали."
        onChange={(v) => onChange({ curveDensity: v })}
      />
      <ParamSlider
        label="Мин. сегментов на кривую" value={params.minCurveSegments} min={1} max={16} step={1}
        onChange={(v) => onChange({ minCurveSegments: v })}
      />
      <ParamSlider
        label="Макс. сегментов на кривую" value={params.maxCurveSegments} min={4} max={128} step={1}
        onChange={(v) => onChange({ maxCurveSegments: v })}
      />
    </ParamSection>

    <ParamSection title="Прямые отрезки">
      <ParamSlider
        label="Плотность прямых" value={params.lineDensity} min={0.02} max={1.5} step={0.01}
        hint="Подотрезков на юнит. Чем плотнее, тем мельче рябь шума на прямых."
        onChange={(v) => onChange({ lineDensity: v })}
      />
      <ParamSlider
        label="Порог разбиения (юниты)" value={params.lineSubdivideThreshold} min={0} max={50} step={0.5}
        hint="Прямые короче порога остаются одним отрезком."
        onChange={(v) => onChange({ lineSubdivideThreshold: v })}
      />
      <ParamCheckbox
        label="Дробить рёбра на границе тайла" checked={params.subdivideBoundaryEdges}
        hint="Рёбра, лежащие на краю тайла, шумом не двигаются. Выключите, чтобы сэкономить вершины."
        onChange={(v) => onChange({ subdivideBoundaryEdges: v })}
      />
    </ParamSection>

    <ParamSection title="Лимиты точек">
      <ParamSlider
        label="Мин. точек в кольце" value={params.minRingPoints} min={3} max={64} step={1}
        hint="Короткие контуры дробятся по самым длинным рёбрам, углы сохраняются."
        onChange={(v) => onChange({ minRingPoints: v })}
      />
      <ParamSlider
        label="Макс. точек в кольце" value={params.maxRingPoints} min={16} max={1024} step={1}
        hint="При превышении плотность снижается автоматически."
        onChange={(v) => onChange({ maxRingPoints: v })}
      />
      <ParamSlider
        label="Мин. точек оси дороги" value={params.minLinePoints} min={2} max={32} step={1}
        onChange={(v) => onChange({ minLinePoints: v })}
      />
    </ParamSection>

    <div><ResetButton onClick={onReset} label="↺ Сбросить тесселяцию" /></div>
  </div>
));
TessellationControls.displayName = 'TessellationControls';
