// packages/client/src/components/ModeSelector.tsx
// 🌟 Экран выбора режима игры: локальная или сетевая

import { useGameStore } from '@/state/useGameStore';

export const ModeSelector = () => {
  const setLobbyScreen = useGameStore(s => s.setLobbyScreen);

  const handleLocalGame = () => {
    console.log(`🎮 [ModeSelector] Выбрана локальная игра`);
    setLobbyScreen('localLobby');
  };

  const handleNetworkGame = () => {
    console.log(`🌐 [ModeSelector] Выбрана сетевая игра`);
    setLobbyScreen('networkLobby');
    // Подключаемся к серверу
    useGameStore.getState().connectToServer();
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>🎮 Carcassonne</h1>
        <p style={subtitleStyle}>Выберите режим игры</p>

        <button onClick={handleLocalGame} style={buttonStyle}>
          🖥️ Локальная игра
          <span style={buttonDescStyle}>За одним компьютером</span>
        </button>

        <button onClick={handleNetworkGame} style={buttonStyle}>
          🌐 Сетевая игра
          <span style={buttonDescStyle}>С друзьями через интернет</span>
        </button>
      </div>
    </div>
  );
};

// ============================================
// 🎨 Стили
// ============================================
const containerStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(30, 30, 30, 0.95)',
  borderRadius: '24px',
  padding: '40px',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  maxWidth: '400px',
  width: '90%',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const titleStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '32px',
  textAlign: 'center',
  margin: '0 0 8px 0',
  fontWeight: 700,
};

const subtitleStyle: React.CSSProperties = {
  color: '#aaa',
  fontSize: '16px',
  textAlign: 'center',
  margin: '0 0 24px 0',
};

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  padding: '20px',
  background: 'rgba(74, 144, 226, 0.15)',
  color: '#fff',
  border: '2px solid rgba(74, 144, 226, 0.4)',
  borderRadius: '12px',
  fontSize: '18px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const buttonDescStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#888',
  fontWeight: 400,
};