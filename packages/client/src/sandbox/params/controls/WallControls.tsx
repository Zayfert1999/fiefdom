// packages/client/src/sandbox/params/controls/WallControls.tsx
import { memo } from 'react';
import { TEXT, FIELD_BG, FIELD_BORDER, ParamSlider, ParamCheckbox, ResetButton } from './base';
import { ParamSection } from '../ParamGroup';
import { WALL_PARAM_LIMITS, type WallColors, type WallParams, type WallParamsInput } from '@/core/geometry/wallParams';

// ============================================
// 🏰 ГОРОДСКИЕ СТЕНЫ
// ============================================

const WALL_COLOR_LABELS: ReadonlyArray<{ key: keyof WallColors; label: string }> = [
  { key: 'wall', label: 'Стена' },
  { key: 'tower', label: 'Башни' },
  { key: 'gate', label: 'Ворота' },
  { key: 'merlon', label: 'Зубцы' },
];

interface WallControlsProps {
  params: WallParams;
  onChange: (patch: WallParamsInput) => void;
  onReset: () => void;
}

/** Параметры стен не пересобирают тайлы: смотреть результат — во вкладке «3D доска» */
export const WallControls = memo(({ params, onChange, onReset }: WallControlsProps) => {
  const L = WALL_PARAM_LIMITS;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ParamSection title="Общее" defaultOpen>
        <ParamCheckbox
          label="Строить стены" checked={params.enabled}
          hint="Стены получают только завершённые (замкнутые) города. Результат — во вкладке «3D доска»."
          onChange={(v) => onChange({ enabled: v })}
        />
        <ParamCheckbox
          label="Обносить внутренние кольца" checked={params.innerRings}
          hint="Если город обнимает поле или монастырь, вокруг них тоже встаёт стена."
          onChange={(v) => onChange({ innerRings: v })}
        />
        <ParamSlider
          label="Рост из земли (доля анимации)" value={params.riseFraction}
          min={L.riseFraction.min} max={L.riseFraction.max} step={0.05}
          hint="За какую часть анимации завершения региона стены вырастают на полную высоту."
          onChange={(v) => onChange({ riseFraction: v })}
        />
      </ParamSection>

      <ParamSection title="Стена">
        <ParamSlider
          label="Толщина" value={params.wall.width} min={L.wall.width.min} max={L.wall.width.max} step={0.5}
          hint="Стена центрирована по контуру города: половина толщины над городом, половина над полем."
          onChange={(v) => onChange({ wall: { width: v } })}
        />
        <ParamSlider
          label="Высота" value={params.wall.height} min={L.wall.height.min} max={L.wall.height.max} step={0.5}
          onChange={(v) => onChange({ wall: { height: v } })}
        />
        <ParamSlider
          label="Заглубление основания" value={params.wall.sink} min={L.wall.sink.min} max={L.wall.sink.max} step={0.5}
          hint="Основание уходит под поверхность, чтобы на неровностях поля не было щелей."
          onChange={(v) => onChange({ wall: { sink: v } })}
        />
        <ParamSlider
          label="Угол складки (°)" value={params.wall.creaseAngle}
          min={L.wall.creaseAngle.min} max={L.wall.creaseAngle.max} step={5}
          hint="Изломы контура мягче порога сглаживаются, острее — остаются чёткими."
          onChange={(v) => onChange({ wall: { creaseAngle: v } })}
        />
      </ParamSection>

      <ParamSection title="Башни на стыках тайлов">
        <ParamSlider
          label="Радиус" value={params.tower.radius} min={L.tower.radius.min} max={L.tower.radius.max} step={0.5}
          onChange={(v) => onChange({ tower: { radius: v } })}
        />
        <ParamSlider
          label="Высота" value={params.tower.height} min={L.tower.height.min} max={L.tower.height.max} step={0.5}
          onChange={(v) => onChange({ tower: { height: v } })}
        />
        <ParamSlider
          label="Граней цилиндра" value={params.tower.segments}
          min={L.tower.segments.min} max={L.tower.segments.max} step={1}
          onChange={(v) => onChange({ tower: { segments: v } })}
        />
      </ParamSection>

      <ParamSection title="Ворота">
        <ParamSlider
          label="Ширина проёма" value={params.gate.archWidth}
          min={L.gate.archWidth.min} max={L.gate.archWidth.max} step={0.5}
          onChange={(v) => onChange({ gate: { archWidth: v } })}
        />
        <ParamSlider
          label="Высота проёма" value={params.gate.archHeight}
          min={L.gate.archHeight.min} max={L.gate.archHeight.max} step={0.5}
          hint="Полная высота: прямые стенки и полукруглый свод."
          onChange={(v) => onChange({ gate: { archHeight: v } })}
        />
        <ParamSlider
          label="Высота ворот" value={params.gate.height} min={L.gate.height.min} max={L.gate.height.max} step={0.5}
          onChange={(v) => onChange({ gate: { height: v } })}
        />
        <ParamSlider
          label="Длина между башнями" value={params.gate.width} min={L.gate.width.min} max={L.gate.width.max} step={0.5}
          hint="Расстояние между осями боковых башен. Не меньше проёма + двух радиусов башни: меньше не даст."
          onChange={(v) => onChange({ gate: { width: v } })}
        />
        <ParamSlider
          label="Толще стены на" value={params.gate.extraDepth}
          min={L.gate.extraDepth.min} max={L.gate.extraDepth.max} step={0.5}
          onChange={(v) => onChange({ gate: { extraDepth: v } })}
        />
        <ParamSlider
          label="Боковые башни: радиус" value={params.gate.towerRadius}
          min={L.gate.towerRadius.min} max={L.gate.towerRadius.max} step={0.5}
          onChange={(v) => onChange({ gate: { towerRadius: v } })}
        />
        <ParamSlider
          label="Боковые башни: высота" value={params.gate.towerHeight}
          min={L.gate.towerHeight.min} max={L.gate.towerHeight.max} step={0.5}
          onChange={(v) => onChange({ gate: { towerHeight: v } })}
        />
        <ParamSlider
          label="Граней свода" value={params.gate.archSegments}
          min={L.gate.archSegments.min} max={L.gate.archSegments.max} step={1}
          onChange={(v) => onChange({ gate: { archSegments: v } })}
        />
      </ParamSection>

      <ParamSection title="Зубцы (мерлоны)">
        <ParamCheckbox
          label="Зубцы на стенах, башнях и воротах" checked={params.merlon.enabled}
          onChange={(v) => onChange({ merlon: { enabled: v } })}
        />
        <ParamSlider
          label="Ширина зубца" value={params.merlon.width}
          min={L.merlon.width.min} max={L.merlon.width.max} step={0.5} disabled={!params.merlon.enabled}
          onChange={(v) => onChange({ merlon: { width: v } })}
        />
        <ParamSlider
          label="Просвет" value={params.merlon.gap}
          min={L.merlon.gap.min} max={L.merlon.gap.max} step={0.5} disabled={!params.merlon.enabled}
          hint="Желаемый; реальный подгоняется, чтобы зубцы ровно ложились на участок стены."
          onChange={(v) => onChange({ merlon: { gap: v } })}
        />
        <ParamSlider
          label="Высота зубца" value={params.merlon.height}
          min={L.merlon.height.min} max={L.merlon.height.max} step={0.5} disabled={!params.merlon.enabled}
          onChange={(v) => onChange({ merlon: { height: v } })}
        />
        <ParamSlider
          label="Толщина (доля стены)" value={params.merlon.depth}
          min={L.merlon.depth.min} max={L.merlon.depth.max} step={0.05} disabled={!params.merlon.enabled}
          onChange={(v) => onChange({ merlon: { depth: v } })}
        />
      </ParamSection>

      <ParamSection title="Цвета" defaultOpen={false}>
        {WALL_COLOR_LABELS.map(({ key, label }) => (
          <label
            key={key}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: TEXT }}
          >
            <span>{label}</span>
            <input
              type="color"
              value={params.colors[key]}
              onChange={(e) => onChange({ colors: { [key]: e.target.value } })}
              style={{ width: 48, height: 24, border: FIELD_BORDER, background: FIELD_BG, padding: 0 }}
            />
          </label>
        ))}
      </ParamSection>

      <div><ResetButton onClick={onReset} label="↺ Сбросить стены" /></div>
    </div>
  );
});
WallControls.displayName = 'WallControls';
