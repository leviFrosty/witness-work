import { StyleSheet } from 'react-native'
import {
  Canvas,
  Fill,
  Shader,
  Skia,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia'
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated'
import type { TiltShaderContext } from '@/shaders/types'

/**
 * Balatro-style holographic foil.
 *
 * Holographic (vs. plain Foil) in Balatro uses a crystalline facet pattern, not
 * the radial ripple from their foil shader. We get that look with a two-pass
 * voronoi: pass 1 locates the nearest cell centre, pass 2 measures the distance
 * to the nearest cell boundary. Sampling the boundary distance as a thin bright
 * line gives polygonal facet edges — the signature "shattered crystal" of
 * Balatro holo cards.
 *
 * Readability wins are structural here: facets are only bright at their edges,
 * so the interior of every cell is near-transparent. Text sitting in a cell
 * interior stays crisp; the rainbow shows up as glowing seams between cells
 * instead of a wash over everything.
 */
const sksl = `
uniform float2 u_resolution;
uniform float2 u_tilt;
uniform float u_time;

float hash1(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

float2 hash2(float2 p) {
  return fract(
    sin(float2(dot(p, float2(127.1, 311.7)), dot(p, float2(269.5, 183.3)))) *
    43758.5453
  );
}

float3 hsv2rgb(float3 c) {
  float3 p = abs(fract(c.xxx + float3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(float3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// Returns (distance to nearest edge, cell id, cell distance).
// https://iquilezles.org/articles/voronoilines/ — the standard "voronoi borders" trick.
float3 voronoiFacets(float2 x, float t) {
  float2 n = floor(x);
  float2 f = fract(x);

  // Pass 1: find the nearest cell centre.
  float2 mg = float2(0.0);
  float2 mr = float2(0.0);
  float md = 8.0;
  float mid = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      float2 g = float2(float(i), float(j));
      float2 o = hash2(n + g);
      // Animate cell centres — tilt + time jitter keeps facets alive at rest
      // and shifts them as the user moves the device.
      o = 0.5 + 0.5 * sin(t + 6.2831 * o);
      float2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        mr = r;
        mg = g;
        mid = hash1(n + g);
      }
    }
  }

  // Pass 2: measure the perpendicular distance from the current fragment to
  // the midline between the nearest cell and each other nearby cell. The
  // smallest such distance is the distance to the nearest facet edge.
  float edge = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      float2 g = mg + float2(float(i), float(j));
      float2 o = hash2(n + g);
      o = 0.5 + 0.5 * sin(t + 6.2831 * o);
      float2 r = g + o - f;
      float2 diff = r - mr;
      float dlen = dot(diff, diff);
      if (dlen > 0.00001) {
        edge = min(edge, dot(0.5 * (mr + r), normalize(diff)));
      }
    }
  }

  return float3(edge, mid, sqrt(md));
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_resolution;

  // Aspect-correct so facets are roughly square, not stretched on wide cards.
  float aspect = u_resolution.x / u_resolution.y;
  float2 cellSpace = float2(uv.x * aspect, uv.y);

  // Cell grid density. Higher = more, smaller facets. Balatro's facets are
  // large and readable — a handful per card, not dozens of tiny ones.
  float density = 2.0;
  // Tilt shifts the grid origin so facets slide across the card as you tilt.
  float2 tiltShift = u_tilt * 0.6;
  float t = u_time * 0.25;

  float3 v = voronoiFacets(cellSpace * density + tiltShift, t);
  float edge = v.x;
  float cellId = v.y;

  // Thin hairline seam — tight falloff. A pencil-width crease is what
  // Balatro has between facets; a wider step would read as a neon halo.
  float seam = (1.0 - smoothstep(0.0, 0.015, edge));

  // Per-cell hue plus a slow global drift so each facet is its own colour
  // but the whole surface slowly sweeps the rainbow as you tilt. Low
  // saturation = pastel facets (Balatro-style) instead of neon.
  float hue = fract(
    cellId +
    u_tilt.x * 0.55 - u_tilt.y * 0.3 +
    u_time * 0.05
  );
  // Seam tips toward white so they read as light-catches, not just more hue.
  float3 pastel = hsv2rgb(float3(hue, 0.35, 1.0));
  float3 color = mix(pastel, float3(1.0), seam * 0.35);

  // Translucent alpha: the card sits *under* the shader, so the cream
  // cardstock + text need to read through. ~0.35 in cell interiors keeps
  // text legible; the seam adds a +0.45 bump so edges still pop as shine.
  float tiltMag = length(u_tilt);
  float alpha = clamp(
    0.35 + seam * 0.45 + tiltMag * 0.08,
    0.28,
    0.88
  );

  return half4(color * alpha, alpha);
}
`

let cachedEffect: SkRuntimeEffect | null | undefined
const getEffect = (): SkRuntimeEffect | null => {
  if (cachedEffect === undefined) {
    cachedEffect = Skia.RuntimeEffect.Make(sksl)
    if (!cachedEffect) {
      console.warn('HolographicShader: SkSL failed to compile')
    }
  }
  return cachedEffect ?? null
}

const HolographicShader = ({
  width,
  height,
  tiltX,
  tiltY,
  borderRadius,
}: TiltShaderContext) => {
  const effect = getEffect()

  const time = useSharedValue(0)
  useFrameCallback((frame) => {
    time.value = frame.timeSinceFirstFrame / 1000
  })

  const uniforms = useDerivedValue(() => {
    const w = Math.max(1, width.value)
    const h = Math.max(1, height.value)
    return {
      u_resolution: [w, h],
      u_tilt: [tiltX.value, tiltY.value],
      u_time: time.value,
    }
  })

  if (!effect) return null

  return (
    <Canvas
      pointerEvents='none'
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius,
          borderCurve: 'continuous',
          overflow: 'hidden',
          // Normal blend: the shader's premultiplied pastel output layers
          // directly onto the cream cardstock below. Previous `screen` mode
          // was tuned for a dark card — on cream it washes everything to
          // white and loses the pastel tint.
        },
      ]}
    >
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  )
}

export default HolographicShader
