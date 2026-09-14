// Вспомогательная функция для экспорта JS констант в CSS
import { CAMERA_CONFIG, COMPLITED_REGION_ANIMATION_DURATION } from '@fiefdom/shared/core/constants'

export const syncCssVariables = () => {
  const root = document.documentElement;

  // Камера
  root.style.setProperty('--anim-camera', `${CAMERA_CONFIG.ANIMATION_DURATION}ms`);

  // Анимация завершения региона
  root.style.setProperty('--comp-reg-anim-completion', `${COMPLITED_REGION_ANIMATION_DURATION}ms`);

  console.log(`🎨 [CSS Sync] Переменные синхронизированы:`, {
    '--anim-camera': `${CAMERA_CONFIG.ANIMATION_DURATION}ms`,
    '--comp-reg-anim-completion': `${COMPLITED_REGION_ANIMATION_DURATION}ms`,
  });
};