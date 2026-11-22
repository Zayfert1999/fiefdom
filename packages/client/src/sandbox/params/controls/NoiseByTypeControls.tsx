// packages/client/src/sandbox/params/controls/NoiseByTypeControls.tsx
import { memo } from 'react';
import { MUTED, ParamSlider, ParamCheckbox } from './base';
import { ParamSection } from '../ParamGroup';
import type {
  NoiseByType,
  NoiseFeatureType,
  NoiseSettings,
} from '@/core/geometry';

// ============================================
// 🎚 ШУМ ПО ТИПУ ФИЧИ
// ============================================

interface TypeFieldSpec {
  key: keyof NoiseSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}

const TYPE_SECTIONS: ReadonlyArray<{ type: NoiseFeatureType; title: string; fields: readonly TypeFieldSpec[] }> = [
  {
    type: 'city',
    title: 'Города',
    fields: [
      { key: 'areaAmplitude', label: 'Амплитуда', min: 0, max: 100, step: 0.1 },
      { key: 'areaFrequency', label: 'Частота', min: 0.005, max: 0.3, step: 0.005 },
    ],
  },
  {
    type: 'monastery',
    title: 'Монастыри',
    fields: [
      { key: 'areaAmplitude', label: 'Амплитуда', min: 0, max: 100, step: 0.1 },
      { key: 'areaFrequency', label: 'Частота', min: 0.005, max: 0.3, step: 0.005 },
    ],
  },
  {
    type: 'road',
    title: 'Дороги',
    fields: [
      { key: 'lineAmplitude', label: 'Амплитуда оси', min: 0, max: 100, step: 0.1 },
      { key: 'lineFrequency', label: 'Частота', min: 0.005, max: 0.3, step: 0.005 },
      { key: 'widthVariation', label: 'Вариация ширины', min: 0, max: 15, step: 0.1 },
    ],
  },
];

interface NoiseByTypeControlsProps {
  byType: NoiseByType;
  /** Общие настройки: показываются, пока тип не переопределён */
  base: NoiseSettings;
  onChange: (next: NoiseByType) => void;
  disabled?: boolean;
}

/** Свои настройки шума для города / монастыря / дороги поверх общих */
export const NoiseByTypeControls = memo(({ byType, base, onChange, disabled = false }: NoiseByTypeControlsProps) => (
  <ParamSection title="Настройки по типу фичи" defaultOpen={false}>
    <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3 }}>
      Поверх общих настроек. Например, монастырю 40×40 нужна меньшая амплитуда, чем городу.
    </div>
    {TYPE_SECTIONS.map(({ type, title, fields }) => {
      const override = byType[type];
      const enabled = override !== undefined;

      const toggle = (on: boolean): void => {
        const next: NoiseByType = { ...byType };
        if (on) {
          next[type] = Object.fromEntries(fields.map((f) => [f.key, base[f.key]])) as Partial<NoiseSettings>;
        } else {
          delete next[type];
        }
        onChange(next);
      };

      return (
        <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ParamCheckbox label={`Свои настройки: ${title}`} checked={enabled} disabled={disabled} onChange={toggle} />
          {enabled &&
            fields.map((field) => (
              <ParamSlider
                key={field.key}
                label={field.label}
                value={(override?.[field.key] ?? base[field.key]) as number}
                min={field.min}
                max={field.max}
                step={field.step}
                disabled={disabled}
                onChange={(v) => onChange({ ...byType, [type]: { ...override, [field.key]: v } })}
              />
            ))}
        </div>
      );
    })}
  </ParamSection>
));
NoiseByTypeControls.displayName = 'NoiseByTypeControls';
