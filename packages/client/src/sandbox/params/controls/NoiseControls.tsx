// packages/client/src/sandbox/params/controls/NoiseControls.tsx
import { memo } from 'react';
import { ParamSlider, ParamCheckbox, ParamSelect, ResetButton } from './base';
import { ParamSection } from '../ParamGroup';
import type {
  EdgeFadeCurve,
  NoiseSettings,
} from '@/core/geometry';

// ============================================
// 🌊 ШУМ
// ============================================

const FADE_CURVE_OPTIONS: ReadonlyArray<{ value: EdgeFadeCurve; label: string }> = [
  { value: 'linear', label: 'Линейная' },
  { value: 'smoothstep', label: 'Smoothstep (3t² − 2t³)' },
  { value: 'smootherstep', label: 'Smootherstep (мягче на концах)' },
];

interface NoiseControlsProps {
  params: NoiseSettings;
  onChange: (patch: Partial<NoiseSettings>) => void;
  onReset: () => void;
  disabled?: boolean;
}

export const NoiseControls = memo(({ params, onChange, onReset, disabled = false }: NoiseControlsProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <ParamSection title="Амплитуда">
      <ParamSlider
        label="Города / монастыри" value={params.areaAmplitude} min={0} max={100} step={0.1} disabled={disabled}
        hint="Макс. смещение контура вдоль нормали (юниты). Реальный размах ≈ 0.3–0.7 от значения."
        onChange={(v) => onChange({ areaAmplitude: v })}
      />
      <ParamSlider
        label="Дороги (ось)" value={params.lineAmplitude} min={0} max={100} step={0.1} disabled={disabled}
        onChange={(v) => onChange({ lineAmplitude: v })}
      />
      <ParamSlider
        label="Вариация ширины дороги" value={params.widthVariation} min={0} max={15} step={0.1} disabled={disabled}
        hint="± юниты к полуширине. На краю тайла ширина всегда исходная."
        onChange={(v) => onChange({ widthVariation: v })}
      />
    </ParamSection>

    <ParamSection title="Частота и октавы">
      <ParamSlider
        label="Частота: города / монастыри" value={params.areaFrequency} min={0.005} max={0.3} step={0.005} disabled={disabled}
        hint="Длина волны ≈ 1 / частота. Монастырь 40×40 — берите ≥ 0.05."
        onChange={(v) => onChange({ areaFrequency: v })}
      />
      <ParamSlider
        label="Частота: дороги" value={params.lineFrequency} min={0.005} max={0.3} step={0.005} disabled={disabled}
        onChange={(v) => onChange({ lineFrequency: v })}
      />
      <ParamSlider
        label="Октавы" value={params.octaves} min={1} max={6} step={1} disabled={disabled}
        onChange={(v) => onChange({ octaves: v })}
      />
      <ParamSlider
        label="Lacunarity" value={params.lacunarity} min={1} max={4} step={0.1} disabled={disabled || params.octaves < 2}
        hint="Во сколько раз растёт частота на каждой октаве."
        onChange={(v) => onChange({ lacunarity: v })}
      />
      <ParamSlider
        label="Gain (persistence)" value={params.gain} min={0.1} max={1} step={0.05} disabled={disabled || params.octaves < 2}
        hint="Во сколько раз падает амплитуда на каждой октаве."
        onChange={(v) => onChange({ gain: v })}
      />
    </ParamSection>

    <ParamSection title="Область выборки шума" defaultOpen={false}>
      <ParamCheckbox
        label="Сдвиг по seed" checked={params.useSeedOffset} disabled={disabled}
        hint="Без сдвига шум в центре тайла и на осях всегда близок к нулю (узлы решётки Перлина)."
        onChange={(v) => onChange({ useSeedOffset: v })}
      />
      <ParamSlider
        label="Сдвиг X" value={params.offsetX} min={-50} max={50} step={0.1} disabled={disabled}
        onChange={(v) => onChange({ offsetX: v })}
      />
      <ParamSlider
        label="Сдвиг Y" value={params.offsetY} min={-50} max={50} step={0.1} disabled={disabled}
        onChange={(v) => onChange({ offsetY: v })}
      />
    </ParamSection>

    <ParamSection title="Край тайла и концы дороги">
      <ParamSlider
        label="Дистанция затухания" value={params.edgeFadeDistance} min={0} max={60} step={1} disabled={disabled}
        hint="На этом расстоянии от края тайла (и от свободного конца дороги) смещение растёт от 0 до 100%. 0 — резкая граница."
        onChange={(v) => onChange({ edgeFadeDistance: v })}
      />
      <ParamSelect
        label="Профиль затухания" value={params.edgeFadeCurve} options={FADE_CURVE_OPTIONS}
        disabled={disabled || params.edgeFadeDistance <= 0}
        onChange={(v) => onChange({ edgeFadeCurve: v })}
      />
      <ParamCheckbox
        label="Выравнивать нормали к краю" checked={params.alignNormals} disabled={disabled}
        hint="Нормаль «раздувания» дороги плавно переходит к исходной (перпендикулярной краю). Выключите, чтобы увидеть проблему «до»."
        onChange={(v) => onChange({ alignNormals: v })}
      />
      <ParamCheckbox
        label="Не выпускать точки за тайл (clamp)" checked={params.clampToTile} disabled={disabled}
        onChange={(v) => onChange({ clampToTile: v })}
      />
      <ParamSlider
        label="Отступ clamp от границы" value={params.clampMargin} min={0} max={10} step={0.1}
        disabled={disabled || !params.clampToTile}
        onChange={(v) => onChange({ clampMargin: v })}
      />
      <ParamSlider
        label="Мёртвая зона у границы" value={params.boundaryEpsilon} min={0} max={5} step={0.1} disabled={disabled}
        hint="Точки ближе этого расстояния к краю не смещаются."
        onChange={(v) => onChange({ boundaryEpsilon: v })}
      />
    </ParamSection>

    <ParamSection title="Контур и сглаживание" defaultOpen={false}>
      <ParamSlider
        label="Окно нормали (вершин)" value={params.normalWindow} min={1} max={8} step={1} disabled={disabled}
        hint="Сколько соседей учитывать при оценке нормали контура. Больше — стабильнее на плотной сетке."
        onChange={(v) => onChange({ normalWindow: v })}
      />
      <ParamSlider
        label="Итераций сглаживания" value={params.smoothIterations} min={0} max={8} step={1} disabled={disabled}
        onChange={(v) => onChange({ smoothIterations: v })}
      />
      <ParamSlider
        label="Сила сглаживания" value={params.smoothStrength} min={0} max={1} step={0.05}
        disabled={disabled || params.smoothIterations === 0}
        onChange={(v) => onChange({ smoothStrength: v })}
      />
      <ParamSlider
        label="Мин. расстояние между точками" value={params.minPointDistance} min={0} max={3} step={0.05} disabled={disabled}
        hint="Точки ближе порога считаются дубликатами и удаляются перед шумом."
        onChange={(v) => onChange({ minPointDistance: v })}
      />
    </ParamSection>

    <div><ResetButton onClick={onReset} label="↺ Сбросить шум" /></div>
  </div>
));
NoiseControls.displayName = 'NoiseControls';
