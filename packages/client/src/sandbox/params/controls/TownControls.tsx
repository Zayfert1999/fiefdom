// packages/client/src/sandbox/params/controls/TownControls.tsx
import { memo } from 'react';
import { TEXT, FIELD_BG, FIELD_BORDER, ParamSlider, ParamCheckbox, ResetButton } from './base';
import { ParamSection } from '../ParamGroup';
import { TOWN_PARAM_LIMITS, type TownColors, type TownParams, type TownParamsInput } from '@/core/geometry/townParams';

// ============================================
// 🏘 ЗАСТРОЙКА ГОРОДОВ
// ============================================

const TOWN_COLOR_LABELS: ReadonlyArray<{ key: keyof TownColors; label: string }> = [
  { key: 'square', label: 'Площадь' },
  { key: 'mainStreet', label: 'Главные улицы' },
  { key: 'sideStreet', label: 'Второстепенные улицы' },
  { key: 'wall', label: 'Стены домов' },
  { key: 'roofA', label: 'Крыша A' },
  { key: 'roofB', label: 'Крыша B' },
  { key: 'roofC', label: 'Крыша C' },
];

interface TownControlsProps {
  params: TownParams;
  onChange: (patch: TownParamsInput) => void;
  onReset: () => void;
}

/** Параметры застройки не пересобирают тайлы: смотреть результат — во вкладке «3D доска» */
export const TownControls = memo(({ params, onChange, onReset }: TownControlsProps) => {
  const L = TOWN_PARAM_LIMITS;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ParamSection title="Общее" defaultOpen>
        <ParamCheckbox
          label="Строить застройку" checked={params.enabled}
          hint="Площадь, улицы и дома получают только завершённые (замкнутые) города. Результат — во вкладке «3D доска»."
          onChange={(v) => onChange({ enabled: v })}
        />
        <label
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 12, color: TEXT }}
          title="Добавка к seed города: другая раскладка при том же составе города. Пусто — по умолчанию."
        >
          <span>Seed</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <input
              type="text" value={params.seed} maxLength={64}
              onChange={(e) => onChange({ seed: e.target.value })}
              style={{ width: 96, fontSize: 12, color: TEXT, background: FIELD_BG, border: FIELD_BORDER, padding: '2px 4px' }}
            />
            <button
              type="button" title="Другая раскладка"
              onClick={() => onChange({ seed: Math.random().toString(36).slice(2, 8) })}
              style={{ fontSize: 12, color: TEXT, background: FIELD_BG, border: FIELD_BORDER, cursor: 'pointer' }}
            >
              🎲
            </button>
          </span>
        </label>
        <ParamSlider
          label="Отступ от контура" value={params.edgeInset} min={L.edgeInset.min} max={L.edgeInset.max} step={0.5}
          hint="Застройка не подходит к контуру ближе этого: стена с башнями не должна упираться в дома."
          onChange={(v) => onChange({ edgeInset: v })}
        />
      </ParamSection>

      <ParamSection title="Главная площадь">
        <ParamSlider
          label="Порог: города без площади (площадей тайла)" value={params.square.minCityArea}
          min={L.square.minCityArea.min} max={L.square.minCityArea.max} step={0.05}
          hint="Город меньше этой площади (1 = площадь одного тайла) — совсем маленький: главной площади в нём нет, улицы сходятся к центру (polylabel). 0 — площадь везде, где поместится."
          onChange={(v) => onChange({ square: { minCityArea: v } })}
        />
        <ParamSlider
          label="Полный размер с города (площадей тайла)" value={params.square.fullSizeArea}
          min={L.square.fullSizeArea.min} max={L.square.fullSizeArea.max} step={0.1}
          hint="От порога радиус площади растёт вместе с городом (по корню из площади) и достигает максимума при этом размере."
          onChange={(v) => onChange({ square: { fullSizeArea: v } })}
        />
        <ParamSlider
          label="Радиус у порога" value={params.square.minRadius}
          min={L.square.minRadius.min} max={L.square.minRadius.max} step={0.5}
          hint="Радиус площади в городе размером ровно с порог."
          onChange={(v) => onChange({ square: { minRadius: v } })}
        />
        <ParamSlider
          label="Максимальный радиус" value={params.square.maxRadius}
          min={L.square.maxRadius.min} max={L.square.maxRadius.max} step={0.5}
          hint="Реальный радиус ещё ограничен свободным местом вокруг центра: в тесном городе площади может не быть. Центр — полюс недоступности (polylabel)."
          onChange={(v) => onChange({ square: { maxRadius: v } })}
        />
        <ParamSlider
          label="Подъезд к площади (доля радиуса)" value={params.square.approachRatio}
          min={L.square.approachRatio.min} max={L.square.approachRatio.max} step={0.05}
          hint="Площадь — место назначения: каждая главная дорога входит на неё радиальным прямым отрезком этой длины. Вокруг площади сеть улиц обрезается по кольцу «радиус + подъезд»."
          onChange={(v) => onChange({ square: { approachRatio: v } })}
        />
        <ParamSlider
          label="Подъезд не короче" value={params.square.approachMin}
          min={L.square.approachMin.min} max={L.square.approachMin.max} step={0.5}
          onChange={(v) => onChange({ square: { approachMin: v } })}
        />
        <ParamSlider
          label="Подъезд не длиннее" value={params.square.approachMax}
          min={L.square.approachMax.min} max={L.square.approachMax.max} step={0.5}
          onChange={(v) => onChange({ square: { approachMax: v } })}
        />
        <ParamSlider
          label="Проход вокруг площади" value={params.square.passWidth}
          min={L.square.passWidth.min} max={L.square.passWidth.max} step={0.5}
          hint="Минимальная ширина прохода между площадью (с подъездом) и границей застройки. В узком месте города площадь уменьшается, а если совсем не помещается — не строится, чтобы не отрезать часть кварталов."
          onChange={(v) => onChange({ square: { passWidth: v } })}
        />
        <ParamSlider
          label="Зазор до домов" value={params.square.gap} min={L.square.gap.min} max={L.square.gap.max} step={0.5}
          onChange={(v) => onChange({ square: { gap: v } })}
        />
        <ParamSlider
          label="Сторон у круга" value={params.square.segments} min={L.square.segments.min} max={L.square.segments.max} step={1}
          onChange={(v) => onChange({ square: { segments: v } })}
        />
      </ParamSection>

      <ParamSection title="Улицы (Вороной + Лаплас)">
        <ParamSlider
          label="Размер квартала" value={params.streets.blockSize}
          min={L.streets.blockSize.min} max={L.streets.blockSize.max} step={1}
          hint="Расстояние между узлами сети. Меньше — гуще улицы. Число улиц растёт с площадью города."
          onChange={(v) => onChange({ streets: { blockSize: v } })}
        />
        <ParamSlider
          label="Доля второстепенных улиц" value={params.streets.keepFraction}
          min={L.streets.keepFraction.min} max={L.streets.keepFraction.max} step={0.05}
          hint="Сколько рёбер сети остаётся после случайного прореживания. Главные улицы остаются всегда."
          onChange={(v) => onChange({ streets: { keepFraction: v } })}
        />
        <ParamSlider
          label="Сглаживание главных дорог" value={params.streets.mainSmoothing}
          min={L.streets.mainSmoothing.min} max={L.streets.mainSmoothing.max} step={1}
          hint="Итерации Лапласа по точкам главной дороги от арки до площади. Идёт первым и сильнее всего: 0 — ломаный путь по рёбрам Вороного, больше — плавная дуга."
          onChange={(v) => onChange({ streets: { mainSmoothing: v } })}
        />
        <ParamSlider
          label="Прямой участок от арки" value={params.streets.archRun}
          min={L.streets.archRun.min} max={L.streets.archRun.max} step={1}
          hint="Главная дорога выходит из арки прямо, перпендикулярно стене, на это расстояние: сглаживание до него не дотрагивается. Дальше дорога сглаживается свободно, в том числе в зоне отступа у стены."
          onChange={(v) => onChange({ streets: { archRun: v } })}
        />
        <ParamSlider
          label="Дальние дороги (не больше)" value={params.streets.farRoads}
          min={L.streets.farRoads.min} max={L.streets.farRoads.max} step={1}
          hint="Главные дороги от площади в самые удалённые от главной сети концы города: они ведут сеть улиц во все стороны. 0 — выключены. Останавливаются раньше, когда весь город ближе порога к главным дорогам."
          onChange={(v) => onChange({ streets: { farRoads: v } })}
        />
        <ParamSlider
          label="Порог удалённости для дальней дороги" value={params.streets.farCover}
          min={L.streets.farCover.min} max={L.streets.farCover.max} step={1}
          hint="Если какой-то конец города дальше этого от главных дорог — к нему проводится дальняя дорога. Меньше — больше дорог."
          onChange={(v) => onChange({ streets: { farCover: v } })}
        />
        <ParamSlider
          label="Вторичные лучи к площади (не больше)" value={params.streets.maxRays}
          min={L.streets.maxRays.min} max={L.streets.maxRays.max} step={1}
          hint="Сколько вторичных улиц присоединяется к площади радиальными подъездами. Без ворот — не меньше 4. Кварталы, отрезанные площадью, получают луч сверх лимита."
          onChange={(v) => onChange({ streets: { maxRays: v } })}
        />
        <ParamSlider
          label="Разведение въездов (°)" value={params.streets.entranceMinSep}
          min={L.streets.entranceMinSep.min} max={L.streets.entranceMinSep.max} step={1}
          hint="Минимальный угол между въездами главных дорог на площадь: ворота не сходятся в одной точке кромки."
          onChange={(v) => onChange({ streets: { entranceMinSep: v } })}
        />
        <ParamSlider
          label="Разведение лучей (°)" value={params.streets.raySep}
          min={L.streets.raySep.min} max={L.streets.raySep.max} step={1}
          hint="Минимальный угол между вторичными лучами и въездами."
          onChange={(v) => onChange({ streets: { raySep: v } })}
        />
        <ParamSlider
          label="Сглаживание вторичных улиц" value={params.streets.sideSmoothing}
          min={L.streets.sideSmoothing.min} max={L.streets.sideSmoothing.max} step={1}
          hint="Итерации Лапласа для второстепенных улиц. Идёт после главных: концы на главных дорогах уже не двигаются."
          onChange={(v) => onChange({ streets: { sideSmoothing: v } })}
        />
        <ParamSlider
          label="Изгиб улиц" value={params.streets.wobble}
          min={L.streets.wobble.min} max={L.streets.wobble.max} step={0.1}
          hint="Случайный изгиб до сглаживания: убирает слишком прямые участки."
          onChange={(v) => onChange({ streets: { wobble: v } })}
        />
        <ParamSlider
          label="Ширина главных" value={params.streets.mainWidth}
          min={L.streets.mainWidth.min} max={L.streets.mainWidth.max} step={0.5}
          onChange={(v) => onChange({ streets: { mainWidth: v } })}
        />
        <ParamSlider
          label="Ширина второстепенных" value={params.streets.sideWidth}
          min={L.streets.sideWidth.min} max={L.streets.sideWidth.max} step={0.5}
          onChange={(v) => onChange({ streets: { sideWidth: v } })}
        />
        <ParamSlider
          label="Минимальный тупик у стены" value={params.streets.minLength}
          min={L.streets.minLength.min} max={L.streets.minLength.max} step={1}
          hint="Короткие улицы, упирающиеся в стену, удаляются."
          onChange={(v) => onChange({ streets: { minLength: v } })}
        />
      </ParamSection>

      <ParamSection title="Дома">
        <ParamSlider
          label="Заполнение" value={params.houses.fill} min={L.houses.fill.min} max={L.houses.fill.max} step={0.05}
          hint="Вероятность поставить дом в свободный слот вдоль улицы."
          onChange={(v) => onChange({ houses: { fill: v } })}
        />
        <ParamSlider
          label="Размер домов (множитель)" value={params.houses.scale}
          min={L.houses.scale.min} max={L.houses.scale.max} step={0.05}
          onChange={(v) => onChange({ houses: { scale: v } })}
        />
        <ParamCheckbox
          label="Дома вокруг площади" checked={params.houses.squareRing}
          onChange={(v) => onChange({ houses: { squareRing: v } })}
        />
        <ParamSlider
          label="Ширина от" value={params.houses.widthMin} min={L.houses.size.min} max={L.houses.size.max} step={0.5}
          onChange={(v) => onChange({ houses: { widthMin: v } })}
        />
        <ParamSlider
          label="Ширина до" value={params.houses.widthMax} min={L.houses.size.min} max={L.houses.size.max} step={0.5}
          onChange={(v) => onChange({ houses: { widthMax: v } })}
        />
        <ParamSlider
          label="Глубина от" value={params.houses.depthMin} min={L.houses.size.min} max={L.houses.size.max} step={0.5}
          onChange={(v) => onChange({ houses: { depthMin: v } })}
        />
        <ParamSlider
          label="Глубина до" value={params.houses.depthMax} min={L.houses.size.min} max={L.houses.size.max} step={0.5}
          onChange={(v) => onChange({ houses: { depthMax: v } })}
        />
        <ParamSlider
          label="Высота стен от" value={params.houses.wallHeightMin} min={L.houses.height.min} max={L.houses.height.max} step={0.1}
          onChange={(v) => onChange({ houses: { wallHeightMin: v } })}
        />
        <ParamSlider
          label="Высота стен до" value={params.houses.wallHeightMax} min={L.houses.height.min} max={L.houses.height.max} step={0.1}
          onChange={(v) => onChange({ houses: { wallHeightMax: v } })}
        />
        <ParamSlider
          label="Высота крыши от" value={params.houses.roofHeightMin} min={L.houses.height.min} max={L.houses.height.max} step={0.1}
          onChange={(v) => onChange({ houses: { roofHeightMin: v } })}
        />
        <ParamSlider
          label="Высота крыши до" value={params.houses.roofHeightMax} min={L.houses.height.min} max={L.houses.height.max} step={0.1}
          onChange={(v) => onChange({ houses: { roofHeightMax: v } })}
        />
        <ParamSlider
          label="Смещение вершины крыши" value={params.houses.apexJitter}
          min={L.houses.apexJitter.min} max={L.houses.apexJitter.max} step={0.01}
          hint="Доля размера дома. 0 — пирамида строго по центру; больше — крыши разнообразнее."
          onChange={(v) => onChange({ houses: { apexJitter: v } })}
        />
        <ParamSlider
          label="Свес крыши" value={params.houses.roofOverhang}
          min={L.houses.roofOverhang.min} max={L.houses.roofOverhang.max} step={0.01}
          onChange={(v) => onChange({ houses: { roofOverhang: v } })}
        />
        <ParamSlider
          label="Поворот дома (±°)" value={params.houses.yawJitter}
          min={L.houses.yawJitter.min} max={L.houses.yawJitter.max} step={1}
          onChange={(v) => onChange({ houses: { yawJitter: v } })}
        />
        <ParamSlider
          label="Отступ от улицы" value={params.houses.setback}
          min={L.houses.setback.min} max={L.houses.setback.max} step={0.1}
          onChange={(v) => onChange({ houses: { setback: v } })}
        />
        <ParamSlider
          label="Просвет между домами от" value={params.houses.gapMin} min={L.houses.gap.min} max={L.houses.gap.max} step={0.1}
          onChange={(v) => onChange({ houses: { gapMin: v } })}
        />
        <ParamSlider
          label="Просвет между домами до" value={params.houses.gapMax} min={L.houses.gap.min} max={L.houses.gap.max} step={0.1}
          onChange={(v) => onChange({ houses: { gapMax: v } })}
        />
        <ParamSlider
          label="Заглубление основания" value={params.houses.sink} min={L.houses.sink.min} max={L.houses.sink.max} step={0.1}
          hint="Основание уходит под поверхность города: на стыках нет щелей."
          onChange={(v) => onChange({ houses: { sink: v } })}
        />
      </ParamSection>

      <ParamSection title="Анимация появления" defaultOpen={false}>
        <ParamSlider
          label="Рост (доля анимации)" value={params.animation.riseFraction}
          min={L.animation.riseFraction.min} max={L.animation.riseFraction.max} step={0.05}
          hint="За какую часть анимации завершения региона дома вырастают на полную высоту."
          onChange={(v) => onChange({ animation: { riseFraction: v } })}
        />
        <ParamSlider
          label="Старт (доля анимации)" value={params.animation.startDelay}
          min={L.animation.startDelay.min} max={L.animation.startDelay.max} step={0.05}
          hint="Через какую долю анимации региона начинают расти дома: стены уже поднимаются."
          onChange={(v) => onChange({ animation: { startDelay: v } })}
        />
        <ParamSlider
          label="Волна от площади" value={params.animation.stagger}
          min={L.animation.stagger.min} max={L.animation.stagger.max} step={0.05}
          hint="0 — все дома растут разом, как стены. Больше — дома встают по очереди от площади к краям."
          onChange={(v) => onChange({ animation: { stagger: v } })}
        />
        <ParamSlider
          label="Частей роста" value={params.animation.buckets}
          min={L.animation.buckets.min} max={L.animation.buckets.max} step={1}
          hint="На сколько ступеней разбита волна (отдельный меш на каждую). Больше — плавнее, но дороже."
          onChange={(v) => onChange({ animation: { buckets: v } })}
        />
      </ParamSection>

      <ParamSection title="Цвета" defaultOpen={false}>
        {TOWN_COLOR_LABELS.map(({ key, label }) => (
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

      <div><ResetButton onClick={onReset} label="↺ Сбросить застройку" /></div>
    </div>
  );
});
TownControls.displayName = 'TownControls';
