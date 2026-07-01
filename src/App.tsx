// App.tsx
import { useEffect, useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { Lobby } from '@/components/Lobby';
import { Board } from '@/renderer/Board';
import { Tile } from '@/renderer/Tile';
import { DebugPanel } from '@/renderer/DebugPanel';
import { GameOverScreen } from '@/renderer/GameOverScreen';
import { getValidPlacementCells } from '@/core/tileUtils';
import { useHotkeys } from '@/hooks/useHotkeys';

export default function App() {
  const {
    players, currentTurn, drawnTile, deck, phase, board,
    drawTile, totalTiles,
    showRegions, showDeadCells,
    previewTile, startPreview, confirmPreview, cancelPreview, rollbackMove,
    confirmMeeple

  } = useGameStore();


  // АВТОВЫДАЧА ТАЙЛА: при входе в фазу 'startTurn' автоматически берём тайл
  useEffect(() => {
    if (phase === 'startTurn' && !drawnTile) { // 🌟 Добавлена проверка drawnTile === null
      console.log('🎴 [App] Фаза startTurn → автоматическая выдача тайла');
      const timer = setTimeout(() => {
        drawTile();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [phase, drawnTile, drawTile]); // 🌟 Добавлена зависимость drawnTile

  // ============================================
  // 🔶 Регистрация горячих клавиш
  // ============================================
  const isGameLocked = phase === 'endTurn';

  useHotkeys([
    // R — поворот preview
    {
      key: 'r',
      action: () => useGameStore.getState().rotatePreview(),
      description: 'Повернуть тайл',
      enabled: !isGameLocked && phase === 'placeTile' && previewTile !== null,
    },

    // Enter / Space — подтвердить
    {
      key: 'Enter',
      action: () => {
        const state = useGameStore.getState();
        if (state.phase === 'placeTile' && state.previewTile) {
          state.confirmPreview();
        } else if (state.phase === 'placeMeeple') {
          state.confirmMeeple();
        }
      },
      description: 'Подтвердить',
      enabled: (!isGameLocked && phase === 'placeTile' && previewTile !== null) || phase === 'placeMeeple',
    },
    {
      key: ' ',
      action: () => {
        const state = useGameStore.getState();
        if (state.phase === 'placeTile' && state.previewTile) {
          state.confirmPreview();
        } else if (state.phase === 'placeMeeple') {
          state.confirmMeeple();
        }
      },
      description: 'Подтвердить',
      enabled: (!isGameLocked && phase === 'placeTile' && previewTile !== null) || phase === 'placeMeeple',
    },

    // 'z' — отмена
    {
      key: 'z',
      action: () => {
        const state = useGameStore.getState();
        if (state.phase === 'placeTile' && state.previewTile) {
          // Отменяем примерку тайла
          state.cancelPreview();
        } else if (state.phase === 'placeMeeple') {
          // Полный откат хода (включая удаление временного мипла)
          state.rollbackMove();
        }
      },
      description: 'Отменить / Откатить',
      enabled: (!isGameLocked && phase === 'placeTile' && previewTile !== null) || phase === 'placeMeeple',
    },
    
  ]);

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

  // 🌟 НОВОЕ: Показываем лобби если игра не начата
  if (phase === 'lobby') {
    return <Lobby />;
  }

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
        justifyContent: 'space-between',  // ✅ Ход слева, индикаторы справа
        gap: '16px',
        borderBottom: '1px solid #333',
      }}>
        {/* 👤 Ход — слева */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '14px', color: '#aaa' }}>Ход:</span>
          <strong style={{ fontSize: '16px', color: '#fff' }}>
            {currentPlayer?.name || '---'}
          </strong>
        </div>

        {/* 🎯 Индикаторы — справа */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}>
          {/* 🗺️ Индикатор регионов */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: showRegions ? '#5cb85c' : '#555',
              boxShadow: showRegions ? '0 0 8px #5cb85c' : 'none',
            }} />
            <span style={{ fontSize: '13px', color: '#aaa' }}>
              Регионы: <strong style={{ color: showRegions ? '#5cb85c' : '#666' }}>
                {showRegions ? 'ВКЛ' : 'ВЫКЛ'}
              </strong>
            </span>
          </div>

          {/* 💀 Индикатор мёртвых клеток */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: showDeadCells ? '#5cb85c' : '#555',
              boxShadow: showDeadCells ? '0 0 8px #5cb85c' : 'none',
            }} />
            <span style={{ fontSize: '13px', color: '#aaa' }}>
              Мёртвые: <strong style={{ color: showDeadCells ? '#5cb85c' : '#666' }}>
                {showDeadCells ? 'ВКЛ' : 'ВЫКЛ'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 📊 ПАНЕЛЬ ИГРОКОВ (Левый верхний угол, под хедером) */}
      {players.length > 0 && (
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
                {/* 🌟 Цветная полоска слева */}
                <div
                  style={{
                    width: isActive ? '12px' : '8px',
                    backgroundColor: player.color,
                    flexShrink: 0,
                    transition: 'width 0.3s ease',
                  }}
                />

                {/* Основная информация о игроке */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',  // ✅ Имя слева, статистика справа
                  alignItems: 'center',
                  padding: isActive ? '12px 16px' : '10px 14px',
                  flex: 1,
                  gap: '16px',
                  transition: 'padding 0.3s ease',
                }}>
                  {/* 🌟 Левая часть: имя + индикатор хода */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span style={{
                      color: '#fff',
                      fontSize: isActive ? '18px' : '16px',
                      fontWeight: isActive ? '700' : '500',
                      transition: 'all 0.3s ease',
                    }}>
                      {player.name}
                    </span>
                  </div>

                  {/* 🌟 Правая часть: статистика вертикально */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    alignItems: 'flex-end',  // ✅ Выравнивание по правому краю
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <span style={{ fontSize: '14px' }}>🏆</span>
                      <span style={{
                        color: isActive ? '#fff' : '#aaa',
                        fontSize: '15px',
                        fontWeight: isActive ? '600' : '400',
                      }}>
                        {player.score}
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <span style={{ fontSize: '14px' }}>🔶</span>
                      <span style={{
                        color: isActive ? '#fff' : '#aaa',
                        fontSize: '15px',
                        fontWeight: isActive ? '600' : '400',
                      }}>
                        {player.meepleCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
            opacity: isGameLocked ? 0.5 : 1,  // 🌟
            pointerEvents: isGameLocked ? 'none' : 'auto',  // 🌟
            transition: 'opacity 0.3s',
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
                <button onClick={confirmPreview} style={confirmBtnStyle} 
                  title="Подтвердить установку тайла на эту позицию (Enter)">
                  ✅ Подтвердить
                </button>

                <button onClick={cancelPreview} style={cancelBtnStyle}
                  title="Отменить примерку и вернуть тайл в руку (Z)">
                  ↩️ Вернуться
                </button>
              </>
            )}

            {/* 🔶 Кнопка подтверждения мипла (только в фазе placeMeeple) */}
            {phase === 'placeMeeple' && (
              <>
                <button onClick={confirmMeeple} style={confirmBtnStyle}
                  title="Подтвердить установку и передать очередь следующему игроку (Enter)">
                  ✅ Подтвердить
                </button>

                {/* 🌟 НОВОЕ: Кнопка отката */}
                <button onClick={rollbackMove} style={cancelBtnStyle}
                  title="Выбрать другую позицию тайла (Z)">
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
                  ? 'Кликни на тайл для поворота (R)'
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