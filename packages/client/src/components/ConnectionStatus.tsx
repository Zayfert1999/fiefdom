// packages/client/src/components/ConnectionStatus.tsx
// 🌟 Индикатор состояния сетевого подключения

import { useGameStore } from '@/state/useGameStore';

export const ConnectionStatus = () => {
  const isConnected = useGameStore(s => s.isConnected);
  const isReconnecting = useGameStore(s => s.isReconnecting);
  const lobbyScreen = useGameStore(s => s.lobbyScreen);

  // 🌟 Показываем только в сетевом режиме
  if (lobbyScreen !== 'networkLobby') return null;

  if (isReconnecting) {
    return <div style={{ ...baseStyle, background: 'rgba(241, 196, 15, 0.9)' }}>🔄 Переподключение...</div>;
  }

  if (!isConnected) {
    return <div style={{ ...baseStyle, background: 'rgba(231, 76, 60, 0.9)' }}>❌ Нет соединения</div>;
  }

  return <div style={{ ...baseStyle, background: 'rgba(46, 204, 113, 0.9)' }}>✅ Онлайн</div>;
};

const baseStyle: React.CSSProperties = {
  position: 'fixed',
  top: '16px',
  right: '16px',
  padding: '6px 14px',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#fff',
  zIndex: 10001,
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};