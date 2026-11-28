// packages/client/src/renderer3d/layers/MeepleLayer3D.tsx
// ============================================
// 🧍 МИППЛЫ НА ДОСКЕ (аналог SVG MeepleLayer)
// ============================================
// Два источника, как в SVG-слое после патча анимаций:
//   • миплы с доски (board) — живые;
//   • «призраки» (ghostMeeples) — миплы завершённых регионов. В состоянии они уже
//     сняты с доски и очки начислены, но анимация ещё идёт: ждущие (waiting) стоят на
//     месте, активные (active) исчезают с «+N». Анимация целиком живёт в presentationSlice
//     и не зависит от того, что сейчас лежит на доске.
//
// Режимы (приоритет, как в SVG): temporary → completing → dropping → idle.
//   • idle        — мипл «дышит» (масштаб и покачивание, 3 с);
//   • dropping    — падает сверху после тайла (анимация чужого хода);
//   • temporary   — материал как у призрака-спота выбора (полупрозрачный, лёгкая белая
//                   эмиссия), но в цвете мипла игрока; клик убирает мипла, наведение ×1.3;
//   • completing  — вырастает до ×1.3 с золотым свечением, затем уменьшается и
//                   растворяется; над ним всплывает «+N».
//
// Мипл не вращается вместе с тайлом: ставится в повёрнутую точку спота, но смотрит
// всегда на юг (фермер лежит головой на север). Высота — поверхность фичи; для поля
// с рельефом — высота холма под спотом (fieldSurfaceY).
// ============================================
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, useCursor } from '@react-three/drei';
import { ANIMATION_TIMING } from '@fiefdom/shared/core/animationTiming';
import type { FeatureType } from '@fiefdom/shared/core/types';
import { useGameStore } from '@/state/useGameStore';
import { fieldSurfaceY, type BoardFieldTerrain } from '../fieldTerrain';
import { clamp01, featureSurface, fromStorePoint, lerp, localToWorld, surfaceTopY } from '../boardMath';
import { MEEPLE_HEIGHT, MeepleFigure, useMeepleMaterial } from '../models/MeepleModel';
import { resolveMeepleSpot } from '../spotUtils';
import { BOARD_MESH_PARAMS, getBundle } from '../tileBundles';
import { useFieldTerrain } from '../useFieldTerrain';

/** Пока клик сдвинулся дальше этого (px) — это перетаскивание камеры, а не клик */
const CLICK_DRAG_PX = 5;

const IDLE_PERIOD = 3;
const DROP_DELAY = 0.3;
const DROP_DURATION = 0.4;
const COMPLETION_DURATION = ANIMATION_TIMING.regionMs / 1000;
const HOVER_SCALE = 1.3;

const WHITE = new THREE.Color('#ffffff');
const GOLD = new THREE.Color('#ffd700');

// Временный мипл: материал как у призрака-спота (MeepleSelectionLayer3D в покое), цвет — игрока
const TEMP_OPACITY = 0.8;
const TEMP_EMISSIVE_INTENSITY = 0.05;

type MeepleMode = 'idle' | 'temporary' | 'dropping' | 'completing';

interface MeepleItem {
  key: string;
  tileX: number;
  tileY: number;
  rotation: number;
  templateId: string;
  featureId: string;
  featureType: FeatureType | undefined;
  /** Координаты мипла в системе стора [0, 100] — запасной вариант, если у фичи нет вычисленного спота */
  stored: { x: number; y: number };
  color: string;
  mode: MeepleMode;
  /** «+N» над мипл (только активный призрак победителя) */
  points?: number;
}

// ============================================
// 🧍 ОДИН МИПЛ
// ============================================
interface MeepleActor3DProps {
  item: MeepleItem;
  terrain: BoardFieldTerrain;
  onRemove: () => void;
}

const MeepleActor3D = memo(({ item, terrain, onRemove }: MeepleActor3DProps) => {
  const clock = useThree((s) => s.clock);
  const [hovered, setHovered] = useState(false);

  const { mode } = item;
  const isTemporary = mode === 'temporary';
  const isCompleting = mode === 'completing';
  const isDropping = mode === 'dropping';
  const lying = item.featureType === 'field';

  useCursor(isTemporary && hovered);

  // Позиция: спот из геометрии → поворот тайла → мир; высота — поверхность фичи
  const placement = useMemo(() => {
    const bundle = getBundle(item.templateId);
    const local = resolveMeepleSpot(bundle, item.featureId, fromStorePoint(item.stored));
    if (!local) return null;

    const world = localToWorld(item.tileX, item.tileY, item.rotation, local);
    const type = item.featureType ?? 'field';
    const flat = surfaceTopY(BOARD_MESH_PARAMS, featureSurface(type));
    // Поле с рельефом — не плоскость: ставим на холм под мипл
    const hill = type === 'field' && terrain.tiles ? fieldSurfaceY(terrain, world.x, world.z) : null;
    return { x: world.x, y: hill ?? flat, z: world.z };
  }, [item.templateId, item.featureId, item.featureType, item.stored, item.tileX, item.tileY, item.rotation, terrain]);

  const material = useMeepleMaterial(item.color, { transparent: true });

  const animated = useRef<THREE.Group>(null);
  const dropStart = useRef<number | null>(null);
  const completeStart = useRef<number | null>(null);
  const hoverScale = useRef(1);

  useEffect(() => {
    dropStart.current = isDropping ? clock.elapsedTime : null;
  }, [isDropping, clock]);

  useEffect(() => {
    completeStart.current = isCompleting ? clock.elapsedTime : null;
  }, [isCompleting, clock]);

  useFrame((state, delta) => {
    const group = animated.current;
    if (!group) return;
    const t = state.clock.elapsedTime;

    let scale: number;
    let lift = 0;
    let rotZ = 0;
    let opacity = 1;
    let glow = 0;
    let glowColor = WHITE;

    if (isTemporary) {
      hoverScale.current = THREE.MathUtils.damp(hoverScale.current, hovered ? HOVER_SCALE : 1, 12, delta);
      scale = hoverScale.current;
      opacity = TEMP_OPACITY;
      glow = TEMP_EMISSIVE_INTENSITY;
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
    } else if (isDropping) {
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
      rotZ = ((-1.5 * Math.PI) / 180) * Math.sin(2 * Math.PI * phase);
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

      {isCompleting && item.points !== undefined && (
        <Html position={[0, MEEPLE_HEIGHT + 18, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="board3d-points" style={{ '--n-color': item.color } as CSSProperties}>
            +{item.points}
          </div>
        </Html>
      )}
    </group>
  );
});
MeepleActor3D.displayName = 'MeepleActor3D';

// ============================================
// 🧍 СЛОЙ
// ============================================
export const MeepleLayer3D = memo(() => {
  const board = useGameStore((s) => s.board);
  const ghostMeeples = useGameStore((s) => s.ghostMeeples);
  const removePlacedMeeple = useGameStore((s) => s.removePlacedMeeple);
  const placementAnimation = useGameStore((s) => s.placementAnimation);
  const terrain = useFieldTerrain();

  const items = useMemo<MeepleItem[]>(() => {
    const result: MeepleItem[] = [];

    // Мипл с доски не рисуем, если тот же мипл уже показывает призрак
    // (между событием и state-update он мог ещё лежать на доске)
    const ghostKeys = new Set(ghostMeeples.map((g) => `${g.tileKey}:${g.featureId}`));

    for (const tile of board.values()) {
      const meeple = tile.meeple;
      if (!meeple) continue;
      if (ghostKeys.has(`${tile.x},${tile.y}:${meeple.featureId}`)) continue;

      const isDropping =
        placementAnimation?.meeple != null &&
        placementAnimation.tile?.x === tile.x &&
        placementAnimation.tile?.y === tile.y &&
        placementAnimation.meeple.featureId === meeple.featureId;

      result.push({
        key: `${tile.x},${tile.y}`,
        tileX: tile.x,
        tileY: tile.y,
        rotation: tile.rotation,
        templateId: tile.templateId,
        featureId: meeple.featureId,
        featureType: tile.features.find((f) => f.id === meeple.featureId)?.type,
        stored: { x: meeple.x, y: meeple.y },
        color: meeple.color,
        mode: meeple.isTemporary === true ? 'temporary' : isDropping ? 'dropping' : 'idle',
      });
    }

    for (const ghost of ghostMeeples) {
      const tile = board.get(ghost.tileKey);
      if (!tile) continue; // тайла нет на доске — нечем определить спот

      result.push({
        key: `ghost|${ghost.id}`,
        tileX: tile.x,
        tileY: tile.y,
        rotation: ghost.rotation,
        templateId: tile.templateId,
        featureId: ghost.featureId,
        featureType: ghost.featureType,
        stored: { x: ghost.x, y: ghost.y },
        color: ghost.color,
        mode: ghost.status === 'active' ? 'completing' : 'idle',
        points: ghost.status === 'active' ? ghost.points : undefined,
      });
    }

    return result;
  }, [board, ghostMeeples, placementAnimation]);

  return (
    <>
      {items.map((item) => (
        <MeepleActor3D key={item.key} item={item} terrain={terrain} onRemove={removePlacedMeeple} />
      ))}
    </>
  );
});
MeepleLayer3D.displayName = 'MeepleLayer3D';
