// App.tsx
import { useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { getValidPlacementCells } from '@carcassonne/shared/core/tileUtils';
import { HOTKEY_DEFINITIONS } from '@carcassonne/shared/core/hotkeys';
import { useHotkeys } from '@/hooks/useHotkeys';

// Статические импорты 
import { Board } from '@/renderer/Board';
import { HUD } from '@/components/HUD';
import { PlayersPanel } from '@/components/PlayersPanel';
import { ActionPanel } from '@/components/ActionPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Ленивый импорт
const Lobby = lazy(() => import('@/components/Lobby').then(m => ({ default: m.Lobby })));
const GameOverScreen = lazy(() => import('@/components/GameOverScreen').then(m => ({ default: m.GameOverScreen })));
const DebugPanel = lazy(() => import('@/components/DebugPanel').then(m => ({ default: m.DebugPanel })));

// 🌟 Fallback для Suspense — минимальный, не мешает UX
const LazyFallback = () => null;  // Или можно <div>Загрузка...</div>

export default function App() {
  // 🎯 ЗНАЧЕНИЯ — рендеримся только когда меняются
  const drawnTile = useGameStore(s => s.drawnTile);
  const phase = useGameStore(s => s.phase);
  const board = useGameStore(s => s.board);
  const previewTile = useGameStore(s => s.previewTile);

  // 🎯 ДЕЙСТВИЯ — стабильные ссылки (Zustand так делает)
  const drawTile = useGameStore(s => s.drawTile);

  // ============================================
  // 🔒 Блокировка контекстного меню
  // ============================================
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Разрешаем контекстное меню в input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // ============================================
  // 🎴 АВТОВЫДАЧА ТАЙЛА
  // ============================================
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
  // 🎮 ОБРАБОТЧИКИ ХОТКЕЕВ (вынесены из useHotkeys)
  // ============================================
  const handleConfirm = useCallback(() => {
    const state = useGameStore.getState();
    if (state.phase === 'placeTile' && state.previewTile) {
      state.confirmPreview();
    } else if (state.phase === 'placeMeeple') {
      state.confirmMeeple();
    }
  }, []);

  const handleCancel = useCallback(() => {
    const state = useGameStore.getState();
    if (state.phase === 'placeTile' && state.previewTile) {
      state.cancelPreview();
    } else if (state.phase === 'placeMeeple') {
      state.rollbackMove();
    }
  }, []);

  const handleRotate = useCallback(() => {
    useGameStore.getState().rotatePreview();
  }, []);

  // ============================================
  // ⌨️ РЕГИСТРАЦИЯ ХОТКЕЕВ
  // ============================================
  const isGameLocked = phase === 'endTurn';

  const confirmEnabled = (!isGameLocked && phase === 'placeTile' && previewTile !== null) || phase === 'placeMeeple';
  const rotateEnabled = !isGameLocked && phase === 'placeTile' && previewTile !== null;

  useHotkeys([
    { ...HOTKEY_DEFINITIONS.ROTATE_TILE, action: handleRotate, enabled: rotateEnabled },
    { ...HOTKEY_DEFINITIONS.CONFIRM, action: handleConfirm, enabled: confirmEnabled },
    { ...HOTKEY_DEFINITIONS.CONFIRM_ALT, action: handleConfirm, enabled: confirmEnabled },
    { ...HOTKEY_DEFINITIONS.CANCEL, action: handleCancel, enabled: confirmEnabled },
  ]);

  // ============================================
  // 🟢 РАСЧЁТ ВАЛИДНЫХ КЛЕТОК
  // ============================================
  const validCells = useMemo(() => {
    if (!drawnTile) return new Set<string>();
    return getValidPlacementCells(drawnTile, board);
  }, [drawnTile, board]);

  // ============================================
  // 🖱️ ОБРАБОТЧИК КЛИКА ПО ДОСКЕ
  // ============================================
  const handleBoardClick = useCallback((x: number, y: number) => {
    // 🌟 Проверяем фазу через getState() — избегаем лишних зависимостей
    const state = useGameStore.getState();

    if (state.phase !== 'placeTile' || !state.drawnTile) return;

    const cellKey = `${x},${y}`;
    if (!validCells.has(cellKey)) return;

    // 🌟 Если preview на той же позиции — игнорируем
    if (state.previewTile && state.previewTile.x === x && state.previewTile.y === y) {
      return;
    }

    // 🌟 Если preview на другой позиции — перемещаем
    if (state.previewTile) {
      console.log(`🔄 [App] Перемещение примерки: (${state.previewTile.x},${state.previewTile.y}) → (${x},${y})`);
      state.cancelPreview();
    }

    console.log(`👁️ [App] Начало примерки в (${x}, ${y})`);
    state.startPreview(x, y);
  }, [validCells]);  // 🌟 Минимум зависимостей

  // ============================================
  // 🌐 ЛОББИ
  // ============================================
  if (phase === 'lobby') {
    return (
      <Suspense fallback={null}>
        <ErrorBoundary name="Lobby">
          <Lobby />
        </ErrorBoundary>
      </Suspense>
    );
  }

  // ============================================
  // 🎨 РЕНДЕР
  // ============================================
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#111' }}>

      {/* 🖼️ Верхняя панель (HUD) */}
      <ErrorBoundary name="HUD">
        <HUD />
      </ErrorBoundary>

      {/* 📊 Панель игроков */}
      <ErrorBoundary name="PlayersPanel">
        <PlayersPanel />
      </ErrorBoundary>

      {/* 🤲 Панель действий */}
      <ErrorBoundary name="ActionPanel">
        <ActionPanel />
      </ErrorBoundary>

      {/* 🗺️ Игровое поле */}
      <ErrorBoundary name="Board">
        <Board onGridClick={handleBoardClick} validCells={validCells} />
      </ErrorBoundary>

      {/* 🐛 Рендерим дебаг-панель поверх всего */}
      <Suspense fallback={<LazyFallback />}>
        <ErrorBoundary name="DebugPanel">
          <DebugPanel />
        </ErrorBoundary>
      </Suspense>

      {/* 🏁 Конец игры */}
      {phase === 'gameOver' && (
        <Suspense fallback={<LazyFallback />}>
          <ErrorBoundary name="GameOverScreen">
            <GameOverScreen />
          </ErrorBoundary>
        </Suspense>
      )}
    </div>
  );
}