// packages/client/src/sandbox/params/controls/MeshControls.tsx
import { memo } from 'react';
import { TEXT, FIELD_BG, FIELD_BORDER, ParamSlider, ParamCheckbox, ResetButton } from './base';
import { ParamSection } from '../ParamGroup';
import type { MeshParams, MeshParamsInput, MeshSurface } from '@/core/geometry/tileMesh';

// ============================================
// 🧱 МЕШ (3D)
// ============================================

const SURFACE_LABELS: ReadonlyArray<{ key: Exclude<MeshSurface, 'base'>; label: string }> = [
  { key: 'field', label: 'Поля' },
  { key: 'road', label: 'Дороги' },
  { key: 'plaza', label: 'Площади' },
  { key: 'city', label: 'Города' },
  { key: 'monastery', label: 'Монастыри' },
];

interface MeshControlsProps {
  params: MeshParams;
  onChange: (patch: MeshParamsInput) => void;
  onReset: () => void;
}

export const MeshControls = memo(({ params, onChange, onReset }: MeshControlsProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <ParamSection title="Высоты">
      <ParamSlider
        label="Подложка" value={params.baseHeight} min={0} max={20} step={0.5}
        hint="Общий фундамент под всем тайлом."
        onChange={(v) => onChange({ baseHeight: v })}
      />
      {SURFACE_LABELS.map(({ key, label }) => (
        <ParamSlider
          key={key}
          label={`Слой: ${label}`} value={params.heights[key]} min={0.5} max={20} step={0.5}
          hint={key === 'field' ? 'Толщина слоя НАД подложкой. Если дороги/города ниже полей, они выглядят «врезанными».' : undefined}
          onChange={(v) => onChange({ heights: { [key]: v } })}
        />
      ))}
    </ParamSection>

    <ParamSection title="Стены и нормали">
      <ParamSlider
        label="Угол складки стен (°)" value={params.wallCreaseAngle} min={0} max={180} step={5}
        hint="Углы мягче порога сглаживаются, острее — остаются чёткими."
        onChange={(v) => onChange({ wallCreaseAngle: v })}
      />
      <ParamCheckbox
        label="Стены по границе тайла" checked={params.boundaryWalls}
        hint="Нужны только по периметру доски. Между соседями они скрыты и лишь прибавляют треугольников. Одиночный тайл всегда строится со стенами."
        onChange={(v) => onChange({ boundaryWalls: v })}
      />
    </ParamSection>

    <ParamSection title="Цвета" defaultOpen={false}>
      {(['base', 'field', 'road', 'plaza', 'city', 'monastery'] as const).map((surface) => (
        <label
          key={surface}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: TEXT }}
        >
          <span>{surface}</span>
          <input
            type="color"
            value={params.colors[surface]}
            onChange={(e) => onChange({ colors: { [surface]: e.target.value } })}
            style={{ width: 48, height: 24, border: FIELD_BORDER, background: FIELD_BG, padding: 0 }}
          />
        </label>
      ))}
    </ParamSection>

    <div><ResetButton onClick={onReset} label="↺ Сбросить меш" /></div>
  </div>
));
MeshControls.displayName = 'MeshControls';
