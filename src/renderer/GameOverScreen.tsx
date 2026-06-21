// renderer/GameOverScreen.tsx
import { useGameStore } from '@/state/useGameStore';

export const GameOverScreen = () => {
  const players = useGameStore(s => s.players);
  const initGame = useGameStore(s => s.initGame);

  // 🌟 Сортируем игроков по очкам (от большего к меньшему)
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const winner = sortedPlayers[0];
  const isDraw = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score;

  // 🌟 Информация о категориях
  const categories = [
    { key: 'road' as const, emoji: '🛣️', label: 'Дороги' },
    { key: 'city' as const, emoji: '🏰', label: 'Города' },
    { key: 'field' as const, emoji: '🌾', label: 'Поля' },
    { key: 'monastery' as const, emoji: '⛪', label: 'Монастыри' },
  ];

  const handleNewGame = () => {
    // 🌟 Запрашиваем имена игроков (можно заменить на форму)
    const playerCount = parseInt(prompt('Количество игроков (2-5):', '2') || '2');
    if (playerCount < 2 || playerCount > 5) {
      alert('Количество игроков должно быть от 2 до 5');
      return;
    }

    const newPlayers = Array.from({ length: playerCount }, (_, i) => ({
      id: `player-${i}`,
      name: `Игрок ${i + 1}`,
      color: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'][i],
    }));

    initGame(newPlayers);
  };

  return (
    <div style={overlayStyle}>
      <div style={containerStyle}>
        {/* 🏆 Заголовок */}
        <div style={headerStyle}>
          <h1 style={titleStyle}>🏁 Игра окончена!</h1>
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

        {/* 🎮 Кнопка новой игры */}
        <button onClick={handleNewGame} style={newGameBtnStyle}>
          🎮 Новая игра
        </button>
      </div>
    </div>
  );
};

// 🎨 Стили
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
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: '30px',
};

const titleStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '36px',
  margin: 0,
  textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
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

const newGameBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '16px',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '20px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'transform 0.2s, box-shadow 0.2s',
  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
};