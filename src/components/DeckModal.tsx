// components/DeckModal.tsx
import { useEffect, useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { TILE_DEFINITIONS } from '@/core/tileData';
import { Tile } from '@/renderer/Tile';

import CrossIcon from '@/assets/svg/icon/cross-icon.svg?react'
import DeckIcon from '@/assets/svg/icon/deck-icon.svg?react'

interface DeckModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeckModal = ({ isOpen, onClose }: DeckModalProps) => {
  const deck = useGameStore(s => s.deck);
  const totalTiles = useGameStore(s => s.totalTiles);

  // Закрытие по Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Группируем колоду по id
  const remainingByTemplate = useMemo(() => {
    const map = new Map<string, number>();
    for (const tile of deck) {
      map.set(tile.id, (map.get(tile.id) || 0) + 1);
    }
    return map;
  }, [deck]);

  // Сортируем: сначала с остатком (по убыванию), затем пустые
  const tileList = useMemo(() => {
    return TILE_DEFINITIONS
      .map(def => ({
        id: def.id,
        max: def.quantity,
        remaining: remainingByTemplate.get(def.id) || 0,
      }))
      .sort((a, b) => {
        if (a.remaining > 0 && b.remaining === 0) return -1;
        if (a.remaining === 0 && b.remaining > 0) return 1;
        return b.remaining - a.remaining;
      });
  }, [remainingByTemplate]);

  if (!isOpen) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={containerStyle} onClick={(e) => e.stopPropagation()}>
        {/* 🌟 Заголовок — grid с симметричными зонами для точного центрирования */}
        <div style={headerStyle}>
          {/* Spacer слева (такой же ширины как кнопка закрытия) */}
          <div style={{ width: '36px' }} />
          
          {/* Заголовок — по центру */}
          
          <h2 style={titleStyle}>
            <DeckIcon/> Колода: {deck.length} / {totalTiles}
          </h2>
          
          {/* Кнопка закрытия справа */}
          <button onClick={onClose} style={closeBtnStyle} aria-label="Закрыть">
            <CrossIcon/>
          </button>
        </div>

        {/* Сетка тайлов — 4 колонки, тайлы 100×100 */}
        <div style={gridStyle}>
          {tileList.map(tile => {
            const isEmpty = tile.remaining === 0;

            return (
              <div
                key={tile.id}
                style={{
                  ...tileCardStyle,
                  opacity: isEmpty ? 0.35 : 1,
                }}
              >
                {/* 🎨 Миниатюра тайла — 100×100 */}
                <div style={{
                  width: '100px',
                  height: '100px',
                  border: `2px solid ${isEmpty ? '#333' : '#555'}`,
                  borderRadius: '6px',
                  overflow: 'hidden',
                  background: '#1a1a1a',
                }}>
                  <svg width={100} height={100} style={{ display: 'block' }}>
                    <Tile id={tile.id as any} size={100} />
                  </svg>
                </div>

                {/* 🔢 Счётчик остатка */}
                <div style={{
                  marginTop: '6px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: isEmpty ? '#666' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                }}>
                  <span>{tile.remaining}</span>
                  <span style={{ color: '#666', fontWeight: 'normal' }}>/</span>
                  <span style={{ color: '#666', fontWeight: 'normal' }}>{tile.max}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ❌ УБРАНО: легенда */}
      </div>
    </div>
  );
};

// ============================================
// 🎨 СТИЛИ
// ============================================
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.85)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
  backdropFilter: 'blur(4px)',
  animation: 'fadeIn 0.2s ease-out',
};

const containerStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #1f1f1f 0%, #1a1a1a 100%)',
  border: '2px solid #4a90e2',
  borderRadius: '12px',
  padding: '20px',
  maxWidth: '560px',  // 🌟 Увеличено под новые размеры тайлов
  width: '92%',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
};

const headerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '36px 1fr 36px',  // 🌟 Симметричные зоны
  alignItems: 'center',
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: '1px solid rgba(74, 144, 226, 0.3)',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: '#fff',
  fontSize: '20px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#999',
  fontSize: '32px',
  cursor: 'pointer',
  width: '36px',
  height: '36px',
  lineHeight: 1,
  padding: 0,
  justifySelf: 'end',  // 🌟 Кнопка прижата к правому краю
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '12px',
  overflowY: 'auto',
  padding: '4px',
  flex: 1,
};

const tileCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  transition: 'opacity 0.2s',
};