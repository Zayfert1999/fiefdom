// packages/client/src/sandbox/view/TileToolbar.tsx
// ============================================
// 🔍 ИНСТРУМЕНТЫ ВКЛАДКИ «ТАЙЛ»
// ============================================
// Выбор тайла, слои визуализации и легенда. Влияют только на вкладку «Тайл»,
// поэтому живут в правой области, под переключателем вкладок.
// ============================================
import { memo } from 'react';
import type { SandboxTile, TileLayers } from '../types';
import { COLORS } from './colors';

// ============================================
// 📚 ЛЕГЕНДА
// ============================================

const Legend = memo(() => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 11, color: '#ccc', marginTop: 4 }}>
    {[
      { label: 'Поле', color: COLORS.field },
      { label: 'Дорога', color: COLORS.road },
      { label: 'Город', color: COLORS.city },
      { label: 'Монастырь', color: COLORS.monastery },
      { label: 'Площадь', color: COLORS.plaza },
      { label: 'Щит', color: COLORS.shield },
      { label: 'Мипл', color: COLORS.meeple },
    ].map((item) => (
      <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 9, height: 9, background: item.color, border: '1px solid #fff', flexShrink: 0 }} />
        {item.label}
      </span>
    ))}
  </div>
));
Legend.displayName = 'Legend';

const LAYER_TOGGLES: ReadonlyArray<{ key: keyof TileLayers; label: string }> = [
  { key: 'grid', label: '🔲 Сетка' },
  { key: 'axes', label: '➕ Оси' },
  { key: 'spots', label: '🔶 Споты (ручные)' },
  { key: 'autoSpots', label: '📍 Споты (авто)' },
  { key: 'ports', label: '📍 Порты' },
  { key: 'geometry', label: '🎨 Геометрия' },
  { key: 'vertices', label: '🔹 Вершины тесселяции' },
];

interface TileToolbarProps {
  tiles: readonly SandboxTile[];
  selectedTileId: string;
  onSelectTile: (id: string) => void;
  layers: TileLayers;
  onToggleLayer: (key: keyof TileLayers, value: boolean) => void;
}

export const TileToolbar = memo(({ tiles, selectedTileId, onSelectTile, layers, onToggleLayer }: TileToolbarProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', marginBottom: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>🎛 Тайл</label>
      <select
        value={selectedTileId}
        onChange={(e) => onSelectTile(e.target.value)}
        style={{ flex: 1, minWidth: 0, background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
      >
        {tiles.map((tile) => (
          <option key={tile.id} value={tile.id}>{tile.id} (×{tile.quantity})</option>
        ))}
      </select>
    </div>

    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px' }}>
      <span style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>👁 Слои</span>
      {LAYER_TOGGLES.map(({ key, label }) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ccc', fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={layers[key]} onChange={(e) => onToggleLayer(key, e.target.checked)} />
          {label}
        </label>
      ))}
    </div>

    <Legend />
  </div>
));
TileToolbar.displayName = 'TileToolbar';
