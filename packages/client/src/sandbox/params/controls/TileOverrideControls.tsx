// packages/client/src/sandbox/params/controls/TileOverrideControls.tsx
import { memo } from 'react';
import { TEXT, MUTED, FIELD_BG, FIELD_BORDER, ParamSelect, ResetButton } from './base';
import type {
  ShieldAnchor,
} from '@/core/geometry';
import type { TileParamOverride } from '@/core/geometry/geometryParams';

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
