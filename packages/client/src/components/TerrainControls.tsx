// packages/client/src/components/TerrainControls.tsx
// ============================================
// ⛰️ ПАНЕЛЬ РЕЛЬЕФА ПОЛЕЙ (песочница геометрии)
// ============================================
// «Глупый» компонент: получает ПОЛНЫЕ параметры рельефа и отдаёт наружу
// ПОЛНЫЙ обновлённый объект. Поэтому patchMesh песочницы (он подмешивает
// только heights и colors) править не нужно.
//
// Подключение в GeometrySandbox — сразу после <MeshControls … />:
//   <TerrainControls params={meshParams.terrain} onChange={(terrain) => patchMesh({ terrain })} />
// ============================================
import { memo } from 'react';
import { DEFAULT_TERRAIN_PARAMS, type TerrainEdgeMode, type TerrainParams } from '@/core/geometry/terrain';
import { ParamCheckbox, ParamSection, ParamSelect, ParamSlider } from './SandboxParamControls';

interface TerrainControlsProps {
  params: TerrainParams;
  /** Всегда полный набор параметров рельефа */
  onChange: (next: TerrainParams) => void;
}

const EDGE_OPTIONS: ReadonlyArray<{ value: TerrainEdgeMode; label: string }> = [
  { value: 'shared', label: 'Общий профиль (холмы перетекают на соседей)' },
  { value: 'flat', label: 'Плоский край (рельеф сходит в ноль)' },
];

export const TerrainControls = memo(({ params, onChange }: TerrainControlsProps) => {
  const patch = (part: Partial<TerrainParams>): void => onChange({ ...params, ...part });
  const off = !params.enabled;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>⛰️ Рельеф полей (3D)</div>

      <ParamCheckbox
        label="Объёмные поля"
        checked={params.enabled}
        hint="Выключено — поля плоские. Дороги, площади и города рельефа не получают."
        onChange={(enabled) => patch({ enabled })}
      />

      <ParamSection title="Форма">
        <ParamSlider
          label="Амплитуда (юниты)" value={params.amplitude} min={0} max={20} step={0.25} disabled={off}
          hint="Максимальный подъём поля над плоским уровнем. Поле никогда не опускается ниже него."
          onChange={(amplitude) => patch({ amplitude })}
        />
        <ParamSlider
          label="Контраст" value={params.contrast} min={0.3} max={4} step={0.1} disabled={off}
          hint="Больше 1 — широкие низины и острые вершины, меньше 1 — плато."
          onChange={(contrast) => patch({ contrast })}
        />
        <ParamSlider
          label="Частота шума" value={params.frequency} min={0.005} max={0.15} step={0.005} disabled={off}
          hint="0.03 ≈ три холма на тайл."
          onChange={(frequency) => patch({ frequency })}
        />
        <ParamSlider
          label="Октавы" value={params.octaves} min={1} max={6} step={1} disabled={off}
          onChange={(octaves) => patch({ octaves })}
        />
        <ParamSlider
          label="Lacunarity" value={params.lacunarity} min={1} max={4} step={0.1} disabled={off}
          onChange={(lacunarity) => patch({ lacunarity })}
        />
        <ParamSlider
          label="Gain" value={params.gain} min={0.1} max={0.9} step={0.05} disabled={off}
          onChange={(gain) => patch({ gain })}
        />
      </ParamSection>

      <ParamSection title="Стыки и края">
        <ParamSelect
          label="Край тайла" value={params.edgeMode} options={EDGE_OPTIONS} disabled={off}
          hint="Общий профиль не зависит от тайла и поворота: соседи совпадают на стыке без ступенек."
          onChange={(edgeMode) => patch({ edgeMode })}
        />
        <ParamSlider
          label="Ширина перехода у края" value={params.edgeFade} min={0} max={50} step={1} disabled={off}
          hint="На каком расстоянии от границы тайла рельеф достигает полной силы."
          onChange={(edgeFade) => patch({ edgeFade })}
        />
        <ParamSlider
          label="Высота на краю (0..1)" value={params.edgeLevel} min={0} max={1} step={0.05}
          disabled={off || params.edgeMode !== 'shared'}
          onChange={(edgeLevel) => patch({ edgeLevel })}
        />
        <ParamSlider
          label="Затухание у дорог и городов" value={params.featureFade} min={0} max={30} step={0.5} disabled={off}
          hint="0 — поле обрывается стеной прямо у края дороги/города."
          onChange={(featureFade) => patch({ featureFade })}
        />
      </ParamSection>

      <ParamSection title="Детализация" defaultOpen={false}>
        <ParamSlider
          label="Шаг сетки (юниты)" value={params.gridStep} min={1.5} max={10} step={0.5} disabled={off}
          hint="Длина ребра треугольников на верхе поля (сетка ровная, ≈ этому шагу). Меньше — гладче рельеф, но больше треугольников."
          onChange={(gridStep) => patch({ gridStep })}
        />
        <ParamSlider
          label="Лимит вершин на полигон" value={params.maxVertices} min={500} max={20000} step={500} disabled={off}
          onChange={(maxVertices) => patch({ maxVertices })}
        />
        <ParamSlider
          label="Подсветка высот цветом" value={params.heightTint} min={0} max={1} step={0.05} disabled={off}
          hint="Возвышенности чуть светлее — рельеф читается и без теней."
          onChange={(heightTint) => patch({ heightTint })}
        />
      </ParamSection>

      <div>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_TERRAIN_PARAMS })}
          style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
        >
          ↺ Сбросить рельеф
        </button>
      </div>
    </div>
  );
});
TerrainControls.displayName = 'TerrainControls';
