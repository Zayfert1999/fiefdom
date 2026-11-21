// packages/client/src/renderer3d/layers/CityWallsLayer3D.tsx
// ============================================
// 🏰 СЛОЙ ГОРОДСКИХ СТЕН
// ============================================
// Стена с башнями, воротами и зубцами вокруг каждого завершённого города.
//
// Когда и как видна стена (по состоянию показа подсчёта очков):
//   • регион ещё в очереди анимаций (queuedRegionKeys)  → стены нет;
//   • регион сейчас играет анимацию (completionAnimations) → стена растёт «из земли»
//     за riseFraction от длительности анимации региона;
//   • иначе (давно завершён, загрузка, реконнект, пропуск анимаций) → полная высота.
//
// Рост считается по часам каждый кадр (CityWallMeshObject), без перерисовки React.
// В рейкасте стены не участвуют: клики по клеткам и пикинг фич идут как раньше.
// ============================================
import { memo, useCallback } from 'react';
import { ANIMATION_TIMING } from '@fiefdom/shared/core/animationTiming';
import { wallGrowthAt } from '@/core/geometry/wallParams';
import { CityWallMeshObject } from '@/components/CityWallMeshObject';
import { useGameStore } from '@/state/useGameStore';
import { WALL_BASE_Y, WALL_PARAMS, type BoardCityWall } from '../cityWalls';
import { useCityWalls } from '../useCityWalls';

/** Сколько длится рост стен (мс) */
const RISE_MS = ANIMATION_TIMING.regionMs * WALL_PARAMS.riseFraction;

type WallStatus = 'queued' | 'active' | 'done';

interface AnimatedWallProps {
  wall: BoardCityWall;
  status: WallStatus;
  /** Начало анимации региона (Date.now()); у остальных статусов не используется */
  startTime: number;
}

const AnimatedWall = memo(({ wall, status, startTime }: AnimatedWallProps) => {
  const growth = useCallback((): number => {
    if (status === 'queued') return 0;
    if (status === 'active') return wallGrowthAt(Date.now() - startTime, RISE_MS);
    return 1;
  }, [status, startTime]);

  return <CityWallMeshObject model={wall.model} baseY={WALL_BASE_Y} growth={growth} />;
});
AnimatedWall.displayName = 'AnimatedWall';

export const CityWallsLayer3D = memo(() => {
  const walls = useCityWalls();
  const queued = useGameStore((s) => s.queuedRegionKeys);
  const animations = useGameStore((s) => s.completionAnimations);

  if (walls.length === 0) return null;

  return (
    <>
      {walls.map((wall) => {
        const animation = animations.find((a) => a.region.rootKey === wall.rootKey);
        const status: WallStatus = animation ? 'active' : queued.includes(wall.rootKey) ? 'queued' : 'done';
        return (
          <AnimatedWall
            key={wall.model.signature}
            wall={wall}
            status={status}
            startTime={animation?.startTime ?? 0}
          />
        );
      })}
    </>
  );
});
CityWallsLayer3D.displayName = 'CityWallsLayer3D';
