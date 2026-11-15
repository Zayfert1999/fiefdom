// packages/client/src/renderer3d/layers/MeepleLayer3D.tsx
// ============================================
// 🧍 МИППЛЫ НА ДОСКЕ (аналог SVG MeepleLayer)
// ============================================
// Состояния (приоритет, как в SVG): временный → завершающийся → установка → idle.
//   • idle        — мипл «дышит» (масштаб и покачивание, 3 с);
//   • установка   — падает сверху после тайла (анимация чужого хода);
//   • временный   — белое пульсирующее свечение; клик убирает мипла,
//                   наведение увеличивает ×1.3;
//   • завершающийся — вырастает до ×1.3 с золотым свечением, затем
//                   уменьшается и растворяется; над ним всплывает «+N».
//
// Мипл не вращается вместе с тайлом: ставится в повёрнутую точку спота,
// но смотрит всегда на юг (фермер лежит головой на север).
// ============================================
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, useCursor } from '@react-three/drei';
import { COMPLITED_REGION_ANIMATION_DURATION } from '@fiefdom/shared/core/constants';
import type { PlacedTile } from '@fiefdom/shared/core/types';
import type { TileBundle } from '@/core/geometry/tileMesh';
import { useGameStore } from '@/state/useGameStore';
import { clamp01, featureSurface, fromStorePoint, lerp, localToWorld, surfaceTopY } from '../boardMath';
import { MEEPLE_HEIGHT, MeepleFigure, useMeepleMaterial } from '../models/MeepleModel';
import { resolveMeepleSpot, findFeature } from '../spotUtils';
import { BOARD_MESH_PARAMS, getBundle } from '../tileBundles';

/** Пока клик сдвинулся дальше этого (px) — это перетаскивание камеры, а не клик */
const CLICK_DRAG_PX = 5;

const IDLE_PERIOD = 3;
const DROP_DELAY = 0.3;
const DROP_DURATION = 0.4;
const COMPLETION_DURATION = COMPLITED_REGION_ANIMATION_DURATION / 1000;
const HOVER_SCALE = 1.3;

const WHITE = new THREE.Color('#ffffff');
const GOLD = new THREE.Color('#ffd700');

interface PlacedMeeple3DProps {
  tile: PlacedTile;
  bundle: TileBundle | null;
  /** Мипл только что поставлен чужим ходом: проигрываем падение */
  dropping: boolean;
  onRemove: () => void;
}

const PlacedMeeple3D = memo(({ tile, bundle, dropping, onRemove }: PlacedMeeple3DProps) => {
  const meeple = tile.meeple!;
  const clock = useThree((s) => s.clock);
  const [hovered, setHovered] = useState(false);

  const feature = findFeature(tile.features, meeple.featureId);
  const lying = feature?.type === 'field';
  const isTemporary = meeple.isTemporary === true;
  const isCompleting = meeple.isCompleting === true;

  useCursor(isTemporary && hovered);

  // Позиция: спот из геометрии → поворот тайла → мир
  const placement = useMemo(() => {
    const local = resolveMeepleSpot(bundle, meeple.featureId, fromStorePoint(meeple));
    if (!local) return null;
    const world = localToWorld(tile.x, tile.y, tile.rotation, local);
    const y = surfaceTopY(BOARD_MESH_PARAMS, featureSurface(feature?.type ?? 'field'));
    return { x: world.x, y, z: world.z };
  }, [bundle, meeple, tile.x, tile.y, tile.rotation, feature?.type]);

  const material = useMeepleMaterial(meeple.color, { transparent: true });

  const animated = useRef<THREE.Group>(null);
  const dropStart = useRef<number | null>(null);
  const completeStart = useRef<number | null>(null);
  const hoverScale = useRef(1);

  useEffect(() => {
    dropStart.current = dropping ? clock.elapsedTime : null;
  }, [dropping, clock]);

  useEffect(() => {
    completeStart.current = isCompleting ? clock.elapsedTime : null;
  }, [isCompleting, clock]);

  useFrame((state, delta) => {
    const group = animated.current;
    if (!group) return;
    const t = state.clock.elapsedTime;

    let scale = 1;
    let lift = 0;
    let rotZ = 0;
    let opacity = 1;
    let glow = 0;
    let glowColor = WHITE;

    if (isTemporary) {
      hoverScale.current = THREE.MathUtils.damp(hoverScale.current, hovered ? HOVER_SCALE : 1, 12, delta);
      scale = hoverScale.current;
      glow = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2));
    } else if (isCompleting) {
      const p = clamp01((t - (completeStart.current ?? t)) / COMPLETION_DURATION);
      if (p < 0.3) {
        scale = lerp(1, 1.3, p / 0.3);
        glow = (p / 0.3) * 0.9;
      } else {
        const q = (p - 0.3) / 0.7;
        scale = lerp(1.3, 0.3, q);
        opacity = 1 - q;
        glow = 0.9 * (1 - q);
      }
      glowColor = GOLD;
    } else if (dropping) {
      const elapsed = t - (dropStart.current ?? t) - DROP_DELAY;
      if (dropStart.current === null || elapsed < 0) {
        scale = 0.0001;
        opacity = 0;
      } else {
        const p = clamp01(elapsed / DROP_DURATION);
        if (p < 0.6) {
          const k = p / 0.6;
          scale = lerp(0.5, 1.05, k);
          lift = lerp(20, -2, k);
        } else {
          const k = (p - 0.6) / 0.4;
          scale = lerp(1.05, 1, k);
          lift = lerp(-2, 0, k);
        }
        opacity = clamp01(p / 0.6);
      }
    } else {
      const phase = (t % IDLE_PERIOD) / IDLE_PERIOD;
      scale = 1 + 0.06 * Math.sin(Math.PI * phase);
      rotZ = (-1.5 * Math.PI) / 180 * Math.sin(2 * Math.PI * phase);
    }

    group.scale.setScalar(scale);
    group.position.y = lift;
    group.rotation.z = rotZ;
    material.opacity = opacity;
    material.emissive.copy(glowColor);
    material.emissiveIntensity = glow;
  });

  if (!placement) return null;

  return (
    <group position={[placement.x, placement.y, placement.z]}>
      <group
        ref={animated}
        onClick={
          isTemporary
            ? (event) => {
                event.stopPropagation();
                if (event.delta > CLICK_DRAG_PX) return;
                onRemove();
              }
            : undefined
        }
        onPointerOver={
          isTemporary
            ? (event) => {
                event.stopPropagation();
                setHovered(true);
              }
            : undefined
        }
        onPointerOut={isTemporary ? () => setHovered(false) : undefined}
      >
        <MeepleFigure material={material} lying={lying} />
      </group>

      {isCompleting && meeple.points !== undefined && (
        <Html position={[0, MEEPLE_HEIGHT + 18, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="board3d-points" style={{ '--n-color': meeple.color } as CSSProperties}>
            +{meeple.points}
          </div>
        </Html>
      )}
    </group>
  );
});
PlacedMeeple3D.displayName = 'PlacedMeeple3D';

export const MeepleLayer3D = memo(() => {
  const board = useGameStore((s) => s.board);
  const removePlacedMeeple = useGameStore((s) => s.removePlacedMeeple);
  const placementAnimation = useGameStore((s) => s.placementAnimation);

  return (
    <>
      {Array.from(board.values()).map((tile) => {
        if (!tile.meeple) return null;

        const dropping =
          placementAnimation?.meeple != null &&
          placementAnimation.tile?.x === tile.x &&
          placementAnimation.tile?.y === tile.y &&
          placementAnimation.meeple.featureId === tile.meeple.featureId;

        return (
          <PlacedMeeple3D
            key={`${tile.x},${tile.y}`}
            tile={tile}
            bundle={getBundle(tile.templateId)}
            dropping={dropping}
            onRemove={removePlacedMeeple}
          />
        );
      })}
    </>
  );
});
MeepleLayer3D.displayName = 'MeepleLayer3D';
