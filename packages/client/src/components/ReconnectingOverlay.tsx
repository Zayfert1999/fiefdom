// 🌟 Оверлей, показываемый во время попытки восстановления
import { useGameStore } from '@/state/useGameStore';

export const ReconnectingOverlay = () => {
  const isReconnectingToRoom = useGameStore(s => s.isReconnectingToRoom);
  const isReconnecting = useGameStore(s => s.isReconnecting);
  const roomId = useGameStore(s => s.roomId);
  const connectionError = useGameStore(s => s.connectionError);

  // 🌟 УПРОЩЕНО: показываем оверлей в двух случаях:
  // 1. Попытка восстановить комнату после перезагрузки (isReconnectingToRoom)
  // 2. Socket.IO переподключается И у нас есть активная комната
  const shouldShow = isReconnectingToRoom || (isReconnecting && roomId !== null);

  if (!shouldShow) return null;

  // Определяем текст в зависимости от ситуации
  const isRecoveringRoom = isReconnectingToRoom;
  const title = isRecoveringRoom ? 'Восстановление игры...' : 'Восстановление связи...';
  const subtitle = roomId
    ? `Комната: ${roomId}`
    : connectionError
    ? connectionError
    : 'Подключение к серверу';

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={spinnerStyle} />
        <h2 style={titleStyle}>{title}</h2>
        <p style={subtitleStyle}>{subtitle}</p>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 99999,
};

const cardStyle: React.CSSProperties = {
  background: '#1a1a2e',
  padding: '40px',
  borderRadius: '16px',
  textAlign: 'center',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
};

const spinnerStyle: React.CSSProperties = {
  width: '50px',
  height: '50px',
  border: '4px solid rgba(255, 255, 255, 0.1)',
  borderTopColor: '#4a90e2',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  margin: '0 auto 20px',
};

const titleStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '20px',
  margin: '0 0 8px 0',
};

const subtitleStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '14px',
  margin: 0,
  letterSpacing: '2px',
};