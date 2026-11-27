// packages/client/src/renderer3d/layers/CityTownLayer3D.tsx
// ============================================
// 🏘 СЛОЙ ЗАСТРОЙКИ ГОРОДОВ
// ============================================
// Площадь, улицы и домики внутри каждого завершённого города.
//
// Когда и как видна застройка (по состоянию показа подсчёта очков, как у стен):
//   • регион ещё в очереди анимаций (queuedRegionKeys)  → застройки нет;
//   • регион сейчас играет анимацию (completionAnimations) → после startDelay (стены уже
//     поднимаются) дома растут «из земли» за riseFraction анимации, волной от площади;
//   • иначе (давно завершён, загрузка, реконнект, пропуск анимаций) → полная застройка.
//
// Прогресс считается по часам каждый кадр (CityTownMeshObject), без перерисовки React.
// В рейкасте застройка не участвует: клики по клеткам и пикинг фич идут как раньше.
// ============================================
import { memo, useCallback } from 'react';
import { ANIMATION_TIMING } from '@fiefdom/shared/core/animationTiming';
import { townProgressAt } from '@/core/geometry/townParams';
import { CityTownMeshObject } from '@/components/CityTownMeshObject';
import { useGameStore } from '@/state/useGameStore';
import { TOWN_BASE_Y, TOWN_PARAMS, type BoardCityTown } from '../cityTown';
import { useCityTown } from '../useCityTown';

/** Через сколько после начала анимации региона начинают расти дома (мс) */
const DELAY_MS = ANIMATION_TIMING.regionMs * TOWN_PARAMS.animation.startDelay;
/** Сколько длится рост домов (мс) */
const RISE_MS = ANIMATION_TIMING.regionMs * TOWN_PARAMS.animation.riseFraction;

type TownStatus = 'queued' | 'active' | 'done';

interface AnimatedTownProps {
  town: BoardCityTown;
  status: TownStatus;
  /** Начало анимации региона (Date.now()); у остальных статусов не используется */
  startTime: number;
}

const AnimatedTown = memo(({ town, status, startTime }: AnimatedTownProps) => {
  const progress = useCallback((): number => {
    if (status === 'queued') return 0;
    if (status === 'active') return townProgressAt(Date.now() - startTime - DELAY_MS, RISE_MS);
    return 1;
  }, [status, startTime]);

  return (
    <CityTownMeshObject
      model={town.model}
      baseY={TOWN_BASE_Y}
      progress={progress}
      stagger={TOWN_PARAMS.animation.stagger}
    />
  );
});
AnimatedTown.displayName = 'AnimatedTown';

export const CityTownLayer3D = memo(() => {
  const towns = useCityTown();
  const queued = useGameStore((s) => s.queuedRegionKeys);
  const animations = useGameStore((s) => s.completionAnimations);

  if (towns.length === 0) return null;

  return (
    <>
      {towns.map((town) => {
        const animation = animations.find((a) => a.region.rootKey === town.rootKey);
        const status: TownStatus = animation ? 'active' : queued.includes(town.rootKey) ? 'queued' : 'done';
        return (
          <AnimatedTown
            key={town.model.signature}
            town={town}
            status={status}
            startTime={animation?.startTime ?? 0}
          />
        );
      })}
    </>
  );
});
CityTownLayer3D.displayName = 'CityTownLayer3D';
