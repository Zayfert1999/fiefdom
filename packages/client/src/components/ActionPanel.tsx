// packages/client/src/components/ActionPanel.tsx
// 🎯 Панель действий: превью тайла + кнопки подтверждения/отмены.
// Колода и подсказки убраны — они теперь в GameHUD.

import { useGameStore } from '@/state/useGameStore';
import { Tile } from '@/renderer/Tile';
import styles from '@/components/game.module.css';
import CheckIcon from '@/assets/svg/icon/check-icon.svg?react';
import UndoIcon from '@/assets/svg/icon/undo-icon.svg?react';

// 🌟 Размер тайла в панели
const TILE_SIZE = 150;

export const ActionPanel: React.FC = () => {
  // ============================================
  // 🎯 Селекторы
  // ============================================
  const phase = useGameStore(s => s.phase);
  const drawnTile = useGameStore(s => s.drawnTile);
  const previewTile = useGameStore(s => s.previewTile);
  const confirmPreview = useGameStore(s => s.confirmPreview);
  const cancelPreview = useGameStore(s => s.cancelPreview);
  const confirmMeeple = useGameStore(s => s.confirmMeeple);
  const rollbackMove = useGameStore(s => s.rollbackMove);

  // ============================================
  // 👁️ Видимость панели
  // ============================================
  const showPanel = (phase === 'placeTile' && drawnTile) || phase === 'placeMeeple';
  if (!showPanel) return null;

  // 🌟 Есть ли кнопки для отображения?
  const hasButtons = previewTile !== null || phase === 'placeMeeple';

  return (
    <div className={styles.actionPanel}>
      {/* ============================================
          🎴 Превью тайла в руке
          Показывается только когда тайл взят, но ещё не размещён
          ============================================ */}
      {phase === 'placeTile' && drawnTile && !previewTile && (
        <div className={styles.tilePreview}>
          <svg width={TILE_SIZE} height={TILE_SIZE} style={{ display: 'block' }}>
            <Tile id={drawnTile.id as any} size={TILE_SIZE} />
          </svg>
        </div>
      )}

      {/* ============================================
          ✅ Кнопки подтверждения и отмены
          🌟 ИСПРАВЛЕНО: рендеримся только когда есть кнопки
          ============================================ */}
      {hasButtons && (
        <div className={styles.actionButtons}>
          {/* Примерка тайла: подтвердить / отменить */}
          {previewTile && (
            <>
              <button
                onClick={confirmPreview}
                className={`${styles.actionButton} ${styles.actionButtonConfirm}`}
                title="Подтвердить установку тайла (Enter)"
              >
                <CheckIcon />
              </button>
              <button
                onClick={cancelPreview}
                className={`${styles.actionButton} ${styles.actionButtonCancel}`}
                title="Отменить примерку (Z)"
              >
                <UndoIcon />
              </button>
            </>
          )}

          {/* Размещение мипла: подтвердить / откатить тайл */}
          {phase === 'placeMeeple' && (
            <>
              <button
                onClick={confirmMeeple}
                className={`${styles.actionButton} ${styles.actionButtonConfirm}`}
                title="Подтвердить установку мипла (Enter)"
              >
                <CheckIcon />
              </button>
              <button
                onClick={rollbackMove}
                className={`${styles.actionButton} ${styles.actionButtonCancel}`}
                title="Выбрать другую позицию тайла (Z)"
              >
                <UndoIcon />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};