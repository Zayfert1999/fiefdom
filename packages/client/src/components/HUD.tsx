// components/HUD.tsx
import { useGameStore } from '@/state/useGameStore';
import { useHotkeysModal } from '@/hooks/useHotkeysModal';
import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HOTKEY_DEFINITIONS } from '@carcassonne/shared/core/hotkeys';
import { useHotkeys } from '@/hooks/useHotkeys';

//Иконки
import DeadCellsIcon from '@/assets/svg/icon/dead-cells-icon.svg?react'
import RegionOverlayIcon from '@/assets/svg/icon/region-overlay-icon.svg?react'

// Ленивый импорт
const HotkeysModal = lazy(() => import('@/components/hotKeysModal').then(m => ({ default: m.HotkeysModal })));

// 🌟 Fallback для Suspense — минимальный, не мешает UX
const LazyFallback = () => null;  // Или можно <div>Загрузка...</div>


export const HUD: React.FC = () => {
  // 🎯 Изолированные селекторы — рендерится только при изменении этих значений
  const currentTurn = useGameStore(s => s.currentTurn);
  const players = useGameStore(s => s.players);
  const showRegions = useGameStore(s => s.showRegions);
  const showDeadCells = useGameStore(s => s.showDeadCells);
  const phase = useGameStore(s => s.phase);

  const hotkeysModal = useHotkeysModal();

  useHotkeys([
    { ...HOTKEY_DEFINITIONS.SHOW_HOTKEYS, action: hotkeysModal.toggle, enabled: phase !== 'lobby' }
  ]);


  const currentPlayer = players[currentTurn];

  return (
    <>
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            title={showRegions ? 'Подсветка полей: ВКЛ' : 'Подсветка полей: ВЫКЛ'}
          >
            <RegionOverlayIcon width={30} height={30} />
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: showRegions ? '#5cb85c' : '#555',
              boxShadow: showRegions ? '0 0 8px #5cb85c' : 'none',
            }} />
          </div>

          {/* Разделитель */}
          <div style={{ width: '1px', height: '20px', background: '#444' }} />

          {/* 💀 Мёртвые клетки */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            title={showDeadCells ? 'Отображение мёртвых клеток: ВКЛ' : 'Отображение мёртвых клеток: ВЫКЛ'}
          >
            <DeadCellsIcon width={30} height={30} />
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: showDeadCells ? '#5cb85c' : '#555',
              boxShadow: showDeadCells ? '0 0 8px #5cb85c' : 'none',
            }} />
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

      {/* ⌨️ Модалка хоткеев */}
      <Suspense fallback={<LazyFallback />}>
        <ErrorBoundary name="HotkeysModal">
          <HotkeysModal isOpen={hotkeysModal.isOpen} onClose={hotkeysModal.close} />
        </ErrorBoundary>
      </Suspense>
    </>
  );
};