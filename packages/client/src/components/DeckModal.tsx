// packages/client/src/components/DeckModal.tsx
// 🎴 Модальное окно просмотра колоды.
// Показывает все типы тайлов и их остаток в колоде.
// Переиспользует общий стиль модальных окон из game.module.css.

import { useEffect, useMemo } from 'react';
import { useGameStore } from '@/state/useGameStore';
import { TILE_DEFINITIONS } from '@fiefdom/shared/core/tileData';
import { ProceduralTile } from '@/components/ProceduralTile';
import styles from '@/components/styles/modal.module.css';

interface DeckModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeckModal = ({ isOpen, onClose }: DeckModalProps) => {
  // ============================================
  // 🎯 Селекторы
  // ============================================
  const board = useGameStore(s => s.board);
  const drawnTile = useGameStore(s => s.drawnTile);
  const totalTiles = useGameStore(s => s.totalTiles);

  // ============================================
  // ⌨️ Закрытие по Escape
  // ============================================
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // ============================================
  // 🧮 Подсчёт остатков тайлов
  // Работает и для локальной, и для сетевой игры
  // ============================================
  const remainingByTemplate = useMemo(() => {
    // Считаем использованные тайлы каждого типа
    const usedCounts = new Map<string, number>();

    // 1. Тайлы на доске (все видны)
    for (const tile of board.values()) {
      usedCounts.set(tile.templateId, (usedCounts.get(tile.templateId) || 0) + 1);
    }

    // 2. Тайл в руке (если есть — тоже взят из колоды)
    if (drawnTile) {
      usedCounts.set(drawnTile.id, (usedCounts.get(drawnTile.id) || 0) + 1);
    }

    // 3. Вычисляем остатки: изначальное количество минус использованные
    const result = new Map<string, number>();
    for (const def of TILE_DEFINITIONS) {
      const used = usedCounts.get(def.id) || 0;
      result.set(def.id, Math.max(0, def.quantity - used));
    }
    return result;
  }, [board, drawnTile]);

  // ============================================
  // 🧮 Общее количество оставшихся тайлов
  // ============================================
  // Остаток колоды приходит из стора: локально — deck.length, онлайн — deckCount от сервера
  // (формула «всего − на доске − в руке» врала после пропущенных и выброшенных тайлов)
  const deckRemaining = useGameStore(s => s.deckCount);

  // ============================================
  // 📋 Сортировка: сначала с остатком, затем пустые
  // ============================================
  const tileList = useMemo(() => {
    return TILE_DEFINITIONS
      .map(def => ({
        id: def.id,
        max: def.quantity,
        remaining: remainingByTemplate.get(def.id) || 0,
      }))
      .sort((a, b) => {
        if (a.remaining > 0 && b.remaining === 0) return -1;
        if (a.remaining === 0 && b.remaining > 0) return 1;
        return b.remaining - a.remaining;
      });
  }, [remainingByTemplate]);

  if (!isOpen) return null;

  return (
    // ============================================
    // 🌑 Оверлей (клик закрывает модалку)
    // ============================================
    <div className={styles.modalOverlay} onClick={onClose}>
      {/* ============================================
          📦 Карточка модального окна
          ============================================ */}
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className={styles.modalHeader}>
          {/* Spacer слева (для симметричного центрирования) */}
          <div style={{ width: '36px' }} />

          <h2 className={styles.modalTitle}>
            🎴 Колода: {deckRemaining} / {totalTiles}
          </h2>

          {/* Кнопка закрытия */}
          <button
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* ============================================
            🎴 Сетка тайлов (4 колонки)
            ============================================ */}
        <div className={styles.deckGrid}>
          {tileList.map(tile => {
            const isEmpty = tile.remaining === 0;
            return (
              <div
                key={tile.id}
                className={`${styles.deckTileCard} ${isEmpty ? styles.deckTileCardEmpty : ''}`}
              >
                {/* Миниатюра тайла */}
                <div className={styles.deckTilePreview}>
                  <ProceduralTile id={tile.id} size={100} />
                </div>

                {/* Счётчик остатка */}
                <div className={styles.deckTileCount}>
                  <span>{tile.remaining}</span>
                  <span className={styles.deckTileCountMax}>/</span>
                  <span className={styles.deckTileCountMax}>{tile.max}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};