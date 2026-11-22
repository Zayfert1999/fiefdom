// packages/client/src/sandbox/params/controls/PlazaControls.tsx
import { memo } from 'react';
import { ParamSlider, ResetButton } from './base';
import type {
  PlazaParams,
} from '@/core/geometry';

// ============================================
// 🏛 ПЛОЩАДИ НА ПЕРЕКРЁСТКАХ
// ============================================

interface PlazaControlsProps {
  params: PlazaParams;
  onChange: (patch: Partial<PlazaParams>) => void;
  onReset: () => void;
}

export const PlazaControls = memo(({ params, onChange, onReset }: PlazaControlsProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <ParamSlider
      label="Глубина площади" value={params.depth} min={4} max={60} step={1}
      hint="Расстояние по оси дороги от центра перекрёстка до среза. Площадь идёт по самим краям дорог."
      onChange={(v) => onChange({ depth: v })}
    />
    <ParamSlider
      label="Радиус скругления углов" value={params.cornerRadius} min={0} max={40} step={0.5}
      hint="Сколько юнитов вдоль каждого края съедает скругление. Ограничен глубиной минус полуширина дороги. 0 — острые углы."
      onChange={(v) => onChange({ cornerRadius: v })}
    />
    <ParamSlider
      label="Скруглённость" value={params.cornerRoundness} min={0} max={1} step={0.05}
      hint="0 — угол срезан прямой, 1 — плавная кривая, касательная к краям дорог."
      onChange={(v) => onChange({ cornerRoundness: v })}
    />
    <ParamSlider
      label="Допуск перекрёстка" value={params.clusterTolerance} min={0.5} max={10} step={0.5}
      hint="Концы дорог ближе этого расстояния считаются одним перекрёстком."
      onChange={(v) => onChange({ clusterTolerance: v })}
    />
    <div><ResetButton onClick={onReset} label="↺ Сбросить площади" /></div>
  </div>
));
PlazaControls.displayName = 'PlazaControls';
