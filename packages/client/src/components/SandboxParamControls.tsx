// packages/client/src/components/SandboxParamControls.tsx
// ============================================
// 🎛 ПАНЕЛИ ПАРАМЕТРОВ ПЕСОЧНИЦЫ ГЕОМЕТРИИ
// ============================================
// • TessellationControls — плотность и лимиты точек
// • NoiseControls        — амплитуды, частоты, октавы, края тайла,
//                          сглаживание, вариация ширины дороги
//
// Компоненты «глупые»: состояние живёт в GeometrySandbox,
// сюда приходят значения и колбэк `onChange(patch)`.
// ============================================
import { memo, type ChangeEvent, type ReactNode } from 'react';
import type { EdgeFadeCurve, NoiseSettings, PlazaParams, TessellationParams } from '@/core/geometry';
import type { MeshParams, MeshParamsInput, MeshSurface } from '@/core/geometry/tileMesh';

// ============================================
// 🎨 СТИЛИ
// ============================================
const TEXT = '#ccc';
const MUTED = '#888';
const FIELD_BG = '#111827';
const FIELD_BORDER = '1px solid #374151';

const numberInputStyle = {
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

interface ParamSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Сворачиваемая группа параметров */
export const ParamSection = ({ title, children, defaultOpen = true }: ParamSectionProps) => (
  <details
    open={defaultOpen}
    style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}
  >
    <summary style={{ cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
      {title}
    </summary>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
      {children}
    </div>
  </details>
);

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

const ResetButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
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
