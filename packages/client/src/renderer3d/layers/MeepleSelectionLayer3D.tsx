// packages/client/src/renderer3d/layers/MeepleSelectionLayer3D.tsx
// ============================================
// 🔶 СПОТЫ ДЛЯ ВЫБОРА МИПЛА (аналог SVG MeepleSelectionLayer)
// ============================================
// В фазе placeMeeple на последнем тайле показываются полупрозрачные
// «призраки» миплов на каждой свободной фиче. Наведение окрашивает призрак
// в цвет игрока и увеличивает ×1.3, клик ставит временного мипла
// (selectMeepleSpot).
//
// Какие фичи доступны — логика SVG-слоя без изменений. В стор уходят
// координаты в системе [0, 100] (протокол прежний), но вычисленные из
// процедурной геометрии, а не из ручных данных.
// ============================================
import { memo, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import type { TileFeature } from '@fiefdom/shared/core/types';
import { useGameStore } from '@/state/useGameStore';
import { featureSurface, localToWorld, surfaceTopY, toStorePoint, type LocalPoint } from '../boardMath';
import { MEEPLE_HEIGHT, MEEPLE_HIT_RADIUS, MeepleFigure, useMeepleMaterial } from '../models/MeepleModel';
import { resolveMeepleSpot } from '../spotUtils';
import { BOARD_MESH_PARAMS, getBundle, getTileDefinition } from '../tileBundles';
import { fieldSurfaceY } from '../fieldTerrain';
import { useFieldTerrain } from '../useFieldTerrain';

const CLICK_DRAG_PX = 5;
const HOVER_SCALE = 1.3;

interface SpotGhostProps {
  featureId: string;
  lying: boolean;
  position: [number, number, number];
  playerColor: string;
  onSelect: () => void;
}

const SpotGhost = memo(({ featureId, lying, position, playerColor, onSelect }: SpotGhostProps) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  // Призрак: белый полупрозрачный; при наведении — цвет игрока
  const material = useMeepleMaterial(hovered ? playerColor : '#ffffff', {
    opacity: hovered ? 1 : 0.8,
    emissive: hovered ? playerColor : '#ffffff',
    emissiveIntensity: hovered ? 0.35 : 0.15,
  });

  const group = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const target = hovered ? HOVER_SCALE : 1;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, target, 12, delta));
    // Лёгкое парение привлекает внимание к свободным спотам
    g.position.y = hovered ? 2 : 1 + Math.sin(state.clock.elapsedTime * 2.2 + position[0]) * 0.8;
  });

  return (
    <group position={position}>
      <group
        ref={group}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          if (event.delta > CLICK_DRAG_PX) return;
          onSelect();
        }}
      >
        <MeepleFigure material={material} lying={lying} />
        {/* Невидимая зона клика крупнее фигурки */}
        <mesh position={[0, MEEPLE_HEIGHT / 2, 0]} name={`hit-${featureId}`}>
          <cylinderGeometry args={[MEEPLE_HIT_RADIUS, MEEPLE_HIT_RADIUS, MEEPLE_HEIGHT, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
});
SpotGhost.displayName = 'SpotGhost';

export const MeepleSelectionLayer3D = memo(() => {
  const board = useGameStore((s) => s.board);
  const phase = useGameStore((s) => s.phase);
  const currentPlayer = useGameStore((s) => s.players[s.currentTurn]);
  const regionManager = useGameStore((s) => s.regionManager);
  const selectMeepleSpot = useGameStore((s) => s.selectMeepleSpot);
  const terrain = useFieldTerrain();

  // Последний тайл и свободные фичи — как в SVG-версии
  const target = useMemo(() => {
    if (phase !== 'placeMeeple' || !currentPlayer || currentPlayer.meepleCount <= 0) return null;

    const tiles = Array.from(board.values());
    const lastTile = tiles[tiles.length - 1];
    if (!lastTile) return null;

    // Постоянный мипл уже стоит — ставить больше некого
    if (lastTile.meeple && !lastTile.meeple.isTemporary) return null;

    const definition = getTileDefinition(lastTile.templateId);
    const features: readonly TileFeature[] = definition ? definition.features : lastTile.features;

    const available = features.filter((feature) => {
      const featureKey = `${lastTile.x},${lastTile.y}:${feature.id}`;
      if (regionManager.getFeatureOwners(featureKey).length > 0) return false;
      // На фиче с временным миплом спот скрыт
      return !(lastTile.meeple?.isTemporary && lastTile.meeple.featureId === feature.id);
    });
    if (available.length === 0) return null;

    const bundle = getBundle(lastTile.templateId);
    const spots = available.flatMap((feature) => {
      const local: LocalPoint | null = resolveMeepleSpot(bundle, feature.id, feature.meepleSpot);
      if (!local) return [];
      const world = localToWorld(lastTile.x, lastTile.y, lastTile.rotation, local);
      const flat = surfaceTopY(BOARD_MESH_PARAMS, featureSurface(feature.type));
      // Поле с рельефом: призрак стоит на холме, а не на плоском уровне
      const hill = feature.type === 'field' && terrain.tiles ? fieldSurfaceY(terrain, world.x, world.z) : null;
      const y = hill ?? flat;
      return [
        {
          featureId: feature.id,
          lying: feature.type === 'field',
          position: [world.x, y, world.z] as [number, number, number],
          store: toStorePoint(local),
        },
      ];
    });
    return spots.length > 0 ? spots : null;
  }, [board, phase, currentPlayer, regionManager, terrain]);

  if (!target || !currentPlayer) return null;

  return (
    <>
      {target.map((spot) => (
        <SpotGhost
          key={spot.featureId}
          featureId={spot.featureId}
          lying={spot.lying}
          position={spot.position}
          playerColor={currentPlayer.color}
          onSelect={() => selectMeepleSpot(spot.featureId, spot.store.x, spot.store.y)}
        />
      ))}
    </>
  );
});
MeepleSelectionLayer3D.displayName = 'MeepleSelectionLayer3D';