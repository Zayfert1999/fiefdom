// packages/client/src/components/ParamGroup.tsx
// ============================================
// 🗂 СВОРАЧИВАЕМЫЕ БЛОКИ ПАРАМЕТРОВ ПЕСОЧНИЦЫ
// ============================================
// Два уровня сворачивания:
//   • ParamGroup   — верхний блок («Формы», «Шум Перлина», «Городские стены»…).
//                    По умолчанию свёрнут; в заголовке — краткий статус (meta)
//                    и жёлтая точка, если параметры блока отличаются от файла.
//   • ParamSection — подсекция внутри блока («Башни», «Ворота», «Цвета»…).
//
// Раскрытое/свёрнутое состояние запоминается в localStorage (блоки и подсекции
// внутри блоков), поэтому после перезагрузки страницы панель выглядит так же.
// «Свернуть всё» — collapseAllParamGroups().
//
// Файл самодостаточный: SandboxParamControls его реэкспортирует,
// так что прежние импорты ParamSection продолжают работать.
// ============================================
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_PREFIX = 'fiefdom:sandbox:open:';
const COLLAPSE_ALL_EVENT = 'fiefdom:sandbox:collapse-all';

const readOpen = (key: string, fallback: boolean): boolean => {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
};

const writeOpen = (key: string, open: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, open ? '1' : '0');
  } catch {
    // приватный режим или переполнена квота: состояние просто не запомнится
  }
};

/** «Раскрыто» с запоминанием. Без key — обычное локальное состояние. */
const useRememberedOpen = (key: string | null, defaultOpen: boolean) => {
  const [open, setOpenState] = useState(() => (key ? readOpen(key, defaultOpen) : defaultOpen));
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (key) writeOpen(key, next);
    },
    [key]
  );
  return [open, setOpen] as const;
};

/** Свернуть все блоки (подсекции внутри сохраняют своё состояние) */
export const collapseAllParamGroups = (): void => {
  window.dispatchEvent(new Event(COLLAPSE_ALL_EVENT));
};

/** Сравнение двух кусков параметров независимо от порядка ключей */
const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : v
  );

export const paramsDiffer = (a: unknown, b: unknown): boolean => stableStringify(a) !== stableStringify(b);

// ============================================
// 📦 БЛОК
// ============================================

/** id блока: из него строится ключ запоминания для подсекций внутри */
const GroupIdContext = createContext<string | null>(null);

interface ParamGroupProps {
  /** Уникальный ключ блока (для запоминания состояния) */
  id: string;
  title: string;
  /** Короткий статус справа в заголовке: «вкл», «выкл», «не сохранено» */
  meta?: string;
  /** Параметры блока отличаются от сохранённого файла */
  changed?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export const ParamGroup = ({ id, title, meta, changed = false, defaultOpen = false, children }: ParamGroupProps) => {
  const [open, setOpen] = useRememberedOpen(`group:${id}`, defaultOpen);

  useEffect(() => {
    const collapse = (): void => setOpen(false);
    window.addEventListener(COLLAPSE_ALL_EVENT, collapse);
    return () => window.removeEventListener(COLLAPSE_ALL_EVENT, collapse);
  }, [setOpen]);

  return (
    <details
      open={open}
      onToggle={(e) => {
        if (e.target === e.currentTarget) setOpen(e.currentTarget.open);
      }}
      style={{
        background: open ? 'rgba(255,255,255,0.03)' : 'transparent',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
      }}
    >
      <summary style={{ cursor: 'pointer', userSelect: 'none', padding: '7px 10px' }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{title}</span>
        {changed && (
          <span
            title="Параметры блока отличаются от сохранённого файла"
            style={{ color: '#fcd34d', marginLeft: 6, fontSize: 11 }}
          >
            ●
          </span>
        )}
        {meta && <span style={{ float: 'right', fontSize: 11, color: '#9ca3af', lineHeight: '18px' }}>{meta}</span>}
      </summary>
      <GroupIdContext.Provider value={id}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 10px 10px' }}>{children}</div>
      </GroupIdContext.Provider>
    </details>
  );
};

/** Подпись над несколькими блоками: «Геометрия тайла», «Шум», «3D» */
export const ParamCategory = ({ title, children }: { title: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
    <div style={{ color: '#9ca3af', fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
      {title}
    </div>
    {children}
  </div>
);

// ============================================
// 🔽 ПОДСЕКЦИЯ ВНУТРИ БЛОКА
// ============================================

interface ParamSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Сворачиваемая группа параметров внутри блока. По умолчанию свёрнута. */
export const ParamSection = ({ title, children, defaultOpen = false }: ParamSectionProps) => {
  const groupId = useContext(GroupIdContext);
  // Вне ParamGroup состояние не запоминается
  const [open, setOpen] = useRememberedOpen(groupId ? `section:${groupId}/${title}` : null, defaultOpen);

  return (
    <details
      open={open}
      onToggle={(e) => {
        if (e.target === e.currentTarget) setOpen(e.currentTarget.open);
      }}
      style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}
    >
      <summary style={{ cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        {title}
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>{children}</div>
    </details>
  );
};
