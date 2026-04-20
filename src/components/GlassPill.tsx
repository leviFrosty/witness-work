import { StyleSheet } from 'react-native'
import {
  Canvas,
  Fill,
  LinearGradient,
  RadialGradient,
  RoundedRect,
  Shader,
  Skia,
  type SkRuntimeEffect,
  vec,
} from '@shopify/react-native-skia'

type Props = {
  width: number
  height: number
  /** Base tint — e.g. theme.colors.card. */
  tint: string
  /**
   * Rim/border stroke color, applied at hairline width. Typically
   * `theme.colors.border` or a semi-transparent white.
   */
  rim: string
  /**
   * Opacity applied to the base tint fill. Lower values read as a thinner, more
   * translucent glass. iOS 26-like materials land around 0.7–0.9.
   */
  tintOpacity?: number
  /**
   * Radius of the rounded-rect. Defaults to fully rounded (height / 2), i.e. a
   * capsule / pill shape.
   */
  radius?: number
  /** When true, paints a brighter specular highlight — use for dark mode. */
  isDark: boolean
}

/**
 * Procedural rim-refraction shader. Paints, inside the pill's rounded-rect SDF:
 *
 * - A soft rim band that fades inward (the "edge of the glass" look).
 * - A gaussian inner highlight ring concentrated on the top half — fakes the
 *   inside-edge catch-light that appears when light bends through the rim.
 * - A subtle chromatic dispersion (R/G/B phase-shifted sine around the angle) so
 *   the rim picks up a faint prism-like fringe.
 * - A darker band at the bottom rim so the edge reads as lit from above.
 *
 * This does NOT actually displace pixels behind the pill — it's procedural
 * paint, not real refraction. Doing real refraction would require capturing the
 * backdrop as an SkImage and sampling it with UV displacement, which means a
 * ViewShot readback on every frame (dropped for perf reasons). The perceptual
 * target is "looks like iOS 26 liquid glass," not physical accuracy.
 */
const rimSksl = `
uniform float2 u_resolution;
uniform float u_radius;
uniform float u_rimThickness;
uniform float u_dark;

float sdRoundedRect(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

half4 main(float2 fragCoord) {
  float2 center = u_resolution * 0.5;
  float2 p = fragCoord - center;

  float d = sdRoundedRect(p, center, u_radius);
  if (d > 0.0) {
    return half4(0.0);
  }

  float edgeDist = -d;

  // Primary rim falloff — strongest at the edge, fading inward.
  float rim = 1.0 - smoothstep(0.0, u_rimThickness, edgeDist);

  // Outward normal at this point (guard against center singularity).
  float2 n = (length(p) > 0.001) ? normalize(p) : float2(0.0, -1.0);

  // Vertical light bias — pill is lit from above.
  float topBias = clamp(-n.y, 0.0, 1.0);
  float bottomBias = clamp(n.y, 0.0, 1.0);

  // Inner highlight ring — a gaussian band just inside the rim, concentrated
  // on the top half. Sims the "inside-edge catch-light" of a glass lens.
  float ringCenter = u_rimThickness * 0.55;
  float ringWidth = u_rimThickness * 0.3;
  float ringDx = (edgeDist - ringCenter) / ringWidth;
  float ring = exp(-ringDx * ringDx) * topBias;

  // Chromatic dispersion — subtle prism fringe around the rim. R/G/B are
  // phase-shifted so the mix creates near-white in the middle and color
  // shifts at specific angles.
  float angle = atan(n.y, n.x);
  float3 prism;
  prism.r = 0.5 + 0.5 * sin(angle * 2.5 + 0.0);
  prism.g = 0.5 + 0.5 * sin(angle * 2.5 + 2.094);
  prism.b = 0.5 + 0.5 * sin(angle * 2.5 + 4.189);
  float3 brightColor = mix(float3(1.0), prism, 0.15);

  float brightScale = mix(0.7, 0.45, u_dark);
  float brightAlpha = (rim * (0.55 + topBias * 0.45) + ring * 0.4) * brightScale;

  // Bottom shadow — darken the bottom rim so the pill reads dimensional.
  float darkAlpha = rim * bottomBias * mix(0.28, 0.15, u_dark);

  // Premultiplied composite: bright (colored) + dark (black).
  float3 premult = brightColor * brightAlpha;
  float alpha = clamp(brightAlpha + darkAlpha, 0.0, 1.0);

  return half4(premult, alpha);
}
`

let cachedRimEffect: SkRuntimeEffect | null | undefined
const getRimEffect = (): SkRuntimeEffect | null => {
  if (cachedRimEffect === undefined) {
    cachedRimEffect = Skia.RuntimeEffect.Make(rimSksl)
    if (!cachedRimEffect) {
      // eslint-disable-next-line no-console
      console.warn('GlassPill: rim refraction shader failed to compile')
    }
  }
  return cachedRimEffect ?? null
}

/**
 * IOS 26 "liquid glass" pill rendered via Skia. Stacked layers:
 *
 * 1. Tinted base (caller's `tint`, typically theme card color).
 * 2. Vertical linear gradient — fakes light falloff across the surface.
 * 3. Top-left radial specular — the classic iOS glass "shine" at the corner.
 * 4. Base hairline rim — provides a baseline contrast edge in the caller's `rim`
 *    color.
 * 5. Procedural rim-refraction shader — paints the chromatic-fringe rim band,
 *    inner catch-light ring, and bottom shadow (see `rimSksl`).
 *
 * Does NOT do backdrop blur — Skia can't reach outside its own surface to blur
 * RN content. Pair this with an `expo-blur` `BlurView` underneath if you want
 * the frosted-through-content effect.
 */
const GlassPill = ({
  width,
  height,
  tint,
  rim,
  tintOpacity = 0.72,
  radius,
  isDark,
}: Props) => {
  const r = radius ?? height / 2

  const highlightStrong = isDark
    ? 'rgba(255,255,255,0.22)'
    : 'rgba(255,255,255,0.55)'
  const highlightSoft = isDark
    ? 'rgba(255,255,255,0.06)'
    : 'rgba(255,255,255,0.18)'
  const shade = isDark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.04)'

  const rimEffect = getRimEffect()
  // Rim band thickness scales with pill size so the effect holds on both a
  // thin pill (the main tab bar) and a near-circular one (the `+` accessory).
  const rimThickness = Math.min(Math.max(r * 0.6, 8), 22)

  return (
    <Canvas
      pointerEvents='none'
      style={[StyleSheet.absoluteFillObject, { borderRadius: r }]}
    >
      {/* Base tint. */}
      <RoundedRect
        x={0}
        y={0}
        width={width}
        height={height}
        r={r}
        color={tint}
        opacity={tintOpacity}
      />

      {/* Vertical body gradient. */}
      <RoundedRect x={0} y={0} width={width} height={height} r={r}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={[highlightSoft, 'rgba(0,0,0,0)', shade]}
          positions={[0, 0.55, 1]}
        />
      </RoundedRect>

      {/* Top-left corner specular. */}
      <RoundedRect x={0} y={0} width={width} height={height} r={r}>
        <RadialGradient
          c={vec(width * 0.18, height * 0.1)}
          r={Math.max(width * 0.45, height * 1.2)}
          colors={[highlightStrong, 'rgba(255,255,255,0)']}
          positions={[0, 1]}
        />
      </RoundedRect>

      {/* Base hairline rim — baseline contrast edge under the shader. */}
      <RoundedRect
        x={0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
        r={Math.max(r - 0.5, 0)}
        color={rim}
        style='stroke'
        strokeWidth={1}
        opacity={0.35}
      />

      {/* Procedural rim refraction — chromatic fringe + inner catch-light +
          bottom shadow. SDF-clipped inside the pill shape. */}
      {rimEffect && (
        <Fill>
          <Shader
            source={rimEffect}
            uniforms={{
              u_resolution: [width, height],
              u_radius: r,
              u_rimThickness: rimThickness,
              u_dark: isDark ? 1.0 : 0.0,
            }}
          />
        </Fill>
      )}
    </Canvas>
  )
}

export default GlassPill
