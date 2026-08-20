// components/GameOverScreen.tsx
import { useState } from 'react';
import { useGameStore } from '@/state/useGameStore';

import ChevronUpIcon from '@/assets/svg/icon/chevron-up-icon.svg?react';
import ChevronDownIcon from '@/assets/svg/icon/chevron-down-icon.svg?react';

// 🌟 Импорт CSS-модуля
import styles from '@/components/styles/GameOverScreen.module.css';

export const GameOverScreen = () => {
  const players = useGameStore(s => s.players);
  const exitToLobby = useGameStore(s => s.exitToLobby); 

  // 🌟 Состояние свёрнутости
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 🌟 Сортируем игроков по очкам
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const winner = sortedPlayers[0];
  const isDraw = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score;

  const categories = [
    { key: 'road' as const, emoji: '🛣️', label: 'Дороги' },
    { key: 'city' as const, emoji: '🏰', label: 'Города' },
    { key: 'field' as const, emoji: '🌾', label: 'Поля' },
    { key: 'monastery' as const, emoji: '⛪', label: 'Монастыри' },
  ];

  // 🌟 Обработчик выхода в лобби с логированием
  const handleExitToLobby = () => {
    console.log('[GameOverScreen] Инициализация выхода в лобби');
    if (window.confirm('Выйти в лобби? Результаты текущей игры будут потеряны.')) {
      console.log('[GameOverScreen] Подтвержден выход в лобби, вызов exitToLobby()');
      exitToLobby();
    } else {
      console.log('[GameOverScreen] Отмена выхода в лобби пользователем');
    }
  };

  // ============================================
  // 📦 СВЁРНУТАЯ ПЛАШКА (полностью кликабельна)
  // ============================================
  if (isCollapsed) {
    const winnerNames = isDraw
      ? sortedPlayers.filter(p => p.score === winner.score).map(p => p.name).join(', ')
      : winner.name;

    const drawWinnersCount = isDraw
      ? sortedPlayers.filter(p => p.score === winner.score).length
      : 0;

    return (
      <div
        className={styles.collapsedContainer}
        onClick={() => {
          console.log('[GameOverScreen] Клик по свёрнутой плашке -> разворачивание статистики');
          setIsCollapsed(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            console.log('[GameOverScreen] Клавиша Enter/Space -> разворачивание статистики');
            setIsCollapsed(false);
          }
        }}
        role="button"
        tabIndex={0}
        title="Развернуть полную статистику"
      >
        {/* 🏆 Краткая информация о победителе */}
        <div className={styles.collapsedInfo}>
          <span className={styles.emojiIcon}>
            {isDraw ? '🤝' : '👑'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span className={styles.collapsedLabel}>
              {isDraw ? `Ничья (${drawWinnersCount})` : 'Победитель'}
            </span>
            <span className={styles.collapsedWinner} title={winnerNames}>
              {winnerNames}
            </span>
          </div>
          <div className={styles.collapsedScore}>
            {winner.score}
            <span className={styles.scoreSuffix}>очк.</span>
          </div>
        </div>

        {/* 🌟 Чисто визуальный индикатор разворачивания (стрелка вниз) */}
        <div className={styles.collapsedChevron} aria-hidden="true">
          <ChevronDownIcon />
        </div>
      </div>
    );
  }

  // ============================================
  // 🎬 РАЗВЁРНУТЫЙ ЭКРАН
  // ============================================
  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* 🏆 Заголовок с кнопкой сворачивания */}
        <div className={styles.header}>
          <h1 className={styles.title}>🏁 Игра окончена!</h1>
          <button
            onClick={() => {
              console.log('[GameOverScreen] Сворачивание экрана статистики');
              setIsCollapsed(true);
            }}
            className={styles.collapseBtn}
            title="Свернуть и осмотреть доску"
          >
            <ChevronUpIcon />
          </button>
        </div>

        {/* 👑 Победитель */}
        <div className={styles.winnerSection}>
          {isDraw ? (
            <div className={styles.winnerCard}>
              <div className={styles.trophy}>🤝</div>
              <h2 className={styles.winnerTitle}>Ничья!</h2>
              <p className={styles.winnerScore}>
                {sortedPlayers.filter(p => p.score === winner.score).map(p => p.name).join(', ')}
              </p>
              <p className={styles.winnerScore}>Очки: {winner.score}</p>
            </div>
          ) : (
            <div className={styles.winnerCard}>
              <div className={styles.trophy}>👑</div>
              <h2 className={styles.winnerTitle}>Победитель!</h2>
              <p className={styles.winnerName}>{winner.name}</p>
              <p className={styles.winnerScore}>Очки: {winner.score}</p>
            </div>
          )}
        </div>

        {/* 📊 Таблица статистики */}
        <div className={styles.tableSection}>
          <h3 className={styles.tableTitle}>📊 Статистика очков</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Место</th>
                <th className={styles.th}>Игрок</th>
                {categories.map(cat => (
                  <th key={cat.key} className={styles.th} title={cat.label}>
                    {cat.emoji}
                  </th>
                ))}
                <th className={`${styles.th} ${styles.totalTh}`}>🏆</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player, idx) => {
                const isWinner = idx === 0 && !isDraw;
                const isDrawWinner = isDraw && player.score === winner.score;
                const isHighlighted = isWinner || isDrawWinner;

                return (
                  <tr
                    key={player.id}
                    className={`${styles.tr} ${isHighlighted ? styles.trWinner : ''}`}
                  >
                    <td className={styles.td}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                    </td>
                    <td 
                      className={`${styles.td} ${styles.playerTd}`}
                      style={{ color: player.color }} // 🌟 Динамический стиль остаётся инлайновым
                    >
                      {player.name}
                    </td>
                    {categories.map(cat => (
                      <td key={cat.key} className={styles.td}>
                        {player.pointsByCategory[cat.key]}
                      </td>
                    ))}
                    <td className={`${styles.td} ${styles.totalTd}`}>
                      <strong>{player.score}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 🌟 Кнопка выхода в лобби (доступна только в развёрнутом виде) */}
        <button onClick={handleExitToLobby} className={styles.exitBtn}>
          Выйти в лобби
        </button>
      </div>
    </div>
  );
};