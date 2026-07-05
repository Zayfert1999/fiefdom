// components/ActionPanel.tsx
import { useGameStore } from '@/state/useGameStore';
import { Tile } from '@/renderer/Tile';
import React from 'react';

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

  const confirmPreview = useGameStore(s => s.confirmPreview);
  const cancelPreview = useGameStore(s => s.cancelPreview);
  const confirmMeeple = useGameStore(s => s.confirmMeeple);
  const rollbackMove = useGameStore(s => s.rollbackMove);

  const isGameLocked = phase === 'endTurn';
  const showPanel = (phase === 'placeTile' && drawnTile) || phase === 'placeMeeple';

  if (!showPanel) return null;

  return (
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
      {/* 📦 Информация о колоде */}
      <div style={{
        color: '#fff',
        fontSize: '16px',
        fontWeight: 'bold',
        width: '100%',
        textAlign: 'center',
        borderBottom: '1px solid rgba(255, 215, 0, 0.3)',
        paddingBottom: '8px',
      }}>
        📦 Колода: {`${deck.length} / ${totalTiles}`}
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
  );
};