// components/ActionPanel.tsx
import { lazy, Suspense } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Tile } from '@/renderer/Tile';
import { useDeckModal } from '@/hooks/useDeckModal';
import { useHotkeys } from '@/hooks/useHotkeys';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HOTKEY_DEFINITIONS } from '@/core/hotkeys';

// 🌟 Импортируем CSS-модуль и иконки
import styles from './ActionPanel.module.css';
import CheckIcon from '@/assets/svg/icon/check-icon.svg?react' 
import UndoIcon from '@/assets/svg/icon/undo-icon.svg?react'
import DeckIcon from '@/assets/svg/icon/deck-icon.svg?react' 

// Ленивый импорт
const DeckModal = lazy(() => import('@/components/DeckModal').then(m => ({ default: m.DeckModal })));

// 🌟 Минимальный fallback — ничего не показываем во время загрузки
const DeckModalFallback = () => null;

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
            className={styles.deckBtn}
          >
            <DeckIcon />
          </button>

          {/* 🌟 Текст колоды */}
          <span style={{
            color: '#fff',
            fontSize: '20px',
            fontWeight: 'bold',
          }}>
            {deck.length} / {totalTiles}
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
                className={styles.confirmBtn}
                title="Подтвердить установку тайла (Enter)"
              >
                <CheckIcon />
              </button>
              <button
                onClick={cancelPreview}
                className={styles.cancelBtn}
                title="Отменить примерку (Z)"
              >
                <UndoIcon />
              </button>
            </>
          )}

          {/* 🔶 Подтверждение мипла */}
          {phase === 'placeMeeple' && (
            <>
              <button
                onClick={confirmMeeple}
                className={styles.confirmBtn}
                title="Подтвердить установку мипла (Enter)"
              >
                <CheckIcon />
              </button>
              <button
                onClick={rollbackMove}
                className={styles.cancelBtn}
                title="Выбрать другую позицию тайла (Z)"
              >
                <UndoIcon />
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