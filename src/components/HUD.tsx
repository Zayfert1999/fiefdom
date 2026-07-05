// components/HUD.tsx
import { useGameStore } from '@/state/useGameStore';
import { useHotkeysModal } from '@/hooks/useHotkeysModal';
import React from 'react';

export const HUD: React.FC = () => {
  // 🎯 Изолированные селекторы — рендерится только при изменении этих значений
  const currentTurn = useGameStore(s => s.currentTurn);
  const players = useGameStore(s => s.players);
  const showRegions = useGameStore(s => s.showRegions);
  const showDeadCells = useGameStore(s => s.showDeadCells);

  const hotkeysModal = useHotkeysModal();

  const currentPlayer = players[currentTurn];

  return (
    <div style={{
      padding: '12px 20px',
      background: '#222',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      borderBottom: '1px solid #333',
    }}>
      {/* 👤 Ход — слева */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px', color: '#aaa' }}>Ход:</span>
        <strong style={{ fontSize: '16px', color: '#fff' }}>
          {currentPlayer?.name || '---'}
        </strong>
      </div>

      {/* 🎯 Индикаторы — справа */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* 🗺️ Регионы */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: showRegions ? '#5cb85c' : '#555',
            boxShadow: showRegions ? '0 0 8px #5cb85c' : 'none',
          }} />
          <span style={{ fontSize: '13px', color: '#aaa' }}>
            Регионы: <strong style={{ color: showRegions ? '#5cb85c' : '#666' }}>
              {showRegions ? 'ВКЛ' : 'ВЫКЛ'}
            </strong>
          </span>
        </div>

        {/* 💀 Мёртвые клетки */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: showDeadCells ? '#5cb85c' : '#555',
            boxShadow: showDeadCells ? '0 0 8px #5cb85c' : 'none',
          }} />
          <span style={{ fontSize: '13px', color: '#aaa' }}>
            Мёртвые: <strong style={{ color: showDeadCells ? '#5cb85c' : '#666' }}>
              {showDeadCells ? 'ВКЛ' : 'ВЫКЛ'}
            </strong>
          </span>
        </div>

        {/* Разделитель */}
        <div style={{ width: '1px', height: '20px', background: '#444' }} />

        {/* ❓ Кнопка подсказки */}
        <button
          onClick={hotkeysModal.open}
          title="Горячие клавиши (F1)"
          style={{
            width: '32px', height: '32px',
            borderRadius: '50%',
            border: '1px solid #444',
            background: '#2a2a2a',
            color: '#aaa',
            fontSize: '16px', fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4a90e2';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.borderColor = '#4a90e2';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#2a2a2a';
            e.currentTarget.style.color = '#aaa';
            e.currentTarget.style.borderColor = '#444';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ?
        </button>
      </div>
    </div>
  );
};