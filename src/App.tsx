// App.tsx
import { useEffect, useState } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Board } from '@/renderer/Board';
import { Tile } from '@/renderer/Tile';
import { DebugPanel } from '@/renderer/DebugPanel';

export default function App() {
  const {
    players, currentTurn, drawnTile, deck, phase,
    placeTile, endTurn, initGame, drawTile, // 🌟 Добавили drawTile
    showRegions, toggleRegions
  } = useGameStore();

  const [previewRotation, setPreviewRotation] = useState<0 | 90 | 180 | 270>(0);

  useEffect(() => {
    if (players.length === 0) {
      console.log('🎮 [App] Инициализация новой игры...');
      initGame([
        { id: 'p1', name: 'Игрок 1', color: '#ff5555' },
        { id: 'p2', name: 'Игрок 2', color: '#5555ff' },
      ]);
    }
  }, [players.length, initGame]);
 
    // 🌟 АВТОВЫДАЧА ТАЙЛА: при входе в фазу 'startTurn' автоматически берём тайл
  useEffect(() => {
    if (phase === 'startTurn' && !drawnTile) { // 🌟 Добавлена проверка drawnTile === null
      console.log('🎴 [App] Фаза startTurn → автоматическая выдача тайла');
      const timer = setTimeout(() => {
        drawTile();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [phase, drawnTile, drawTile]); // 🌟 Добавлена зависимость drawnTile

  const handleRotate = () => {
    const next = ((previewRotation + 90) % 360) as 0 | 90 | 180 | 270;
    setPreviewRotation(next);
  };

  const handleBoardClick = (x: number, y: number) => {
    if (phase === 'placeTile' && drawnTile) {
      console.log(`📍 [App] Попытка установки тайла в (${x}, ${y})`);
      const success = placeTile(x, y, previewRotation);
      if (success) {
        setPreviewRotation(0);
      }
    }
  };

  const handleSkipMeeple = () => {
    console.log('⏭️ [App] Игрок пропускает мипла → следующий ход');
    endTurn();
  };

  const currentPlayer = players[currentTurn];

  // 🌟 Показываем панель и во время placeTile, и во время placeMeeple
  const showPreviewPanel = (phase === 'placeTile' && drawnTile) || phase === 'placeMeeple';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#111' }}>

      {/* 🖼️ Верхняя панель (HUD) */}
      <div style={{
        padding: '12px 20px',
        background: '#222',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        borderBottom: '1px solid #333',
        flexWrap: 'wrap'
      }}>
        <span>👤 Ход: <strong>{currentPlayer?.name || '---'}</strong></span>
        {/* 🌟 Информация о колоде перемещена в панель действий */}
        <button
          onClick={toggleRegions}
          style={{
            ...btnStyle,
            background: showRegions ? '#5cb85c' : '#555',
            marginLeft: 'auto'
          }}
        >
          {showRegions ? '🗺️ Регионы: ВКЛ' : '🗺️ Регионы: ВЫКЛ'}
        </button>
      </div>

      {/* 📊 ПАНЕЛЬ ИГРОКОВ (Левый верхний угол, под хедером) */}
      {players.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '70px',
          left: '20px',
          background: 'rgba(30, 30, 30, 0.95)',
          border: '2px solid #4a90e2',
          borderRadius: '16px',
          padding: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          zIndex: 999,
          backdropFilter: 'blur(8px)',
          minWidth: '150px',
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#fff', textAlign: 'center' }}>Игроки</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {players.map((player, index) => (
              <div
                key={player.id}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  background: currentTurn === index ? 'rgba(74, 144, 226, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                  border: currentTurn === index ? '1px solid #4a90e2' : '1px solid transparent',
                  overflow: 'hidden',
                }}
              >
                {/* 🌟 Цветная полоска слева */}
                <div 
                  style={{ 
                    width: '8px', 
                    backgroundColor: player.color,
                    flexShrink: 0
                  }} 
                />
                
                {/* Основная информация о игроке */}
                <div style={{ 
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  flex: 1,
                  gap: '12px' // 🌟 Добавлен отступ между именем и статистикой
                }}>
                  <span style={{ color: '#fff', fontSize: '16px', fontWeight: '500' }}>{player.name}</span>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <span style={{ color: '#888', fontSize: '14px' }}>🏆 {player.score}</span>
                    <span style={{ color: '#888', fontSize: '14px' }}>🔶 {player.meepleCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🗺️ Игровое поле */}
      <Board onGridClick={handleBoardClick} />

      {/* 🤲 ПАНЕЛЬ ДЕЙСТВИЙ (Правый нижний угол) — теперь с информацией о колоде и превью тайла */}
      {showPreviewPanel && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
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
          minWidth: '140px'
        }}>
          {/* 🌟 Информация о колоде перемещена сюда */}
          <div style={{ alignSelf: 'flex-start' }}>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.5px' }}>📦 Колода: {deck.length}</span>
          </div>

          {/* 🎴 Превью тайла (только в фазе placeTile) */}
          {phase === 'placeTile' && drawnTile && (
            <>
              <div
                onClick={handleRotate}
                title="Нажмите, чтобы повернуть"
                style={{
                  cursor: 'pointer',
                  border: '1px solid #555',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#1a1a1a',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.05)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 16px rgba(74, 144, 226, 0.4)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                }}
              >
                <svg width={100} height={100} style={{ display: 'block' }}>
                  <g transform={`translate(50, 50) rotate(${previewRotation}) translate(-50, -50)`}>
                    <Tile id={drawnTile.id as any} size={100} />
                  </g>
                </svg>
              </div>
              <div style={{ color: '#888', fontSize: '11px', textAlign: 'center' }}>
                Кликни на <span style={{ color: '#32cd32' }}>зелёный маркер</span> на поле<br />
              </div>
            </>
          )}

          {/* 🔶 Кнопка пропуска мипла (только в фазе placeMeeple) */}
          {phase === 'placeMeeple' && (
            <>
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.5px', textAlign: 'center' }}>
                🎯 Поставить мипла?
              </span>
              <button
                onClick={handleSkipMeeple}
                style={{
                  ...btnStyle,
                  width: '100%',
                  background: '#2ecc71',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '13px'
                }}
              >
                ⏭️ Пропустить мипла
              </button>
              <div style={{ color: '#888', fontSize: '11px', textAlign: 'center' }}>
                Кликни на <span style={{ color: '#32cd32' }}>зелёный маркер</span> на поле,<br />
              </div>
            </>
          )}
        </div>
      )}

      {/* 🐛 Рендерим дебаг-панель поверх всего */}
      <DebugPanel />
    </div>
  );
}

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