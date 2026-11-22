// packages/client/src/components/SandboxParamControls.tsx
// ============================================
// 🎛 ПАНЕЛИ ПАРАМЕТРОВ ПЕСОЧНИЦЫ ГЕОМЕТРИИ
// ============================================
// • TessellationControls — плотность и лимиты точек
// • NoiseControls        — амплитуды, частоты, октавы, края тайла,
//                          сглаживание, вариация ширины дороги
// • WallControls         — городские стены: стена, башни, ворота, зубцы, цвета
// • ParamSection (реэкспорт из ParamGroup.tsx) — сворачиваемая подсекция
//
// Компоненты «глупые»: состояние живёт в GeometrySandbox,
// сюда приходят значения и колбэк `onChange(patch)`.
// ============================================
import { memo, type ChangeEvent } from 'react';
import { ParamSection } from './ParamGroup';
import type {
  EdgeFadeCurve,
  NoiseByType,
  NoiseFeatureType,
  NoiseSettings,
  PlazaParams,
  ShapeParams,
  ShieldAnchor,
  SpotParams,
  TessellationParams,
} from '@/core/geometry';
import { SHAPE_PARAM_LIMITS, roadCornerRadiusFloor } from '@/core/geometry';
import type { TileParamOverride } from '@/core/geometry/geometryParams';
import type { MeshParams, MeshParamsInput, MeshSurface } from '@/core/geometry/tileMesh';
import { WALL_PARAM_LIMITS, type WallColors, type WallParams, type WallParamsInput } from '@/core/geometry/wallParams';

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

// ParamSection живёт в ParamGroup.tsx; реэкспорт сохраняет прежние импорты
export { ParamSection };

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

// ============================================
// 📌 НАСТРОЙКИ КОНКРЕТНОГО ТАЙЛА
// ============================================

const SHIELD_ANCHOR_OPTIONS: ReadonlyArray<{ value: ShieldAnchor | 'auto'; label: string }> = [
  { value: 'auto', label: 'Автоматически' },
  { value: 'NW', label: 'Угол: северо-запад' },
  { value: 'NE', label: 'Угол: северо-восток' },
  { value: 'SE', label: 'Угол: юго-восток' },
  { value: 'SW', label: 'Угол: юго-запад' },
  { value: 'N', label: 'Сторона: север' },
  { value: 'E', label: 'Сторона: восток' },
  { value: 'S', label: 'Сторона: юг' },
  { value: 'W', label: 'Сторона: запад' },
];

interface TileOverrideControlsProps {
  artId: string;
  override?: TileParamOverride;
  /** У тайла есть город со щитом */
  hasShield: boolean;
  onShieldAnchor: (anchor: ShieldAnchor | undefined) => void;
  /** Seed, который сейчас примеряется в поле «Seed шума» */
  previewSeed: string;
  /** Сколько тайлов в файле имеют свои настройки */
  overriddenCount: number;
  onRandomize: () => void;
  onPin: () => void;
  onClear: () => void;
}

/** Закрепление seed за тайлом: «этот тайл вышел некрасивым — берём другой seed» */
export const TileOverrideControls = memo(({
  artId,
  override,
  hasShield,
  onShieldAnchor,
  previewSeed,
  overriddenCount,
  onRandomize,
  onPin,
  onClear,
}: TileOverrideControlsProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ fontSize: 11.5, color: TEXT, lineHeight: 1.4 }}>
      Закреплённый seed:{' '}
      <b style={{ color: override?.seed ? '#86efac' : MUTED }}>{override?.seed ?? `нет (используется ${artId})`}</b>
      <br />
      Тайлов с настройками в файле: {overriddenCount}
    </div>
    <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.3 }}>
      Подберите вариант кнопкой «Подобрать» (или введите seed в поле «Seed шума» в блоке «Шум Перлина»), затем закрепите.
      Закрепление действует на все тайлы с этим artId и записывается в файл при сохранении.
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <ResetButton onClick={onRandomize} label="🎲 Подобрать" />
      <button
        type="button"
        onClick={onPin}
        disabled={previewSeed.trim() === ''}
        style={{
          background: FIELD_BG, color: '#e5e7eb', border: FIELD_BORDER, borderRadius: 4,
          padding: '4px 8px', fontSize: 12, cursor: previewSeed.trim() === '' ? 'default' : 'pointer',
          opacity: previewSeed.trim() === '' ? 0.45 : 1,
        }}
      >
        📌 Закрепить{previewSeed.trim() ? ` «${previewSeed.trim()}»` : ''}
      </button>
      {override?.seed && <ResetButton onClick={onClear} label="✖ Снять seed" />}
    </div>
    {hasShield && (
      <ParamSelect
        label="Привязка щита"
        value={override?.shieldAnchor ?? 'auto'}
        options={SHIELD_ANCHOR_OPTIONS}
        hint="По умолчанию щит выбирает угол сам. Заданный угол выполняется даже вплотную к мипле (аудит предупредит о перекрытии)."
        onChange={(v) => onShieldAnchor(v === 'auto' ? undefined : v)}
      />
    )}
  </div>
));
TileOverrideControls.displayName = 'TileOverrideControls';

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
