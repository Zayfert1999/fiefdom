// packages/client/src/renderer3d/FeatureOverlay.tsx
// ============================================
// 🖍 ПОДСВЕТКА ФИЧИ ТАЙЛА (штриховка / пульсация)
// ============================================
// Накладывается поверх мешей, принадлежащих фиче (группы TileMeshData по
// featureId): берутся ТЕ ЖЕ треугольники, чуть приподнятые по нормали, —
// подсветка точно повторяет процедурную геометрию, включая шум и стены.
//
//   • hatch — диагональная штриховка в цветах владельцев (аналог SVG-паттерна
//             hatch-*): полосы в мировых координатах, поэтому непрерывны
//             через границы тайлов; медленно «ползут», как <animate> в SVG;
//   • pulse — золотая пульсация завершённого региона (аналог
//             .completion-highlight).
//
// Появление/исчезновение — плавное (как transition opacity .4s у .region-fill).
// ============================================
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { TileMeshData } from '@/core/geometry/tileMesh';

/** Максимум цветов штриховки (по числу игроков) */
const MAX_COLORS = 5;
/** Ширина одной полосы, юниты (как segmentWidth в SVG) */
const STRIPE_WIDTH = 5;
/** Скорость «ползущей» штриховки, юниты/с */
const HATCH_SPEED = 2;
/** Период пульсации завершённого региона, с (как completion-pulse) */
const PULSE_PERIOD = 1;
/** Скорость появления/исчезновения, 1/с (≈ 0.4 с как в CSS) */
const FADE_RATE = 8;

// ============================================
// 📐 ГЕОМЕТРИЯ ПОДСВЕТКИ (кэш по мешу и фиче)
// ============================================
interface SharedAttributes {
  readonly position: THREE.BufferAttribute;
  readonly normal: THREE.BufferAttribute;
}

const attributeCache = new WeakMap<TileMeshData, SharedAttributes>();
const overlayCache = new WeakMap<TileMeshData, Map<string, THREE.BufferGeometry | null>>();

function getSharedAttributes(mesh: TileMeshData): SharedAttributes {
  let attributes = attributeCache.get(mesh);
  if (!attributes) {
    attributes = {
      position: new THREE.BufferAttribute(mesh.positions, 3),
      normal: new THREE.BufferAttribute(mesh.normals, 3),
    };
    attributeCache.set(mesh, attributes);
  }
  return attributes;
}

/**
 * Геометрия подсветки фичи: вершины меша общие, индексы — только треугольники
 * её групп. null — у меша нет групп с таким featureId.
 */
export function getFeatureOverlayGeometry(mesh: TileMeshData, featureId: string): THREE.BufferGeometry | null {
  let perFeature = overlayCache.get(mesh);
  if (!perFeature) {
    perFeature = new Map();
    overlayCache.set(mesh, perFeature);
  }
  if (perFeature.has(featureId)) return perFeature.get(featureId) ?? null;

  const groups = mesh.groups.filter((group) => group.featureId === featureId);
  if (groups.length === 0) {
    perFeature.set(featureId, null);
    return null;
  }

  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const indices = new Uint32Array(total);
  let offset = 0;
  for (const group of groups) {
    indices.set(mesh.indices.subarray(group.start, group.start + group.count), offset);
    offset += group.count;
  }

  const { position, normal } = getSharedAttributes(mesh);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  perFeature.set(featureId, geometry);
  return geometry;
}

// ============================================
// 🎨 ШЕЙДЕР
// ============================================
const VERTEX_SHADER = /* glsl */ `
  uniform float uLift;
  varying vec3 vWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position + normal * uLift, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColors[${MAX_COLORS}];
  uniform int uCount;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uSolid;
  varying vec3 vWorld;

  void main() {
    float seg = ${STRIPE_WIDTH.toFixed(1)};
    float cell = seg * 2.0;
    float period = cell * float(uCount);

    // Полосы под 45° в мировых координатах + дрейф по времени
    float u = (vWorld.x + vWorld.z) * 0.70710678 + uTime;
    float m = mod(u, period);
    int index = int(floor(m / cell));
    index = clamp(index, 0, ${MAX_COLORS - 1});
    float inBand = m - float(index) * cell;

    // Сглаживание краёв полос по размеру пикселя
    float aa = clamp(fwidth(u), 0.0001, seg * 0.45);
    float stripe = smoothstep(0.0, aa, inBand) * (1.0 - smoothstep(seg - aa, seg, inBand));

    float alpha = mix(stripe, 1.0, uSolid) * uOpacity;
    if (alpha < 0.003) discard;

    gl_FragColor = vec4(uColors[index], alpha);
    #include <colorspace_fragment>
  }
`;

export type OverlayMode = 'hatch' | 'pulse';

function createOverlayMaterial(mode: OverlayMode, lift: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uColors: { value: Array.from({ length: MAX_COLORS }, () => new THREE.Color('#ffffff')) },
      uCount: { value: 1 },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSolid: { value: mode === 'pulse' ? 1 : 0 },
      uLift: { value: lift },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    blending: mode === 'pulse' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// ============================================
// 🖍 КОМПОНЕНТ
// ============================================
interface FeatureOverlayProps {
  mesh: TileMeshData;
  featureId: string;
  colors: readonly string[];
  /** Целевая непрозрачность: 0 — скрыто (плавно), для pulse — амплитуда */
  opacity: number;
  mode?: OverlayMode;
  /** Подъём над поверхностью по нормали, юниты (у завершённых выше, чтобы лежали поверх штриховки) */
  lift?: number;
}

export const FeatureOverlay = memo(
  ({ mesh, featureId, colors, opacity, mode = 'hatch', lift = 0.4 }: FeatureOverlayProps) => {
    const geometry = useMemo(() => getFeatureOverlayGeometry(mesh, featureId), [mesh, featureId]);
    const material = useMemo(() => createOverlayMaterial(mode, lift), [mode, lift]);
    const meshRef = useRef<THREE.Mesh>(null);

    // Цвета переписываем в uniform-массив; ключ-строка не даёт эффекту сработать впустую
    const colorsKey = colors.join('|');
    useEffect(() => {
      const list = colorsKey.split('|').slice(0, MAX_COLORS);
      const uniformColors = material.uniforms.uColors.value as THREE.Color[];
      list.forEach((hex, i) => uniformColors[i].set(hex));
      material.uniforms.uCount.value = Math.max(1, list.length);
    }, [material, colorsKey]);

    useEffect(() => () => material.dispose(), [material]);

    useFrame((state, delta) => {
      const uniforms = material.uniforms;
      const elapsed = state.clock.elapsedTime;
      uniforms.uTime.value = elapsed * HATCH_SPEED;

      // pulse: 70%…100% амплитуды, как completion-pulse в CSS
      const target =
        mode === 'pulse'
          ? opacity * (0.7 + 0.3 * (0.5 + 0.5 * Math.sin((elapsed / PULSE_PERIOD) * Math.PI * 2)))
          : opacity;
      uniforms.uOpacity.value = THREE.MathUtils.damp(uniforms.uOpacity.value as number, target, FADE_RATE, delta);

      if (meshRef.current) meshRef.current.visible = (uniforms.uOpacity.value as number) > 0.004;
    });

    if (!geometry) return null;
    return (
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        renderOrder={mode === 'pulse' ? 3 : 2}
        frustumCulled={false}
      />
    );
  }
);
FeatureOverlay.displayName = 'FeatureOverlay';
