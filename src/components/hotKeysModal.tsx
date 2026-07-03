// components/HotkeysModal.tsx
import { useEffect } from 'react';
import {
  HOTKEYS_BY_CATEGORY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatHotkeyKey,
  type HotkeyCategory,
  type HotkeyDefinition,
} from '@/core/hotkeys'

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}


export const HotkeysModal = ({ isOpen, onClose }: HotkeysModalProps) => {
    console.log(`🎨 [HotkeysModal] render, isOpen=${isOpen}`);
  // Закрытие по Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderCategory = (category: HotkeyCategory, hotkeys: readonly HotkeyDefinition[]) => (
    <div key={category} style={{ marginBottom: '24px' }}> 
      <h3 style={{
        margin: '0 0 12px 0',
        fontSize: '16px',
        color: '#4a90e2',
        fontWeight: 600,
        borderBottom: '1px solid rgba(74, 144, 226, 0.3)',
        paddingBottom: '8px',
      }}>
        {CATEGORY_LABELS[category]}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {hotkeys.map((def) => (
          <div
            key={`${category}-${def.key}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '6px',
            }}
          >
            <span style={{ color: '#ccc', fontSize: '14px' }}>{def.description}</span>
            <kbd style={{
              background: 'linear-gradient(180deg, #2a2a2a 0%, #1f1f1f 100%)',
              padding: '4px 10px',
              borderRadius: '4px',
              border: '1px solid #444',
              borderBottom: '2px solid #333',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#fff',
              minWidth: '40px',
              textAlign: 'center',
            }}>
              {formatHotkeyKey(def)}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #1f1f1f 0%, #1a1a1a 100%)',
          border: '2px solid #4a90e2',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}>
          <h2 style={{ margin: 0, color: '#fff' }}>⌨️ Горячие клавиши</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: '#999', fontSize: '28px', cursor: 'pointer',
              width: '32px', height: '32px',
            }}
          >
          </button>
        </div>

        {CATEGORY_ORDER.map(cat =>
          renderCategory(cat, HOTKEYS_BY_CATEGORY[cat])
        )}

        <div style={{
          marginTop: '24px',
          padding: '12px 16px',
          background: 'rgba(74, 144, 226, 0.1)',
          border: '1px solid rgba(74, 144, 226, 0.3)',
          borderRadius: '6px',
          fontSize: '13px',
          color: '#aaa',
        }}>
          💡 <strong style={{ color: '#4a90e2' }}>Совет:</strong>{' '}
          <kbd style={{ background: '#2a2a2a', padding: '2px 6px', borderRadius: '3px' }}>Esc</kbd>{' '}
          или <kbd style={{ background: '#2a2a2a', padding: '2px 6px', borderRadius: '3px' }}>?</kbd>{' '}
          — закрыть
        </div>
      </div>
    </div>
  );
};