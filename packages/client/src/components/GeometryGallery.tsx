// packages/client/src/components/GeometryGallery.tsx
// ============================================
// 🖼 ГАЛЕРЕЯ ТАЙЛОВ И ДОСКА ШВОВ
// ============================================
// Три режима поверх текущих параметров песочницы:
//   • gallery — все тайлы сеткой, с бейджами ошибок/предупреждений
//   • seams   — случайная доска из совпадающих по портам тайлов;
//               места, где тип поверхности на стыке не сходится,
//               подсвечены красным
//   • board3d — та же доска в 3D (Board3D): инстансинг, тени, пикинг клеток
//
// Любое движение ползунка в левой панели пересчитывает всё сразу —
// видно, как параметр влияет на ВСЕ тайлы, а не на один.
// ============================================
import { memo, useMemo, useState, type CSSProperties } from 'react';
import {
  auditSeams,
  auditTiles,
  formatAuditReport,
  generateSeamBoard,
  summarizeAudits,
  type AuditPipelineOptions,
  type AuditTile,
  type SeamReport,
  type TileAudit,
} from '@/core/geometry/geometryAudit';
import { buildTileBundle, type MeshParamsInput, type TileBundle } from '@/core/geometry/tileMesh';
import { DEFAULT_SPOT_PARAMS } from '@/core/geometry/spots';
import { Board3D, type Board3DHover, type BoardPlacement } from './Board3D';
import { TileGeometryLayers } from './TileGeometryLayers';

// ============================================
// 🎨 СТИЛИ
// ============================================
const COLOR_ERROR = '#ef4444';
const COLOR_WARN = '#f59e0b';
const COLOR_OK = '#22c55e';

const fieldStyle: CSSProperties = {
  background: '#111827',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 12,
};

const buttonStyle: CSSProperties = { ...fieldStyle, cursor: 'pointer', padding: '4px 10px' };

const statusColor = (audit: TileAudit): string =>
  audit.errorCount > 0 ? COLOR_ERROR : audit.warnCount > 0 ? COLOR_WARN : COLOR_OK;

const copyText = (text: string): void => {
  console.log(text);
  void navigator.clipboard?.writeText(text);
};

// ============================================
// 🧩 ГЛАВНЫЙ КОМПОНЕНТ
// ============================================
interface GeometryGalleryProps {
  mode: 'gallery' | 'seams' | 'board3d';
  tiles: readonly AuditTile[];
  /** Должен быть мемоизирован снаружи, иначе всё пересчитывается каждый рендер */
  pipeline: AuditPipelineOptions;
  /** Параметры отстают от ползунков (useDeferredValue) */
  isPending?: boolean;
  /** Параметры меша для 3D (высоты, цвета, стены) */
  meshParams?: MeshParamsInput;
  onOpenTile: (tileId: string) => void;
}

export const GeometryGallery = ({
  mode,
  tiles,
  pipeline,
  isPending = false,
  meshParams,
  onOpenTile,
}: GeometryGalleryProps) => {
  const audits = useMemo(() => auditTiles(tiles, pipeline), [tiles, pipeline]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {isPending && <div style={{ color: '#9ca3af', fontSize: 12 }}>⏳ Пересчёт…</div>}
      {mode === 'gallery' ? (
        <GalleryGrid
          audits={audits}
          spotRadius={pipeline.geometryParams?.spots.meepleRadius ?? DEFAULT_SPOT_PARAMS.meepleRadius}
          onOpenTile={onOpenTile}
        />
      ) : (
        <SeamBoard
          tiles={tiles}
          audits={audits}
          view3d={mode === 'board3d'}
          meshParams={meshParams}
          onOpenTile={onOpenTile}
        />
      )}
    </div>
  );
};

// ============================================
// 🖼 СЕТКА ТАЙЛОВ
// ============================================
interface GalleryGridProps {
  audits: readonly TileAudit[];
  /** Радиус фигурки мипла для кружков спотов */
  spotRadius: number;
  onOpenTile: (tileId: string) => void;
}

const GalleryGrid = ({ audits, spotRadius, onOpenTile }: GalleryGridProps) => {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [cellSize, setCellSize] = useState(190);
  const [showVertices, setShowVertices] = useState(false);
  const [showSpots, setShowSpots] = useState(true);

  const summary = useMemo(() => summarizeAudits(audits), [audits]);

  const visible = useMemo(() => {
    const list = onlyProblems ? audits.filter((a) => a.issues.length > 0) : [...audits];
    // Сначала самые проблемные
    return list.sort((a, b) => b.errorCount - a.errorCount || b.warnCount - a.warnCount);
  }, [audits, onlyProblems]);

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, fontSize: 12, color: '#ccc' }}>
        <span>Тайлов: <b>{summary.tiles}</b></span>
        <span style={{ color: summary.tilesWithErrors > 0 ? COLOR_ERROR : COLOR_OK }}>
          С ошибками: <b>{summary.tilesWithErrors}</b>
        </span>
        <span style={{ color: summary.tilesWithWarnings > 0 ? COLOR_WARN : COLOR_OK }}>
          Только предупреждения: <b>{summary.tilesWithWarnings}</b>
        </span>
        <span>Вершин: <b>{summary.totalVertices}</b></span>
        <span>Расчёт: <b>{Math.round(summary.elapsedMs)} мс</b></span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, fontSize: 12, color: '#ccc' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          Только проблемные
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showVertices} onChange={(e) => setShowVertices(e.target.checked)} />
          Вершины
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showSpots} onChange={(e) => setShowSpots(e.target.checked)} />
          Споты
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Размер
          <input
            type="range" min={110} max={320} step={10} value={cellSize}
            onChange={(e) => setCellSize(Number(e.target.value))}
          />
        </label>
        <button type="button" style={buttonStyle} onClick={() => copyText(formatAuditReport(audits))}>
          📋 Копировать отчёт
        </button>
      </div>

      {visible.length === 0 && (
        <div style={{ color: COLOR_OK, fontSize: 13, padding: 16 }}>✅ Проблем не найдено</div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${cellSize}px, 1fr))`,
          gap: 10,
        }}
      >
        {visible.map((audit) => (
          <GalleryCell
            key={audit.tileId}
            audit={audit}
            showVertices={showVertices}
            showSpots={showSpots}
            spotRadius={spotRadius}
            onOpen={onOpenTile}
          />
        ))}
      </div>
    </>
  );
};

// ============================================
// 🔲 ЯЧЕЙКА ГАЛЕРЕИ
// ============================================
interface GalleryCellProps {
  audit: TileAudit;
  showVertices: boolean;
  showSpots: boolean;
  spotRadius: number;
  onOpen: (tileId: string) => void;
}

const GalleryCell = memo(({ audit, showVertices, showSpots, spotRadius, onOpen }: GalleryCellProps) => {
  const color = statusColor(audit);
  const tooltip = audit.issues.length
    ? audit.issues.map((i) => `${i.severity === 'error' ? '✖' : '⚠'} ${i.message}`).join('\n')
    : 'Проблем нет';

  return (
    <button
      type="button"
      title={tooltip}
      onClick={() => onOpen(audit.tileId)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4, padding: 6, textAlign: 'left',
        background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}`, borderRadius: 6,
        cursor: 'pointer', color: '#e5e7eb',
      }}
    >
      <svg viewBox="-53 -53 106 106" width="100%" style={{ display: 'block', background: '#0b1020', borderRadius: 4 }}>
        <TileGeometryLayers audit={audit} showVertices={showVertices} showSpots={showSpots} spotRadius={spotRadius} />
        <rect x={-50} y={-50} width={100} height={100} fill="none" stroke={COLOR_ERROR} strokeWidth={0.4} strokeDasharray="2 1.5" opacity={0.7} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 11 }}>
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {audit.tileId}
        </span>
        <span style={{ color, flexShrink: 0 }}>
          {audit.errorCount === 0 && audit.warnCount === 0
            ? '✅'
            : `${audit.errorCount > 0 ? `✖${audit.errorCount} ` : ''}${audit.warnCount > 0 ? `⚠${audit.warnCount}` : ''}`}
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: '#9ca3af' }}>
        {audit.totalVertices} вершин · seed {audit.seed}
      </div>
    </button>
  );
});
GalleryCell.displayName = 'GalleryCell';

// ============================================
// 🧵 ДОСКА ШВОВ
// ============================================
interface SeamBoardProps {
  tiles: readonly AuditTile[];
  audits: readonly TileAudit[];
  /** Рисовать доску в 3D вместо SVG */
  view3d: boolean;
  meshParams?: MeshParamsInput;
  onOpenTile: (tileId: string) => void;
}

const SeamBoard = ({ tiles, audits, view3d, meshParams, onOpenTile }: SeamBoardProps) => {
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(4);
  const [boardSeed, setBoardSeed] = useState('seam-board');
  const [reroll, setReroll] = useState(0);
  const [showVertices, setShowVertices] = useState(false);
  const [showBorders, setShowBorders] = useState(true);
  const [shadows, setShadows] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [hover, setHover] = useState<Board3DHover | null>(null);

  const board = useMemo(
    () => generateSeamBoard(tiles, cols, rows, `${boardSeed}#${reroll}`),
    [tiles, cols, rows, boardSeed, reroll]
  );

  const auditById = useMemo(() => new Map(audits.map((a) => [a.tileId, a])), [audits]);

  // Меши строятся только для 3D-режима. Один бандл на тайл, дальше работает инстансинг
  const bundles = useMemo<ReadonlyMap<string, TileBundle>>(() => {
    if (!view3d) return new Map();
    return new Map(
      audits.map((audit) => [
        audit.tileId,
        buildTileBundle(
          {
            tileId: audit.tileId,
            artId: audit.artId,
            features: audit.features,
            geometry: audit.geometry,
            spots: audit.spots,
          },
          meshParams
        ),
      ])
    );
  }, [view3d, audits, meshParams]);

  const placements = useMemo<BoardPlacement[]>(
    () =>
      (board ?? []).map((placed) => ({
        key: `${placed.col},${placed.row}`,
        tileId: placed.tile.id,
        col: placed.col,
        row: placed.row,
        rotation: placed.rotation,
      })),
    [board]
  );

  const meshTotals = useMemo(() => {
    let triangles = 0;
    for (const placement of placements) triangles += bundles.get(placement.tileId)?.mesh.stats.triangles ?? 0;
    return triangles;
  }, [placements, bundles]);

  const report: SeamReport | null = useMemo(
    () => (board ? auditSeams(board, auditById) : null),
    [board, auditById]
  );

  const worstPairs = useMemo(
    () =>
      report
        ? [...report.pairs]
            .filter((p) => p.mismatchFraction > 0)
            .sort((a, b) => b.mismatchFraction - a.mismatchFraction)
            .slice(0, 6)
        : [],
    [report]
  );

  const pad = 6;

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 12, color: '#ccc' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Колонки
          <input
            type="number" min={2} max={10} value={cols} style={{ ...fieldStyle, width: 52 }}
            onChange={(e) => setCols(Math.max(2, Math.min(10, Number(e.target.value) || 2)))}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Строки
          <input
            type="number" min={2} max={8} value={rows} style={{ ...fieldStyle, width: 52 }}
            onChange={(e) => setRows(Math.max(2, Math.min(8, Number(e.target.value) || 2)))}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Seed доски
          <input
            type="text" value={boardSeed} style={{ ...fieldStyle, width: 120 }}
            onChange={(e) => { setBoardSeed(e.target.value); setReroll(0); }}
          />
        </label>
        <button type="button" style={buttonStyle} onClick={() => setReroll((n) => n + 1)}>🎲 Новая доска</button>
        {view3d ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={shadows} onChange={(e) => setShadows(e.target.checked)} />
              Тени
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
              Каркас
            </label>
          </>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showBorders} onChange={(e) => setShowBorders(e.target.checked)} />
              Границы тайлов
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showVertices} onChange={(e) => setShowVertices(e.target.checked)} />
              Вершины
            </label>
          </>
        )}
        {report && (
          <button type="button" style={buttonStyle} onClick={() => copyText(formatAuditReport(audits, report))}>
            📋 Копировать отчёт
          </button>
        )}
      </div>

      {!board && (
        <div style={{ color: COLOR_ERROR, fontSize: 13 }}>
          ✖ Не удалось собрать доску с совпадающими портами. Попробуйте «Новая доска» или меньший размер.
        </div>
      )}

      {board && report && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#ccc' }}>
            <span>Стыков: <b>{report.pairs.length}</b></span>
            <span style={{ color: report.badPairs > 0 ? COLOR_ERROR : COLOR_OK }}>
              С расхождением: <b>{report.badPairs}</b>
            </span>
            <span>Худший стык: <b>{(report.worstFraction * 100).toFixed(1)}%</b></span>
            <span>
              Несовпавших выборок:{' '}
              <b>{report.totalSamples ? ((report.mismatchedSamples / report.totalSamples) * 100).toFixed(2) : 0}%</b>
            </span>
          </div>

          {view3d ? (
            <>
              <Board3D
                placements={placements}
                bundles={bundles}
                cols={cols}
                rows={rows}
                shadows={shadows}
                wireframe={wireframe}
                onHover={setHover}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#ccc', fontFamily: 'monospace' }}>
                <span>
                  {hover
                    ? `клетка (${hover.col}, ${hover.row})` +
                      (hover.placement
                        ? ` · ${hover.placement.tileId} · поворот ${hover.placement.rotation}°`
                        : ' · пусто') +
                      (hover.featureId ? ` · ${hover.featureId} [${hover.surface}]` : '')
                    : 'Наведите курсор на доску'}
                </span>
                <span>треугольников на сцене: {meshTotals}</span>
                <span>ЛКМ — панорама · ПКМ — вращение · колесо — зум</span>
              </div>
            </>
          ) : (
            <svg
            viewBox={`${-50 - pad} ${-50 - pad} ${cols * 100 + 2 * pad} ${rows * 100 + 2 * pad}`}
            width="100%"
            style={{ display: 'block', maxHeight: '68vh', background: '#0b1020', borderRadius: 6 }}
          >
            {board.map((placed) => {
              const audit = auditById.get(placed.tile.id);
              if (!audit) return null;
              return (
                <g
                  key={`${placed.col}-${placed.row}`}
                  transform={`translate(${placed.col * 100} ${placed.row * 100}) rotate(${placed.rotation})`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onOpenTile(placed.tile.id)}
                >
                  <TileGeometryLayers audit={audit} showVertices={showVertices} />
                  {showBorders && (
                    <rect
                      x={-50} y={-50} width={100} height={100} fill="none"
                      stroke="#ffffff" strokeOpacity={0.25} strokeWidth={0.4} pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}

            {/* Расхождения на стыках */}
            {report.pairs.flatMap((pair, pi) =>
              pair.mismatchSegments.map((seg, si) => (
                <line
                  key={`bad-${pi}-${si}`}
                  x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                  stroke={COLOR_ERROR} strokeWidth={2.4} strokeLinecap="round" pointerEvents="none"
                />
              ))
            )}
            </svg>
          )}

          {worstPairs.length > 0 && (
            <div style={{ fontSize: 12, color: '#ccc' }}>
              <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Худшие стыки</div>
              {worstPairs.map((pair, i) => {
                const a = board[pair.a];
                const b = board[pair.b];
                return (
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                    {a.tile.id} ({a.col},{a.row}) ↔ {b.tile.id} ({b.col},{b.row}):{' '}
                    {(pair.mismatchFraction * 100).toFixed(1)}% · {pair.kinds.join(', ')}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
};
