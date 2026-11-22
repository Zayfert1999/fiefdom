// packages/client/src/sandbox/params/controls/SpotControls.tsx
import { memo } from 'react';
import { MUTED, ParamSlider, ResetButton } from './base';
import { ParamSection } from '../ParamGroup';
import type {
  SpotParams,
} from '@/core/geometry';

// ============================================
// 📍 СПОТЫ МИПЛА И ЩИТА
// ============================================

interface SpotControlsProps {
  params: SpotParams;
  onChange: (patch: Partial<SpotParams>) => void;
  onReset: () => void;
}

export const SpotControls = memo(({ params, onChange, onReset }: SpotControlsProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3 }}>
      Споты считаются из итоговой геометрии: город, монастырь и поле — «полюс недоступности»,
      дорога — середина видимого участка оси. Прежние ручные споты в данных не используются.
    </div>
    <ParamSlider
      label="Радиус мипла" value={params.meepleRadius} min={1} max={30} step={0.5}
      hint="Если запас вокруг спота меньше радиуса, аудит предупреждает: фигурка не помещается. У дорог запас ≈ половина ширины."
      onChange={(v) => onChange({ meepleRadius: v })}
    />
    <ParamSlider
      label="Притяжение к центру" value={params.centerBias} min={0} max={0.5} step={0.01}
      hint="На широких фичах много равноценных точек. Небольшое притяжение к центроиду делает выбор симметричным. 0 — чистый polylabel."
      onChange={(v) => onChange({ centerBias: v })}
    />
    <ParamSection title="Щит" defaultOpen={false}>
      <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3 }}>
        Щит ставится у края города: в углу тайла или у середины стороны. Центр щита лежит
        на заданном расстоянии от границы (у прежних ручных щитов это 16). Фигурку щит не перекрывает.
      </div>
      <ParamSlider
        label="Радиус щита" value={params.shieldRadius} min={0.5} max={20} step={0.5}
        onChange={(v) => onChange({ shieldRadius: v })}
      />
      <ParamSlider
        label="Отступ центра от края" value={params.shieldInset} min={1} max={40} step={0.5}
        hint="Расстояние от центра щита до границы города и края тайла. Больше — щит глубже в городе."
        onChange={(v) => onChange({ shieldInset: v })}
      />
      <ParamSlider
        label="Штраф за сторону вместо угла" value={params.shieldEdgePenalty} min={0} max={60} step={1}
        hint="Угол выбирается, пока ближайшая допустимая точка не дальше «сторона + штраф». Прямой угол выигрывает, острый — нет."
        onChange={(v) => onChange({ shieldEdgePenalty: v })}
      />
      <ParamSlider
        label="Зазор щита от мипла" value={params.shieldMargin} min={0} max={20} step={0.5}
        onChange={(v) => onChange({ shieldMargin: v })}
      />
    </ParamSection>
    <ParamSlider
      label="Точность поиска" value={params.precision} min={0.05} max={2} step={0.05}
      hint="Меньше — точнее и медленнее."
      onChange={(v) => onChange({ precision: v })}
    />
    <ParamSlider
      label="Шаг выборки оси дороги" value={params.roadSampleStep} min={0.25} max={5} step={0.25}
      onChange={(v) => onChange({ roadSampleStep: v })}
    />
    <div><ResetButton onClick={onReset} label="↺ Сбросить споты" /></div>
  </div>
));
SpotControls.displayName = 'SpotControls';
