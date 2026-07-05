// components/ActionPanel.tsx
import { lazy, Suspense } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Tile } from '@/renderer/Tile';
import { useDeckModal } from '@/hooks/useDeckModal';
import { useHotkeys } from '@/hooks/useHotkeys';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HOTKEY_DEFINITIONS } from '@/core/hotkeys';

// Ленивый импорт
const DeckModal = lazy(() => import('@/components/DeckModal').then(m => ({ default: m.DeckModal })));

// 🌟 Минимальный fallback — ничего не показываем во время загрузки
const DeckModalFallback = () => null;

// 🌟 Стили вынесены локально (в будущем перенесём в CSS-модуль)
const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#4a90e2',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500',
  transition: 'background 0.2s, transform 0.1s',
};

const confirmBtnStyle: React.CSSProperties = {
  ...btnStyle,
  width: '100%',
  height: '100%',
  background: '#2ecc71',
  fontSize: '14px',
  fontWeight: 'bold',
};

const cancelBtnStyle: React.CSSProperties = {
  ...btnStyle,
  width: '100%',
  background: '#e67e22',
  fontSize: '14px',
  fontWeight: 'bold',
};

export const ActionPanel: React.FC = () => {
  const phase = useGameStore(s => s.phase);
  const drawnTile = useGameStore(s => s.drawnTile);
  const previewTile = useGameStore(s => s.previewTile);
  const deck = useGameStore(s => s.deck);
  const totalTiles = useGameStore(s => s.totalTiles);
  const enabledDeckView = useGameStore(s => s.enabledDeckView);

  const confirmPreview = useGameStore(s => s.confirmPreview);
  const cancelPreview = useGameStore(s => s.cancelPreview);
  const confirmMeeple = useGameStore(s => s.confirmMeeple);
  const rollbackMove = useGameStore(s => s.rollbackMove);

  const deckModal = useDeckModal();

  useHotkeys([
    {
      ...HOTKEY_DEFINITIONS.SHOW_DECK,
      action: deckModal.toggle,
      enabled: enabledDeckView && phase !== 'lobby' && phase !== 'gameOver' && phase !== 'endTurn',
    },
  ]);

  const isGameLocked = phase === 'endTurn';
  const showPanel = (phase === 'placeTile' && drawnTile) || phase === 'placeMeeple';

  if (!showPanel) return null;

  return (
    <>
      <div style={{
        position: 'fixed',
        bottom: '24px', right: '24px',
        width: '300px', height: '300px',
        background: 'rgba(30, 30, 30, 0.95)',
        border: '2px solid #4a90e2',
        borderRadius: '16px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        zIndex: 1000,
        backdropFilter: 'blur(8px)',
      }}>
        {/* 📦 Информация о колоде + кнопка просмотра */}
        <div style={{
          width: '100%',
          borderBottom: '1px solid rgba(255, 215, 0, 0.3)',
          paddingBottom: '8px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '10px',
        }}>
          {/* 🌟 Отдельная квадратная кнопка */}
          <button
            onClick={deckModal.open}
            disabled={!enabledDeckView}
            title={enabledDeckView 
              ? "Посмотреть содержимое колоды (D)" 
              : "Просмотр колоды отключён в настройках"}
            aria-label={enabledDeckView 
              ? "Посмотреть оставшиеся тайлы (D)" 
              : "Просмотр колоды отключён"}
            style={{
              width: '32px',
              height: '32px',
              border: `1px solid ${enabledDeckView ? 'rgba(255, 215, 0, 0.5)' : '#444'}`,
              borderRadius: '6px',
              background: enabledDeckView ? 'rgba(255, 215, 0, 0.1)' : 'rgba(100, 100, 100, 0.1)',
              color: enabledDeckView ? '#ffd700' : '#666',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              flexShrink: 0,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!enabledDeckView) return;
              e.currentTarget.style.background = 'rgba(255, 215, 0, 0.25)';
              e.currentTarget.style.borderColor = '#ffd700';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              if (!enabledDeckView) return;
              e.currentTarget.style.background = 'rgba(255, 215, 0, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.5)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            📦
          </button>

          {/* 🌟 Текст колоды */}
          <span style={{
            color: '#fff',
            fontSize: '15px',
            fontWeight: 'bold',
          }}>
            Колода: {deck.length} / {totalTiles}
          </span>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          width: '100%', height: '100%',
          justifyContent: 'center',
          opacity: isGameLocked ? 0.5 : 1,
          pointerEvents: isGameLocked ? 'none' : 'auto',
          transition: 'opacity 0.3s',
        }}>
          {/* 🎴 Тайл в руке */}
          {phase === 'placeTile' && drawnTile && !previewTile && (
            <div style={{
              border: '1px solid #555',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#1a1a1a',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              <svg width={170} height={170} style={{ display: 'block' }}>
                <Tile id={drawnTile.id as any} size={170} />
              </svg>
            </div>
          )}

          {/* 👁️ Примерка тайла */}
          {previewTile && (
            <>
              <button
                onClick={confirmPreview}
                style={confirmBtnStyle}
                title="Подтвердить установку тайла (Enter)"
              >
                ✅ Подтвердить
              </button>
              <button
                onClick={cancelPreview}
                style={cancelBtnStyle}
                title="Отменить примерку (Z)"
              >
                ↩️ Вернуться
              </button>
            </>
          )}

          {/* 🔶 Подтверждение мипла */}
          {phase === 'placeMeeple' && (
            <>
              <button
                onClick={confirmMeeple}
                style={confirmBtnStyle}
                title="Подтвердить установку мипла (Enter)"
              >
                ✅ Подтвердить
              </button>
              <button
                onClick={rollbackMove}
                style={cancelBtnStyle}
                title="Выбрать другую позицию тайла (Z)"
              >
                ↩️ Вернуться
              </button>
            </>
          )}
        </div>

        {/* 🌟 Подсказка */}
        <div style={{
          color: '#888',
          fontSize: '12px',
          textAlign: 'center',
          marginTop: 'auto',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: '8px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          width: '100%',
        }}>
          {phase === 'placeTile' && !previewTile && (
            <>Кликни на&nbsp;<span style={{ color: '#fff' }}>белый маркер</span>&nbsp;на поле</>
          )}
          {previewTile && (
            <>
              {previewTile.validRotations.length > 1
                ? 'Кликни на тайл для поворота (R)'
                : 'Поворот фиксирован'}
            </>
          )}
          {phase === 'placeMeeple' && (
            <>Кликни на&nbsp;<span style={{ color: '#fff' }}>белый силуэт</span>&nbsp;на поле</>
          )}
        </div>
      </div>

      {/* Модальное окно колоды */}
      {enabledDeckView &&
        <Suspense fallback={<DeckModalFallback />}>
          <ErrorBoundary name="DeckModal">
            <DeckModal isOpen={deckModal.isOpen} onClose={deckModal.close} />
          </ErrorBoundary>
        </Suspense>
      }     
    </>
  );
};