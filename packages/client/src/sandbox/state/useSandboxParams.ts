// packages/client/src/sandbox/state/useSandboxParams.ts
// ============================================
// 🎛 СОСТОЯНИЕ ПАРАМЕТРОВ ПЕСОЧНИЦЫ
// ============================================
// Хранит GeometryParams (то, что лежит в geometryParams.json), копию «как в файле»
// для индикации несохранённых изменений и все операции над параметрами.
// Вьюхи и панели получают значения и `actions`, сами состояние не держат.
// ============================================
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  NOISE_PARAMS,
  DEFAULT_TESSELLATION_PARAMS,
  DEFAULT_PLAZA_PARAMS,
  DEFAULT_SPOT_PARAMS,
  DEFAULT_SHAPE_PARAMS,
} from '@/core/geometry';
import type {
  NoiseByType,
  NoiseSettings,
  PlazaParams,
  ShapeParams,
  ShieldAnchor,
  SpotParams,
  TessellationParams,
} from '@/core/geometry';
import { resolveMeshParams, type MeshParamsInput } from '@/core/geometry/tileMesh';
import { mergeWallParams, resolveWallParams, type WallParamsInput } from '@/core/geometry/wallParams';
import { mergeTownParams, resolveTownParams, type TownParamsInput } from '@/core/geometry/townParams';
import {
  DEFAULT_GEOMETRY_PARAMS,
  cloneGeometryParams,
  hashGeometryParams,
  resolveGeometryParams,
  type GeometryParams,
} from '@/core/geometry/geometryParams';
import { GEOMETRY_PARAMS } from '@/core/geometry/loadedGeometryParams';

export const useSandboxParams = () => {
  const [params, setParams] = useState<GeometryParams>(() => cloneGeometryParams(GEOMETRY_PARAMS));
  /** Что лежит в файле сейчас: обновляется после «Сохранить» и «Загрузить» */
  const [savedParams, setSavedParams] = useState<GeometryParams>(() => cloneGeometryParams(GEOMETRY_PARAMS));

  // Пока ползунок тянут, тяжёлый пайплайн (булевы операции + 3D) догоняет с задержкой
  const deferredParams = useDeferredValue(params);
  const isPending = params !== deferredParams;

  const dirty = useMemo(
    () => hashGeometryParams(params) !== hashGeometryParams(savedParams),
    [params, savedParams]
  );

  const patchShapes = useCallback(
    <G extends keyof ShapeParams>(group: G, patch: Partial<ShapeParams[G]>) =>
      setParams((prev) =>
        resolveGeometryParams({
          ...prev,
          shapes: { ...prev.shapes, [group]: { ...prev.shapes[group], ...patch } },
        })
      ),
    []
  );

  const patchNoise = useCallback(
    (patch: Partial<NoiseSettings>) => setParams((prev) => ({ ...prev, noise: { ...prev.noise, ...patch } })),
    []
  );
  const patchTess = useCallback(
    (patch: Partial<TessellationParams>) =>
      setParams((prev) => ({ ...prev, tessellation: { ...prev.tessellation, ...patch } })),
    []
  );
  const patchPlaza = useCallback(
    (patch: Partial<PlazaParams>) => setParams((prev) => ({ ...prev, plaza: { ...prev.plaza, ...patch } })),
    []
  );
  const patchSpots = useCallback(
    (patch: Partial<SpotParams>) => setParams((prev) => ({ ...prev, spots: { ...prev.spots, ...patch } })),
    []
  );
  const patchMesh = useCallback(
    (patch: MeshParamsInput) =>
      setParams((prev) => ({
        ...prev,
        mesh: resolveMeshParams({
          ...prev.mesh,
          ...patch,
          heights: { ...prev.mesh.heights, ...patch.heights },
          colors: { ...prev.mesh.colors, ...patch.colors },
        }),
      })),
    []
  );
  const setNoiseByType = useCallback(
    (next: NoiseByType) => setParams((prev) => resolveGeometryParams({ ...prev, noiseByType: next })),
    []
  );

  const resetNoise = useCallback(() => setParams((prev) => ({ ...prev, noise: { ...NOISE_PARAMS } })), []);
  const resetTess = useCallback(
    () => setParams((prev) => ({ ...prev, tessellation: { ...DEFAULT_TESSELLATION_PARAMS } })),
    []
  );
  const resetPlaza = useCallback(
    () => setParams((prev) => ({ ...prev, plaza: { ...DEFAULT_PLAZA_PARAMS } })),
    []
  );
  const resetShapes = useCallback(
    () => setParams((prev) => ({ ...prev, shapes: structuredClone(DEFAULT_SHAPE_PARAMS) as ShapeParams })),
    []
  );
  const resetSpots = useCallback(
    () => setParams((prev) => ({ ...prev, spots: { ...DEFAULT_SPOT_PARAMS } })),
    []
  );
  const resetMesh = useCallback(() => setParams((prev) => ({ ...prev, mesh: resolveMeshParams() })), []);
  const patchWalls = useCallback(
    (patch: WallParamsInput) => setParams((prev) => ({ ...prev, walls: mergeWallParams(prev.walls, patch) })),
    []
  );
  const resetWalls = useCallback(() => setParams((prev) => ({ ...prev, walls: resolveWallParams() })), []);
  const patchTown = useCallback(
    (patch: TownParamsInput) => setParams((prev) => ({ ...prev, town: mergeTownParams(prev.town, patch) })),
    []
  );
  const resetTown = useCallback(() => setParams((prev) => ({ ...prev, town: resolveTownParams() })), []);

  // Файл параметров: сохранение, загрузка, откат
  const handleSaved = useCallback((saved: GeometryParams) => setSavedParams(cloneGeometryParams(saved)), []);
  const handleLoaded = useCallback((loaded: GeometryParams) => setParams(loaded), []);
  const handleRevert = useCallback(() => setParams(cloneGeometryParams(savedParams)), [savedParams]);
  const handleResetDefaults = useCallback(() => setParams(cloneGeometryParams(DEFAULT_GEOMETRY_PARAMS)), []);

  // 📌 Настройки конкретного тайла (по id)

  /** Закрепляет seed за тайлом */
  const pinSeed = useCallback(
    (tileId: string, seed: string) =>
      setParams((prev) =>
        resolveGeometryParams({
          ...prev,
          tiles: { ...prev.tiles, [tileId]: { ...prev.tiles[tileId], seed } },
        })
      ),
    []
  );

  /** Снимает закрепление seed, сохраняя остальные настройки тайла */
  const clearPin = useCallback(
    (tileId: string) =>
      setParams((prev) => {
        const current = prev.tiles[tileId];
        if (!current) return prev;
        const tiles = { ...prev.tiles };
        tiles[tileId] = {
          ...(current.shieldAnchor ? { shieldAnchor: current.shieldAnchor } : {}),
          ...(current.noise ? { noise: current.noise } : {}),
        };
        return resolveGeometryParams({ ...prev, tiles });
      }),
    []
  );

  /** Задаёт (или снимает) привязку щита */
  const setShieldAnchor = useCallback(
    (tileId: string, anchor: ShieldAnchor | undefined) =>
      setParams((prev) =>
        resolveGeometryParams({
          ...prev,
          tiles: { ...prev.tiles, [tileId]: { ...prev.tiles[tileId], shieldAnchor: anchor } },
        })
      ),
    []
  );

  // Геометрию тайлов пересчитываем только когда правится то, что на неё влияет: городские стены
  // строятся поверх готовых бандлов, и ползунок стены не должен гонять аудит всех тайлов
  const tileParamsKey = useMemo(
    () => hashGeometryParams(deferredParams, undefined, { includeWalls: false }),
    [deferredParams]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- осознанно: идентичность держится по хэшу без стен
  const tileParams = useMemo(() => deferredParams, [tileParamsKey]);

  const actions = useMemo(
    () => ({
      patchShapes,
      patchNoise,
      patchTess,
      patchPlaza,
      patchSpots,
      patchMesh,
      setNoiseByType,
      resetNoise,
      resetTess,
      resetPlaza,
      resetShapes,
      resetSpots,
      resetMesh,
      patchWalls,
      resetWalls,
      patchTown,
      resetTown,
      handleSaved,
      handleLoaded,
      handleRevert,
      handleResetDefaults,
      pinSeed,
      clearPin,
      setShieldAnchor,
    }),
    [
      patchShapes,
      patchNoise,
      patchTess,
      patchPlaza,
      patchSpots,
      patchMesh,
      setNoiseByType,
      resetNoise,
      resetTess,
      resetPlaza,
      resetShapes,
      resetSpots,
      resetMesh,
      patchWalls,
      resetWalls,
      patchTown,
      resetTown,
      handleSaved,
      handleLoaded,
      handleRevert,
      handleResetDefaults,
      pinSeed,
      clearPin,
      setShieldAnchor,
    ]
  );

  return { params, savedParams, deferredParams, tileParams, isPending, dirty, actions };
};

export type SandboxParamsApi = ReturnType<typeof useSandboxParams>;
export type SandboxParamsActions = SandboxParamsApi['actions'];
