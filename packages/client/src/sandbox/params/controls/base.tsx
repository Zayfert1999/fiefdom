// packages/client/src/sandbox/params/controls/base.tsx
// Базовые контролы панелей параметров: ползунок, чекбокс, выпадающий список, кнопка сброса.
import { type ChangeEvent } from 'react';

// ============================================
// 🎨 СТИЛИ
// ============================================
export const TEXT = '#ccc';
export const MUTED = '#888';
export const FIELD_BG = '#111827';
export const FIELD_BORDER = '1px solid #374151';

export const numberInputStyle = {
  width: 64,
  background: FIELD_BG,
  color: '#e5e7eb',
  border: FIELD_BORDER,
  borderRadius: 4,
  padding: '2px 4px',
  fontSize: 12,
} as const;

// ============================================
// 🧱 БАЗОВЫЕ КОНТРОЛЫ
// ============================================

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
  disabled?: boolean;
}

/** Ползунок + числовое поле. Числовое поле принимает точное значение. */
export const ParamSlider = ({
  label, value, min, max, step, onChange, hint, disabled = false,
}: ParamSliderProps) => {
  const commit = (raw: number): void => {
    if (!Number.isFinite(raw)) return;
    onChange(Math.min(max, Math.max(min, raw)));
  };

  return (
    <div
      title={hint}
      style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: disabled ? 0.4 : 1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: TEXT }}>
        <span>{label}</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => commit(Number(e.target.value))}
          style={numberInputStyle}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => commit(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      {hint && <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3 }}>{hint}</div>}
    </div>
  );
};

interface ParamCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
}

export const ParamCheckbox = ({ label, checked, onChange, hint, disabled = false }: ParamCheckboxProps) => (
  <label
    title={hint}
    style={{
      display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: TEXT,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    }}
  >
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </span>
    {hint && <span style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3, paddingLeft: 20 }}>{hint}</span>}
  </label>
);

interface ParamSelectProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: string;
  disabled?: boolean;
}

export function ParamSelect<T extends string>({
  label, value, options, onChange, hint, disabled = false,
}: ParamSelectProps<T>) {
  return (
    <label
      title={hint}
      style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: TEXT, opacity: disabled ? 0.4 : 1 }}
    >
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        style={{ background: FIELD_BG, color: '#e5e7eb', border: FIELD_BORDER, borderRadius: 4, padding: '4px 6px', fontSize: 12 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3 }}>{hint}</span>}
    </label>
  );
}

export const ResetButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: FIELD_BG, color: '#e5e7eb', border: FIELD_BORDER, borderRadius: 4,
      padding: '4px 8px', fontSize: 12, cursor: 'pointer',
    }}
  >
    {label}
  </button>
);
