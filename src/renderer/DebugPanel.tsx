// renderer/DebugPanel.tsx
import { useGameStore } from '@/state/useGameStore';

export const DebugPanel = () => {
  const debugSelectedTile = useGameStore(s => s.debugSelectedTile);
  const board = useGameStore(s => s.board);
  const regionManager = useGameStore(s => s.regionManager);
  const players = useGameStore(s => s.players);
  const setDebugSelectedTile = useGameStore(s => s.setDebugSelectedTile);

  if (!debugSelectedTile) return null;

  const { x, y } = debugSelectedTile;
  const tile = board.get(`${x},${y}`);

  if (!tile) {
    return (
      <div style={panelStyle}>
        <h3>🐛 Debug Panel</h3>
        <p>Тайл не найден в ({x}, {y})</p>
        <button onClick={() => setDebugSelectedTile(null)} style={btnStyle}>Закрыть</button>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <h3>🐛 Debug Panel</h3>
      <div style={sectionStyle}>
        <h4>📍 Тайл</h4>
        <p><strong>ID:</strong> {tile.templateId}</p>
        <p><strong>Координаты:</strong> ({x}, {y})</p>
        <p><strong>Поворот:</strong> {tile.rotation}°</p>
        <p><strong>Мипл:</strong> {tile.meeple ? `${players.find(p => p.id === tile.meeple?.playerId)?.name} (${tile.meeple?.color})` : 'Нет'}</p>
      </div>

      <div style={sectionStyle}>
        <h4>🎯 Фичи и регионы</h4>
        {tile.features.map((feature, idx) => {
          const featureKey = `${x},${y}:${feature.id}`;
          const owners = regionManager.getFeatureOwners(featureKey);
          // 🌟 Получаем метаданные через корневой ключ
          const rootKey = regionManager.find(featureKey);
          const metadata = rootKey ? regionManager.getMetadata(rootKey) : undefined;
          const regionKeys = metadata ? Array.from(metadata.featureKeys) : [];

          return (
            <div key={idx} style={featureStyle}>
              <strong>#{idx + 1} {feature.id}</strong>
              <p>Тип: {feature.type}</p>
              <p>Направления: {feature.directions.join(', ')}</p>
              <p>Владельцы (локально): {owners.length > 0 ? owners.map(id => {
                const player = players.find(p => p.id === id);
                return `${player?.name} (${player?.color})`;
              }).join(', ') : 'Нет'}</p>
              {metadata && (
                <>
                  <p>Размер региона: {metadata.segments} тайл(ов)</p>
                  <p>Щит: {metadata.hasShield ? 'Да' : 'Нет'}</p>
                  <p style={{ color: metadata.isComplete ? '#4CAF50' : '#FF9800' }}>
                    Статус завершения: {metadata.isComplete ? 'ЗАВЕРШЁН' : 'НЕ ЗАВЕРШЁН'}
                  </p>
                  {metadata.isComplete && (
                    <p>Очки: {metadata.points}</p>
                  )}
                  {/* --- ОТОБРАЖЕНИЕ ВЛАДЕЛЬЦЕВ ВСЕГО РЕГИОНА И ИХ МИПЛОВ --- */}
                    <div>
                    <p>Владельцы региона и миплы:</p>
                    {/* --- ДОБАВЛЕНА ПРОВЕРКА if (metadata) --- */}
                    {metadata && metadata.meepleCounts.size > 0 ? (
                      <ul style={{ margin: '2px 0', paddingLeft: '15px' }}>
                        {Array.from(metadata.meepleCounts.entries()).map(([playerId, count]) => {
                          const player = players.find(p => p.id === playerId);
                          return (
                            <li key={playerId} style={{ fontSize: '11px' }}>
                              {player?.name} ({player?.color}): {count} мипл(ов)
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p style={{ margin: '2px 0', fontSize: '11px' }}>Нет миплов</p>
                    )}
                  </div>
                  {/* ---------------------------------------- */}
                  <details>
                    <summary style={{ cursor: 'pointer', marginTop: '5px', color: '#aaa' }}>
                      Ключи региона ({regionKeys.length})
                    </summary>
                    <ul style={{ fontSize: '11px', marginTop: '5px', paddingLeft: '15px', color: '#ccc' }}>
                      {regionKeys.map((key, kidx) => (
                        <li key={kidx}>{key}</li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => setDebugSelectedTile(null)} style={btnStyle}>
        Закрыть
      </button>
    </div>
  );
};

// ... (стили без изменений)

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: '70px',
  right: '20px',
  background: 'rgba(0, 0, 0, 0.95)',
  border: '2px solid #4a90e2',
  borderRadius: '8px',
  padding: '15px',
  color: '#fff',
  fontFamily: 'monospace',
  fontSize: '12px',
  maxWidth: '400px',
  maxHeight: '70vh',
  overflowY: 'auto',
  zIndex: 1000,
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '15px',
  paddingBottom: '15px',
  borderBottom: '1px solid #333',
};

const featureStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  padding: '8px',
  borderRadius: '4px',
  marginBottom: '8px',
};

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: '#e74c3c',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  marginTop: '10px',
  width: '100%',
};