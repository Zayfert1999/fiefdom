// packages/client/src/sandbox/view/TileDiagnostics.tsx
// ============================================
// 🩺 ДИАГНОСТИКА ТАЙЛА
// ============================================
// Выход за границу тайла, число вершин, таблица спотов, найденные аудитом
// проблемы, предупреждения генератора и фичи без полигонов.
// Возвращает фрагмент: блоки встают в колонку SandboxTileView.
// ============================================
import { memo, useMemo } from 'react';
import { measureOutOfTile } from '@/core/geometry';
import type { TileGeometryResult } from '@/core/geometry';
import type { TileAudit } from '@/core/geometry/geometryAudit';
import type { TileFeature } from '@fiefdom/shared/core/types';

interface TileDiagnosticsProps {
  size: number;
  result: TileGeometryResult;
  orderedFeatures: readonly TileFeature[];
  audit: TileAudit;
  warnings: readonly string[];
  meepleRadius: number;
}

export const TileDiagnostics = memo(({ size, result, orderedFeatures, audit, warnings, meepleRadius }: TileDiagnosticsProps) => {
  const { tessellation, clipping, assignments } = result;

  // Максимальный выход геометрии за квадрат тайла (0 = всё внутри)
  const overshoot = useMemo(() => measureOutOfTile(tessellation), [tessellation]);

  // Число вершин после тесселяции и шума
  const vertexStats = useMemo(() => {
    const rows: { id: string; points: number }[] = [];
    for (const [id, multi] of tessellation.areas) {
      const points = multi.reduce(
        (sum, polygon) => sum + polygon.reduce((acc, ring) => acc + ring.length, 0),
        0
      );
      rows.push({ id, points });
    }
    for (const [id, line] of tessellation.lines) {
      rows.push({ id, points: line.center.length });
    }
    return rows;
  }, [tessellation]);

  // ============================================
  // 🩺 ДИАГНОСТИКА
  // ============================================
  const missingGeometry = useMemo(() => {
    const missing: string[] = [];
    for (const feature of orderedFeatures) {
      if (feature.type === 'field') {
        if (!assignments.fieldGeometries.has(feature.id)) {
          missing.push(`field:${feature.id}`);
        }
      } else if (feature.geometry?.kind === 'area') {
        if (!tessellation.areas.has(feature.id)) {
          missing.push(`area:${feature.id}`);
        }
      } else if (feature.geometry?.kind === 'line') {
        if (!clipping.clippedLines.has(feature.id)) {
          missing.push(`line:${feature.id}`);
        }
      }
    }
    if (missing.length > 0) {
      console.warn(`⚠️ [Sandbox] Нет полигонов: ${missing.join(', ')}`);
    }
    return missing;
  }, [orderedFeatures, assignments, tessellation, clipping]);

  return (
    <>
  {/* 🩺 ДИАГНОСТИКА ТЕССЕЛЯЦИИ И ШУМА */}
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#aaa' }}>
    <span style={{ color: overshoot > 0 ? '#fca5a5' : '#86efac', fontWeight: 600 }}>
      {overshoot > 0
        ? `⚠️ Выход за тайл: ${overshoot.toFixed(2)} ед.`
        : '✅ Вся геометрия внутри тайла'}
    </span>
    {vertexStats.map((row) => (
      <span key={row.id} style={{ fontFamily: 'monospace' }}>
        {row.id}: {row.points} т.
      </span>
    ))}
  </div>

  {/* 📍 СПОТЫ: вычисленные против прежних ручных */}
  {audit.spots.size > 0 && (
    <details style={{ fontSize: 12, color: '#ccc' }}>
      <summary style={{ cursor: 'pointer', color: '#fff', fontWeight: 600 }}>
        📍 Споты ({audit.spots.size}) · наименьший запас {audit.minSpotClearance.toFixed(1)} при радиусе мипла {meepleRadius}
      </summary>
      <table style={{ borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 11.5, marginTop: 4 }}>
        <thead>
          <tr style={{ color: '#9ca3af', textAlign: 'left' }}>
            <th style={{ paddingRight: 12 }}>фича</th>
            <th style={{ paddingRight: 12 }}>авто (x, y)</th>
            <th style={{ paddingRight: 12 }}>запас</th>
            <th style={{ paddingRight: 12 }}>Δ ручной</th>
            <th>способ</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(audit.spots.entries()).map(([featureId, spot]) => {
            const tight = spot.clearance < meepleRadius;
            return (
              <tr key={featureId} style={{ color: tight ? '#fcd34d' : '#ccc' }}>
                <td style={{ paddingRight: 12 }}>{featureId}</td>
                <td style={{ paddingRight: 12 }}>{spot.meeple[0].toFixed(1)}, {spot.meeple[1].toFixed(1)}</td>
                <td style={{ paddingRight: 12 }}>{spot.clearance.toFixed(1)}{tight ? ' ⚠' : ''}</td>
                <td style={{ paddingRight: 12 }}>
                  {audit.spotDeltas[featureId] === undefined ? '—' : audit.spotDeltas[featureId].toFixed(1)}
                </td>
                <td>{spot.method === 'pole' ? 'полюс' : 'ось'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  )}

  {/* 🚦 ПРОБЛЕМЫ, НАЙДЕННЫЕ АУДИТОМ (ошибки генерации показываются ниже отдельно) */}
  {audit.issues.some((issue) => issue.code !== 'generation') && (
    <div style={{ fontSize: 12, color: '#ddd', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>🚦 Аудит геометрии</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {audit.issues
          .filter((issue) => issue.code !== 'generation')
          .map((issue, index) => (
            <li key={`${issue.code}-${index}`} style={{ color: issue.severity === 'error' ? '#fca5a5' : '#fcd34d' }}>
              <span style={{ fontFamily: 'monospace', opacity: 0.7 }}>[{issue.code}]</span> {issue.message}
            </li>
          ))}
      </ul>
    </div>
  )}

  {/* ⚠️ ПРЕДУПРЕЖДЕНИЯ */}
  {(warnings.length > 0 || missingGeometry.length > 0) && (
    <div style={{ maxWidth: size * 2 + 32, padding: 8, borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fecaca', fontSize: 12, lineHeight: 1.4 }}>
      {warnings.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Предупреждения генератора</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </>
      )}
      {missingGeometry.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginTop: warnings.length > 0 ? 8 : 0, marginBottom: 4 }}>🚫 Нет полигонов</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{missingGeometry.join(', ')}</div>
        </>
      )}
    </div>
  )}
    </>
  );
});
TileDiagnostics.displayName = 'TileDiagnostics';
