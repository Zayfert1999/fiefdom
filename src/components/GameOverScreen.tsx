// components/GameOverScreen.tsx
import { useState } from 'react';
import { useGameStore } from '@/state/useGameStore';

export const GameOverScreen = () => {
  const players = useGameStore(s => s.players);
  const exitToLobby = useGameStore(s => s.exitToLobby); 

  // 🌟 Состояние свёрнутости
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 🌟 Сортируем игроков по очкам
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const winner = sortedPlayers[0];
  const isDraw = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score;

  const categories = [
    { key: 'road' as const, emoji: '🛣️', label: 'Дороги' },
    { key: 'city' as const, emoji: '🏰', label: 'Города' },
    { key: 'field' as const, emoji: '🌾', label: 'Поля' },
    { key: 'monastery' as const, emoji: '⛪', label: 'Монастыри' },
  ];

  // 🌟 Обработчик выхода в лобби
  const handleExitToLobby = () => {
    if (window.confirm('Выйти в лобби? Результаты текущей игры будут потеряны.')) {
      exitToLobby();
    }
  };

  // ============================================
  // 📦 СВЁРНУТАЯ ПЛАШКА
  // ============================================
  if (isCollapsed) {
    // Формируем строку с победителем
    const winnerNames = isDraw
      ? sortedPlayers.filter(p => p.score === winner.score).map(p => p.name).join(', ')
      : winner.name;

    const drawWinnersCount = isDraw
      ? sortedPlayers.filter(p => p.score === winner.score).length
      : 0;

    return (
      <div style={collapsedContainerStyle}>
        {/* 🏆 Краткая информация */}
        <div style={collapsedInfoStyle}>
          <span style={{ fontSize: '24px', marginRight: '8px' }}>
            {isDraw ? '🤝' : '👑'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={collapsedLabelStyle}>
              {isDraw ? `Ничья (${drawWinnersCount})` : 'Победитель'}
            </span>
            <span style={collapsedWinnerStyle} title={winnerNames}>
              {winnerNames}
            </span>
          </div>
          <div style={collapsedScoreStyle}>
            {winner.score}
            <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '4px' }}>очк.</span>
          </div>
        </div>

        {/* 🎛️ Кнопки */}
        <div style={collapsedActionsStyle}>
          <button
            onClick={() => setIsCollapsed(false)}
            style={collapsedExpandBtnStyle}
            title="Развернуть полную статистику"
          >
            📊 Статистика
          </button>
          {/* Выйти в лобби */}
          <button
            onClick={handleExitToLobby}
            style={collapsedExitBtnStyle}
            title="Вернуться в лобби"
          >
            🚪 Выйти
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // 🎬 РАЗВЁРНУТЫЙ ЭКРАН
  // ============================================
  return (
    <div style={overlayStyle}>
      <div style={containerStyle}>
        {/* 🏆 Заголовок с кнопкой сворачивания */}
        <div style={headerStyle}>
          <h1 style={titleStyle}>🏁 Игра окончена!</h1>
          <button
            onClick={() => setIsCollapsed(true)}
            style={collapseBtnStyle}
            title="Свернуть и осмотреть доску"
          >
            ✕ Свернуть
          </button>
        </div>

        {/* 👑 Победитель */}
        <div style={winnerSectionStyle}>
          {isDraw ? (
            <div style={winnerCardStyle}>
              <div style={trophyStyle}>🤝</div>
              <h2 style={winnerTitleStyle}>Ничья!</h2>
              <p style={winnerScoreStyle}>
                {sortedPlayers.filter(p => p.score === winner.score).map(p => p.name).join(', ')}
              </p>
              <p style={winnerScoreStyle}>Очки: {winner.score}</p>
            </div>
          ) : (
            <div style={winnerCardStyle}>
              <div style={trophyStyle}>👑</div>
              <h2 style={winnerTitleStyle}>Победитель!</h2>
              <p style={winnerNameStyle}>{winner.name}</p>
              <p style={winnerScoreStyle}>Очки: {winner.score}</p>
            </div>
          )}
        </div>

        {/* 📊 Таблица статистики */}
        <div style={tableSectionStyle}>
          <h3 style={tableTitleStyle}>📊 Статистика очков</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Место</th>
                <th style={thStyle}>Игрок</th>
                {categories.map(cat => (
                  <th key={cat.key} style={thStyle} title={cat.label}>
                    {cat.emoji}
                  </th>
                ))}
                <th style={{ ...thStyle, ...totalThStyle }}>🏆</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player, idx) => {
                const isWinner = idx === 0 && !isDraw;
                const isDrawWinner = isDraw && player.score === winner.score;

                return (
                  <tr
                    key={player.id}
                    style={{
                      ...trStyle,
                      background: isWinner || isDrawWinner ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                    }}
                  >
                    <td style={tdStyle}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                    </td>
                    <td style={{ ...tdStyle, ...playerTdStyle, color: player.color }}>
                      {player.name}
                    </td>
                    {categories.map(cat => (
                      <td key={cat.key} style={tdStyle}>
                        {player.pointsByCategory[cat.key]}
                      </td>
                    ))}
                    <td style={{ ...tdStyle, ...totalTdStyle }}>
                      <strong>{player.score}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 🌟 НОВОЕ: Кнопка выхода в лобби */}
        <button onClick={handleExitToLobby} style={exitBtnStyle}>
          🚪 Выйти в лобби
        </button>
      </div>
    </div>
  );
};

// ============================================
// 🎨 СТИЛИ РАЗВЁРНУТОГО ЭКРАНА
// ============================================
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.9)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  animation: 'fadeIn 0.5s ease-in',
};

const containerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
  borderRadius: '16px',
  padding: '40px',
  maxWidth: '800px',
  width: '90%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  border: '2px solid rgba(255, 255, 255, 0.1)',
  position: 'relative',
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: '30px',
  position: 'relative',
};

const titleStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '36px',
  margin: 0,
  textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
};

// 🌟 Кнопка сворачивания в правом верхнем углу
const collapseBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  background: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  color: '#fff',
  padding: '6px 14px',
  borderRadius: '8px',
  fontSize: '13px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  backdropFilter: 'blur(8px)',
};

const winnerSectionStyle: React.CSSProperties = {
  marginBottom: '40px',
  display: 'flex',
  justifyContent: 'center',
};

const winnerCardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  padding: '30px',
  textAlign: 'center',
  border: '2px solid rgba(255, 215, 0, 0.5)',
  boxShadow: '0 4px 20px rgba(255, 215, 0, 0.2)',
};

const trophyStyle: React.CSSProperties = {
  fontSize: '64px',
  marginBottom: '10px',
};

const winnerTitleStyle: React.CSSProperties = {
  color: '#ffd700',
  fontSize: '28px',
  margin: '10px 0',
  textShadow: '0 2px 5px rgba(0, 0, 0, 0.3)',
};

const winnerNameStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '32px',
  margin: '10px 0',
  fontWeight: 'bold',
};

const winnerScoreStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '24px',
  margin: '10px 0',
};

const tableSectionStyle: React.CSSProperties = {
  marginBottom: '30px',
};

const tableTitleStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '24px',
  marginBottom: '20px',
  textAlign: 'center',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: 'rgba(0, 0, 0, 0.3)',
  borderRadius: '8px',
  overflow: 'hidden',
};

const thStyle: React.CSSProperties = {
  padding: '12px',
  textAlign: 'center',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
  borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
  background: 'rgba(0, 0, 0, 0.2)',
};

const totalThStyle: React.CSSProperties = {
  background: 'rgba(255, 215, 0, 0.2)',
  borderLeft: '2px solid rgba(255, 215, 0, 0.5)',
};

const trStyle: React.CSSProperties = {
  transition: 'background 0.2s',
};

const tdStyle: React.CSSProperties = {
  padding: '12px',
  textAlign: 'center',
  color: '#fff',
  fontSize: '16px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
};

const playerTdStyle: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 'bold',
  fontSize: '18px',
};

const totalTdStyle: React.CSSProperties = {
  background: 'rgba(255, 215, 0, 0.1)',
  borderLeft: '2px solid rgba(255, 215, 0, 0.3)',
  fontSize: '20px',
};


const exitBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '16px',
  background: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',  // 🔴 Красный градиент
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '20px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'transform 0.2s, box-shadow 0.2s',
  boxShadow: '0 4px 15px rgba(231, 76, 60, 0.4)',
};

// ============================================
// 📦 СТИЛИ СВЁРНУТОЙ ПЛАШКИ
// ============================================
const collapsedContainerStyle: React.CSSProperties = {
  position: 'fixed',
  top: '70px',           // Под HUD (примерно 50-60px высоты)
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
  border: '2px solid rgba(255, 215, 0, 0.4)',
  borderRadius: '12px',
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  zIndex: 2000,
  animation: 'slideDown 0.3s ease-out',
  backdropFilter: 'blur(12px)',
  maxWidth: '90vw',
};

const collapsedInfoStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flex: 1,
  minWidth: 0,
};

const collapsedLabelStyle: React.CSSProperties = {
  color: '#ffd700',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 'bold',
};

const collapsedWinnerStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '200px',
};

const collapsedScoreStyle: React.CSSProperties = {
  color: '#ffd700',
  fontSize: '20px',
  fontWeight: 'bold',
  padding: '4px 12px',
  background: 'rgba(255, 215, 0, 0.15)',
  borderRadius: '6px',
  border: '1px solid rgba(255, 215, 0, 0.3)',
  whiteSpace: 'nowrap',
};

const collapsedActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
};

const collapsedExpandBtnStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  color: '#fff',
  padding: '8px 12px',
  borderRadius: '6px',
  fontSize: '13px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  whiteSpace: 'nowrap',
};

const collapsedExitBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
  border: 'none',
  color: '#fff',
  padding: '8px 14px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s',
  boxShadow: '0 2px 8px rgba(231, 76, 60, 0.3)',
  whiteSpace: 'nowrap',
};