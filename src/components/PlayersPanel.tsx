// components/PlayersPanel.tsx
import { useGameStore } from '@/state/useGameStore';
import React from 'react';

export const PlayersPanel: React.FC = () => {
  const players = useGameStore(s => s.players);
  const currentTurn = useGameStore(s => s.currentTurn);

  if (players.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '70px',
      left: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      zIndex: 999,
    }}>
      {players.map((player, index) => {
        const isActive = currentTurn === index;
        return (
          <div
            key={player.id}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              background: isActive ? 'rgba(30, 30, 30, 0.98)' : 'rgba(30, 30, 30, 0.85)',
              borderRadius: '12px',
              border: isActive ? `3px solid ${player.color}` : '2px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              boxShadow: isActive
                ? `0 0 20px ${player.color}40, 0 8px 32px rgba(0, 0, 0, 0.6)`
                : '0 4px 16px rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(8px)',
              minWidth: '200px',
              transition: 'all 0.3s ease',
            }}
          >
            {/* Цветная полоска слева */}
            <div style={{
              width: isActive ? '12px' : '8px',
              backgroundColor: player.color,
              flexShrink: 0,
              transition: 'width 0.3s ease',
            }} />

            {/* Основная информация */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: isActive ? '12px 16px' : '10px 14px',
              flex: 1,
              gap: '16px',
              transition: 'padding 0.3s ease',
            }}>
              {/* Имя */}
              <span style={{
                color: '#fff',
                fontSize: isActive ? '18px' : '16px',
                fontWeight: isActive ? '700' : '500',
                transition: 'all 0.3s ease',
              }}>
                {player.name}
              </span>

              {/* Статистика */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                alignItems: 'flex-end',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>🏆</span>
                  <span
                    key={player.score}
                    className="player-score-pop"
                    style={{
                      color: isActive ? '#fff' : '#aaa',
                      fontSize: '15px',
                      fontWeight: isActive ? '600' : '400',
                      display: 'inline-block',
                      minWidth: '16px',
                      textAlign: 'center',
                    }}
                  >
                    {player.score}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>🔶</span>
                  <span
                    key={player.meepleCount}
                    className="meeple-count-pop"
                    style={{
                      color: isActive ? '#fff' : '#aaa',
                      fontSize: '15px',
                      fontWeight: isActive ? '600' : '400',
                      display: 'inline-block',
                      minWidth: '16px',
                      textAlign: 'center',
                    }}
                  >
                    {player.meepleCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};