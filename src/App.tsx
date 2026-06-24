// App.tsx
import { useEffect, useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Board } from '@/renderer/Board';
import { Tile } from '@/renderer/Tile';
import { DebugPanel } from '@/renderer/DebugPanel';
import { GameOverScreen } from '@/renderer/GameOverScreen';
import { getValidPlacementCells } from '@/core/tileUtils';

export default function App() {
  const {
    players, currentTurn, drawnTile, deck, phase,
    initGame, drawTile, totalTiles,
    showRegions, toggleRegions, showDeadCells, toggleDeadCells,
    previewTile, startPreview, confirmPreview, cancelPreview, rollbackMove,
    confirmMeeple

  } = useGameStore();

  const board = useGameStore(s => s.board);

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

  // 🟢 Расчёт валидных клеток
  const validCells = useMemo(() => {
    if (!drawnTile) return new Set<string>();
    return getValidPlacementCells(drawnTile, board);
  }, [drawnTile, board]);

const handleBoardClick = (x: number, y: number) => {
  if (phase === 'placeTile' && drawnTile) {
    const cellKey = `${x},${y}`;
    if (validCells.has(cellKey)) {
      // 🌟 Если уже есть previewTile на этой позиции — ничего не делаем
      if (previewTile && previewTile.x === x && previewTile.y === y) {
        return;
      }
      
      // 🌟 Если есть previewTile на другой позиции — отменяем и начинаем новую
      if (previewTile) {
        console.log(`🔄 [App] Перемещение примерки: (${previewTile.x},${previewTile.y}) → (${x},${y})`);
        cancelPreview();
      }
      
      console.log(`👁️ [App] Начало примерки в (${x}, ${y})`);
      startPreview(x, y);
    }
  }
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
        
        {/* 💀 НОВОЕ: Кнопка toggle мёртвых клеток */}
        <button
          onClick={toggleDeadCells}
          style={{
            ...btnStyle,
            background: showDeadCells ? '#e74c3c' : '#555',
          }}
          title="Показать клетки, куда нельзя поставить ни один тайл из колоды"
        >
          💀 {showDeadCells ? 'Мёртвые: ВКЛ' : 'Мёртвые: ВЫКЛ'}
        </button>
        
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
      <Board 
        onGridClick={handleBoardClick}
        validCells={validCells}
      />
      

      {/* 🤲 ПАНЕЛЬ ДЕЙСТВИЙ (Правый нижний угол) — теперь с информацией о колоде и превью тайла */}
      {showPreviewPanel && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '300px',                  
          height: '300px',
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
          backdropFilter: 'blur(8px)'
          
        }}>
          {/* 📦 Информация о колоде*/}
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
            width: '100%',
            height: '100%',
            justifyContent: 'center',
          }}>
            {/* 🎴 Тайл в руке (без preview) */}
            {phase === 'placeTile' && drawnTile && !previewTile && (
              <>
                <div
                  style={{
                    border: '1px solid #555',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1a1a1a',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                >
                  <svg width={170} height={170} style={{ display: 'block' }}>
                    <Tile id={drawnTile.id as any} size={170} />
                  </svg>
                </div>
              </>
            )}

            {/* 👁️ Примерка тайла*/}
            {previewTile && (
              <>
                <button onClick={confirmPreview} style={confirmBtnStyle}>
                  ✅ Подтвердить
                </button>

                <button onClick={cancelPreview} style={cancelBtnStyle}>
                  ↩️ Вернуться
                </button>
              </>
            )}

            {/* 🔶 Кнопка подтверждения мипла (только в фазе placeMeeple) */}
            {phase === 'placeMeeple' && (
              <>              
                <button onClick={confirmMeeple} style={confirmBtnStyle}>
                  ✅ Подтвердить
                </button>

                {/* 🌟 НОВОЕ: Кнопка отката */}
                <button onClick={rollbackMove} style={cancelBtnStyle}>
                  ↩️ Вернуться
                </button>
              </>
            )}
          </div>
              {/* 🌟 ПОДСКАЗКА — всегда внизу, фиксированная высота */}
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
              <>Кликни на&nbsp; <span style={{ color: '#fff' }}>белый маркер</span>&nbsp; на поле</>
            )}
            {previewTile && (
              <>
                {previewTile.validRotations.length > 1
                  ? 'Кликни на тайл для поворота'
                  : 'Поворот фиксирован'}
              </>
            )}
            {phase === 'placeMeeple' && (
              <>Кликни на&nbsp; <span style={{ color: '#fff' }}>белый силуэт</span>&nbsp; на поле</>
            )}
          </div>
        </div>
      )}

      {/* 🐛 Рендерим дебаг-панель поверх всего */}
      <DebugPanel />

      {/* 🌟 НОВОЕ: Экран конца игры — рендерится поверх всех элементов */}
      {phase === 'gameOver' && <GameOverScreen />}
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

// 🌟 Стили кнопок панели действий
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