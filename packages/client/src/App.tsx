// App.tsx
import { useEffect, useMemo, useCallback, lazy, Suspense, useRef } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { getValidPlacementCells } from '@fiefdom/shared/core/tileUtils';
import { HOTKEY_DEFINITIONS } from '@fiefdom/shared/core/hotkeys';
import { useHotkeys } from '@/hooks/useHotkeys';
import { getSocket } from '@/network/socket';  // 🌟 НОВОЕ
import { loadConnectionInfo } from '@/network/persistence';

// Статические импорты 
import { Board } from '@/renderer/Board';
import { GameHUD } from '@/components/GameHUD';
import { ActionPanel } from '@/components/ActionPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MainMenu } from '@/components/MainMenu';
import { ReconnectingOverlay } from '@/components/ReconnectingOverlay';

// Ленивый импорт
const LocalLobby = lazy(() => import('@/components/LocalLobby').then(m => ({ default: m.Lobby })));
const GameOverScreen = lazy(() => import('@/components/GameOverScreen').then(m => ({ default: m.GameOverScreen })));
const DebugPanel = lazy(() => import('@/components/DebugPanel').then(m => ({ default: m.DebugPanel })));
const NetworkLobby = lazy(() => import('@/components/NetworkLobby').then(m => ({ default: m.NetworkLobby })));


// 🌟 Fallback для Suspense — минимальный, не мешает UX
const LazyFallback = () => null;  // Или можно <div>Загрузка...</div>

export default function App() {
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

  // 🌟 Защита от повторных вызовов в StrictMode
  const initializedRef = useRef(false);

  useEffect(() => {
    // Защита от двойного вызова в StrictMode
    if (initializedRef.current) return;
    initializedRef.current = true;

    console.log('🚀 [App] Инициализация — подключение к серверу');
    connectToServer();

    // 🌟 Проверяем активные игры ПОСЛЕ подключения
    const checkSession = () => {
      const saved = loadConnectionInfo();
      if (!saved) {
        console.log('🔍 [App] Нет сохранённой сессии');
        return;
      }

      console.log(`🔍 [App] Проверка активной игры для ${saved.playerId}`);

      const socket = getSocket();
      if (!socket) {
        console.warn('⚠️ [App] Сокет не инициализирован');
        return;
      }

      const emitCheckActive = () => {
        console.log(`📤 [App] Отправка session:check-active для ${saved.playerId}`);
        socket.emit('session:check-active', {
          playerId: saved.playerId,
        });
      };

      if (socket.connected) {
        // Уже подключён — сразу отправляем
        emitCheckActive();
      } else {
        // Ждём события connect
        const onConnect = () => {
          emitCheckActive();
          socket.off('connect', onConnect);
        };
        socket.on('connect', onConnect);

        // Защита: если подключение не удалось в течение 5 сек — отменяем
        setTimeout(() => {
          socket.off('connect', onConnect);
          console.warn('⚠️ [App] Timeout: сокет не подключился за 5 сек');
        }, 5000);
      }
    };

    // Небольшая задержка для инициализации store
    const timer = setTimeout(checkSession, 100);

    return () => {
      clearTimeout(timer);
      initializedRef.current = false;
    };
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