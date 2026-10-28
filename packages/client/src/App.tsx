// App.tsx
import { useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { getValidPlacementCells } from '@fiefdom/shared/core/tileUtils';
import { HOTKEY_DEFINITIONS } from '@fiefdom/shared/core/hotkeys';
import { useHotkeys } from '@/hooks/useHotkeys';

// Статические импорты 
import { Board } from '@/renderer/Board';
import { GameHUD } from '@/components/GameHUD';
import { ActionPanel } from '@/components/ActionPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MainMenu } from '@/components/MainMenu';
import { ReconnectingOverlay } from '@/components/ReconnectingOverlay';
import { ToastContainer } from '@/components/ToastContainer';
import { useLocalClock } from '@/hooks/useLocalClock';
import { useActivityReporter } from '@/hooks/useActivityReporter';

// Ленивый импорт
const LocalLobby = lazy(() => import('@/components/LocalLobby').then(m => ({ default: m.Lobby })));
const GameOverScreen = lazy(() => import('@/components/GameOverScreen').then(m => ({ default: m.GameOverScreen })));
const DebugPanel = lazy(() => import('@/components/DebugPanel').then(m => ({ default: m.DebugPanel })));
const NetworkLobby = lazy(() => import('@/components/NetworkLobby').then(m => ({ default: m.NetworkLobby })));
const GeometrySandbox = lazy(() => import('@/components/GeometrySandbox').then(m => ({ default: m.GeometrySandbox })));

// 🌟 Fallback для Suspense — минимальный, не мешает UX
const LazyFallback = () => null;  // Или можно <div>Загрузка...</div>

/**
 * 🌟 Корень приложения: экраны + toast-уведомления поверх любого экрана
 * (меню, лобби, игра). Контейнер вынесен сюда, чтобы не дублировать его
 * в каждой ветке рендера AppScreens.
 */
export default function App() {
  return (
    <>
      <AppScreens />
      <ToastContainer />
    </>
  );
}

function AppScreens() {
  // 🕐 Часы локальной игры и сигнал «я на месте» для онлайн-игры (каждый сам решает, нужен ли он)
  useLocalClock();
  useActivityReporter();

  // 🎯 ЗНАЧЕНИЯ — рендеримся только когда меняются
  const drawnTile = useGameStore(s => s.drawnTile);
  const phase = useGameStore(s => s.phase);
  const lobbyScreen = useGameStore(s => s.lobbyScreen);
  const board = useGameStore(s => s.board);
  const previewTile = useGameStore(s => s.previewTile);


  // 🎯 ДЕЙСТВИЯ — стабильные ссылки (Zustand так делает)
  const drawTile = useGameStore(s => s.drawTile);
  const connectToServer = useGameStore(s => s.connectToServer);


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
  // 🔌 ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
  // ============================================
  // connectToServer идемпотентен (безопасен при двойном вызове в StrictMode).
  // Проверка сохранённой сессии («Продолжить») и возврат в комнату после обрыва
  // выполняются в обработчике connect (network/stateSync/connectionHandlers.ts) —
  // на КАЖДОМ подключении, а не только на первом.
  useEffect(() => {
    console.log('🚀 [App] Инициализация — подключение к серверу');
    connectToServer();
  }, [connectToServer]);

  // ============================================
  // 🎴 АВТОВЫДАЧА ТАЙЛА (ТОЛЬКО ЛОКАЛЬНАЯ ИГРА)
  // ============================================
  useEffect(() => {
    const state = useGameStore.getState();

    // 🌟 СЕТЕВОЙ РЕЖИМ: сервер сам выдаст тайл через game:your-turn
    // Не делаем локальную выдачу из пустой колоды
    if (state.roomId !== null) return;

    if (phase === 'startTurn' && !drawnTile) {
      console.log('🎴 [App] Фаза startTurn → автоматическая выдача тайла (локально)');
      const timer = setTimeout(() => {
        drawTile();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [phase, drawnTile, drawTile]);

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
    if (lobbyScreen === 'modeSelect') {
      return (
        <ErrorBoundary name="ModeSelector">
          <MainMenu />
        </ErrorBoundary>
      );
    }

    if (lobbyScreen === 'networkLobby') {
      return (
        <Suspense fallback={null}>
          <ErrorBoundary name="NetworkLobby">
            <NetworkLobby />
          </ErrorBoundary>
        </Suspense>
      );
    }

    if (lobbyScreen === 'localLobby') {
      return (
        <Suspense fallback={null}>
          <ErrorBoundary name="Lobby">
            <LocalLobby />
          </ErrorBoundary>
        </Suspense>
      );
    }
    if (lobbyScreen === 'geometrySandbox') {
      return (
        <Suspense fallback={null}>
          <ErrorBoundary name="GeometrySandbox">
            <GeometrySandbox />
          </ErrorBoundary>
        </Suspense>
      );
    }
  }

    // ============================================
    // 🎨 РЕНДЕР
    // ============================================
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#111' }}>
        <ReconnectingOverlay />

        {/* 🖼️ Единый GameHUD — НЕ рендерим при gameOver */}
        {phase !== 'gameOver' && (
          <ErrorBoundary name="GameHUD">
            <GameHUD />
          </ErrorBoundary>
        )}

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
