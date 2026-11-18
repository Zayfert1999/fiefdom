// packages/client/src/renderer3d/cameraPreset.ts
// ============================================
// 🎥 ПРЕСЕТ КАМЕРЫ ИГРОВОЙ 3D-ДОСКИ
// ============================================
// Все параметры обзора — в cameraPreset.json; здесь он проверяется (значения вне допустимых
// пределов зажимаются, мусор заменяется значениями по умолчанию) и переводится в числа,
// которые нужны CameraRig и GameBoard3D. Чистый модуль: без three и React.
//
// 📐 УГЛЫ
//   pitch (наклон) — угол между направлением взгляда и плоскостью земли:
//                    90° — строго сверху, 30° — камера низко, почти изометрия;
//   yaw (поворот)  — вращение вокруг вертикали: 0° — камера на юге (+z) смотрит на север,
//                    положительный — камера уходит к востоку (+x). При 45° клетки доски
//                    выглядят ромбами.
//
//   Смещение камеры от цели:
//     offset = distance · (cos(pitch)·sin(yaw),  sin(pitch),  cos(pitch)·cos(yaw))
//   В терминах OrbitControls: polarAngle = 90° − pitch, azimuthAngle = yaw.
//
// 🔒 lockRotation: true — углы заданы жёстко (вращение отключено, ПКМ тоже панорамирует).
//   false — игрок может вращать камеру в пределах unlocked.pitchMin/MaxDeg, а пресет задаёт
//   только стартовый вид и вид по хоткею сброса.
// ============================================
import rawPreset from './cameraPreset.json';

export interface CameraPreset {
  /** Наклон к земле, градусы */
  readonly pitchDeg: number;
  /** Поворот вокруг вертикали, градусы, (−180, 180] */
  readonly yawDeg: number;
  readonly lockRotation: boolean;
  /** Пределы наклона, если вращение разрешено */
  readonly pitchMinDeg: number;
  readonly pitchMaxDeg: number;
  /** Расстояние до цели по умолчанию и пределы зума */
  readonly distance: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  /** Расстояние до цели при выборе мипла */
  readonly meepleDistance: number;
  readonly fov: number;
  /** Скорость сглаживания автодвижений камеры, 1/с */
  readonly smoothing: number;
  /** Щиты разворачиваются лицом к камере (иначе смотрят на юг). Миплы от камеры не зависят */
  readonly shieldsFaceCamera: boolean;
}

export const DEFAULT_CAMERA_PRESET: Readonly<CameraPreset> = {
  pitchDeg: 30,
  yawDeg: 45,
  lockRotation: true,
  pitchMinDeg: 20,
  pitchMaxDeg: 80,
  distance: 520,
  minDistance: 110,
  maxDistance: 2600,
  meepleDistance: 250,
  fov: 40,
  smoothing: 7,
  shieldsFaceCamera: true,
};

const finite = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Угол в (−180, 180] */
export function normalizeYaw(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

interface RawPreset {
  pitchDeg?: unknown;
  yawDeg?: unknown;
  lockRotation?: unknown;
  unlocked?: { pitchMinDeg?: unknown; pitchMaxDeg?: unknown };
  distance?: unknown;
  minDistance?: unknown;
  maxDistance?: unknown;
  meepleDistance?: unknown;
  fov?: unknown;
  smoothing?: unknown;
  shieldsFaceCamera?: unknown;
}

/** Проверяет произвольный объект (JSON) и приводит его к допустимому пресету */
export function resolveCameraPreset(raw?: RawPreset): CameraPreset {
  const d = DEFAULT_CAMERA_PRESET;

  const minDistance = clamp(finite(raw?.minDistance, d.minDistance), 20, 5000);
  const maxDistance = Math.max(minDistance + 1, clamp(finite(raw?.maxDistance, d.maxDistance), 50, 20000));

  // Наклон: не строго сверху (там вырождается азимут) и не вровень с землёй
  const pitchMin = clamp(finite(raw?.unlocked?.pitchMinDeg, d.pitchMinDeg), 5, 85);
  const pitchMax = Math.max(pitchMin, clamp(finite(raw?.unlocked?.pitchMaxDeg, d.pitchMaxDeg), 5, 89));

  return {
    pitchDeg: clamp(finite(raw?.pitchDeg, d.pitchDeg), 5, 89),
    yawDeg: normalizeYaw(finite(raw?.yawDeg, d.yawDeg)),
    lockRotation: typeof raw?.lockRotation === 'boolean' ? raw.lockRotation : d.lockRotation,
    pitchMinDeg: pitchMin,
    pitchMaxDeg: pitchMax,
    distance: clamp(finite(raw?.distance, d.distance), minDistance, maxDistance),
    minDistance,
    maxDistance,
    meepleDistance: clamp(finite(raw?.meepleDistance, d.meepleDistance), minDistance, maxDistance),
    fov: clamp(finite(raw?.fov, d.fov), 10, 100),
    smoothing: clamp(finite(raw?.smoothing, d.smoothing), 1, 30),
    shieldsFaceCamera:
      typeof raw?.shieldsFaceCamera === 'boolean' ? raw.shieldsFaceCamera : d.shieldsFaceCamera,
  };
}

/** Пресет из cameraPreset.json */
export const CAMERA_PRESET: Readonly<CameraPreset> = resolveCameraPreset(rawPreset as RawPreset);

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Смещение камеры от цели для углов и расстояния (формула в шапке файла) */
export function offsetFromAngles(
  pitchDeg: number,
  yawDeg: number,
  distance: number
): { x: number; y: number; z: number } {
  const pitch = toRadians(pitchDeg);
  const yaw = toRadians(yawDeg);
  return {
    x: distance * Math.cos(pitch) * Math.sin(yaw),
    y: distance * Math.sin(pitch),
    z: distance * Math.cos(pitch) * Math.cos(yaw),
  };
}

/** Смещение камеры по умолчанию (старт, сброс по хоткею) */
export const DEFAULT_OFFSET = offsetFromAngles(CAMERA_PRESET.pitchDeg, CAMERA_PRESET.yawDeg, CAMERA_PRESET.distance);

/** Угол поворота щита вокруг Y, чтобы он смотрел на камеру (0 — на юг) */
export const SHIELD_YAW: number = CAMERA_PRESET.shieldsFaceCamera ? toRadians(CAMERA_PRESET.yawDeg) : 0;

// ============================================
// 🎛 ПАРАМЕТРЫ MapControls
// ============================================
export interface ControlsLimits {
  readonly enableRotate: boolean;
  /** Полярный угол OrbitControls: от вертикали (0 — строго сверху) */
  readonly minPolarAngle: number;
  readonly maxPolarAngle: number;
  readonly minAzimuthAngle: number;
  readonly maxAzimuthAngle: number;
}

export function controlsLimits(preset: CameraPreset): ControlsLimits {
  if (preset.lockRotation) {
    const polar = toRadians(90 - preset.pitchDeg);
    const azimuth = toRadians(preset.yawDeg);
    return {
      enableRotate: false,
      minPolarAngle: polar,
      maxPolarAngle: polar,
      minAzimuthAngle: azimuth,
      maxAzimuthAngle: azimuth,
    };
  }
  return {
    enableRotate: true,
    // Больший наклон к земле = больший полярный угол
    minPolarAngle: toRadians(90 - preset.pitchMaxDeg),
    maxPolarAngle: toRadians(90 - preset.pitchMinDeg),
    minAzimuthAngle: -Infinity,
    maxAzimuthAngle: Infinity,
  };
}
