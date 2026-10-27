// packages/client/src/components/SandboxParamsBar.tsx
// ============================================
// 💾 ПАНЕЛЬ ФАЙЛА ПАРАМЕТРОВ
// ============================================
// Показывает, совпадают ли параметры песочницы с geometryParams.json,
// и умеет:
//   • сохранить в файл на диске (dev-сервер Vite, эндпоинт /__geometry-params)
//   • скачать / скопировать JSON (если запись на диск недоступна)
//   • загрузить JSON из файла (с проверкой и списком замечаний)
//   • откатить к сохранённому и сбросить к значениям по умолчанию из кода
// ============================================
import { memo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import {
  parseGeometryParams,
  serializeGeometryParams,
  type GeometryParams,
} from '@/core/geometry/geometryParams';
import { GEOMETRY_PARAMS_FILE } from '@/core/geometry/loadedGeometryParams';

interface Status {
  kind: 'ok' | 'error' | 'info';
  text: string;
}

interface SandboxParamsBarProps {
  params: GeometryParams;
  /** Параметры отличаются от сохранённых */
  dirty: boolean;
  /** Замечания к файлу, найденные при его чтении при старте */
  fileWarnings: readonly string[];
  /** Запись на диск удалась: эти параметры теперь «сохранённые» */
  onSaved: (params: GeometryParams) => void;
  /** Параметры загружены из выбранного файла */
  onLoad: (params: GeometryParams) => void;
  /** Вернуть сохранённые параметры */
  onRevert: () => void;
  /** Вернуть значения по умолчанию из кода */
  onResetDefaults: () => void;
}

const buttonStyle: CSSProperties = {
  background: '#111827',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
};

const STATUS_COLORS: Record<Status['kind'], string> = {
  ok: '#86efac',
  error: '#fca5a5',
  info: '#93c5fd',
};

export const SandboxParamsBar = memo(({
  params,
  dirty,
  fileWarnings,
  onSaved,
  onLoad,
  onRevert,
  onResetDefaults,
}: SandboxParamsBarProps) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleSave = async (): Promise<void> => {
    setBusy(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}__geometry-params`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeGeometryParams(params),
      });
      const body = (await response.json().catch(() => null)) as
        { ok?: boolean; file?: string; error?: string } | null;

      if (response.ok && body?.ok) {
        onSaved(params);
        setStatus({ kind: 'ok', text: `Сохранено: ${body.file ?? GEOMETRY_PARAMS_FILE}` });
      } else {
        setStatus({
          kind: 'error',
          text: `${body?.error ?? `Ответ сервера ${response.status}`}. Скачайте файл и положите в ${GEOMETRY_PARAMS_FILE}`,
        });
      }
    } catch {
      setStatus({
        kind: 'error',
        text: `Запись на диск недоступна (нужен dev-сервер Vite). Скачайте файл и положите в ${GEOMETRY_PARAMS_FILE}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = (): void => {
    const blob = new Blob([serializeGeometryParams(params)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'geometryParams.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: 'info', text: `Файл скачан. Положите его в ${GEOMETRY_PARAMS_FILE}` });
  };

  const handleCopy = (): void => {
    const text = serializeGeometryParams(params);
    console.log('📋 [Sandbox] geometryParams.json:\n' + text);
    void navigator.clipboard?.writeText(text);
    setStatus({ kind: 'info', text: 'JSON скопирован в буфер обмена' });
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = parseGeometryParams(JSON.parse(await file.text()));
      onLoad(parsed.params);
      setStatus(
        parsed.warnings.length === 0
          ? { kind: 'ok', text: `Загружено: ${file.name}` }
          : {
            kind: 'info',
            text: `Загружено: ${file.name}, замечаний: ${parsed.warnings.length}. ${parsed.warnings.slice(0, 3).join('; ')}`,
          }
      );
    } catch (error) {
      setStatus({
        kind: 'error',
        text: `Не удалось прочитать файл: ${error instanceof Error ? error.message : 'ошибка'}`,
      });
    }
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', marginBottom: 12,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: '#fff', fontWeight: 700 }}>💾 Файл параметров</span>
        <span style={{ color: dirty ? '#fcd34d' : '#86efac' }}>
          {dirty ? '● есть несохранённые изменения' : '✓ совпадает с файлом'}
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: '#9ca3af', wordBreak: 'break-all' }}>{GEOMETRY_PARAMS_FILE}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button
          type="button"
          style={{ ...buttonStyle, background: dirty ? '#2563eb' : '#111827', opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={() => void handleSave()}
        >
          💾 Сохранить
        </button>
        <button type="button" style={buttonStyle} onClick={handleDownload}>⬇ Скачать</button>
        <button type="button" style={buttonStyle} onClick={handleCopy}>📋 Копировать</button>
        <button type="button" style={buttonStyle} onClick={() => fileInput.current?.click()}>📂 Загрузить…</button>
        <button type="button" style={{ ...buttonStyle, opacity: dirty ? 1 : 0.45 }} disabled={!dirty} onClick={onRevert}>
          ↩ Откатить
        </button>
        <button type="button" style={buttonStyle} onClick={onResetDefaults}>
          ↺ По умолчанию
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(event) => void handleFile(event)}
        />
      </div>

      {status && (
        <div style={{ fontSize: 11.5, color: STATUS_COLORS[status.kind], lineHeight: 1.35 }}>{status.text}</div>
      )}

      {fileWarnings.length > 0 && (
        <details style={{ fontSize: 11, color: '#fcd34d' }}>
          <summary style={{ cursor: 'pointer' }}>⚠ Замечания к файлу при старте: {fileWarnings.length}</summary>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {fileWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
});
SandboxParamsBar.displayName = 'SandboxParamsBar';
