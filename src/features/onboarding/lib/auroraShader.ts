import { Skia } from '@shopify/react-native-skia'

/**
 * A slow, living aurora: soft light pools that drift on Lissajous paths over a
 * base colour, with a brighter bloom pinned to a focal point, optional drifting
 * dust motes, a vignette and per-frame dithering (long dark gradients band
 * badly on 8-bit panels without it).
 *
 * Uniforms (all coordinates in canvas points):
 *
 * - `uSize` — canvas size.
 * - `uTime` — seconds; drives every drift. Hold it still for Reduce Motion.
 * - `uIntensity` — 0–1, fades the light pools in over the base.
 * - `uFocus` / `uPulse` — focal point of the main bloom and its extra strength.
 * - `uShift` — parallax offset applied to the light pools.
 * - `uDark` — 1 adds light onto a dark base; 0 tints a light base instead.
 * - `uBase`, `uGlow`, `uTintA`, `uTintB`, `uFloor` — RGB 0–1 colours.
 * - `uMotes` — 0–1 visibility of the drifting dust.
 */
const source = `
uniform float2 uSize;
uniform float uTime;
uniform float uIntensity;
uniform float2 uFocus;
uniform float uPulse;
uniform float2 uShift;
uniform float uDark;
uniform float3 uBase;
uniform float3 uGlow;
uniform float3 uTintA;
uniform float3 uTintB;
uniform float3 uFloor;
uniform float uMotes;

float pool(float2 p, float2 c, float r) {
  float2 d = (p - c) / r;
  return exp(-dot(d, d));
}

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float motes(float2 xy, float s) {
  float cell = s * 0.12;
  float2 q = xy / cell + float2(0.0, uTime * 0.06);
  float2 id = floor(q);
  float h = hash(id);
  if (h > 0.42) {
    return 0.0;
  }
  float2 offset = (float2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6;
  float d = length(fract(q) - 0.5 - offset);
  float r = mix(0.018, 0.045, hash(id + 1.3));
  float twinkle = 0.5 + 0.5 * sin(uTime * (0.6 + h * 2.2) + h * 40.0);
  return (1.0 - smoothstep(0.0, r, d)) * twinkle;
}

half4 main(float2 xy) {
  float s = min(uSize.x, uSize.y);
  float t = uTime;
  float2 p = xy + uShift;
  // A gentle domain warp keeps the pools' edges organic instead of circular.
  p += float2(sin(p.y / s * 2.8 + t * 0.32), cos(p.x / s * 2.4 - t * 0.27)) * s * 0.04;

  float2 cGlow = uFocus + float2(sin(t * 0.21), cos(t * 0.17)) * s * 0.05;
  float2 cA = float2(uSize.x, uSize.y * 0.1) + float2(cos(t * 0.13), sin(t * 0.19)) * s * 0.14;
  float2 cB = float2(0.0, uSize.y * 0.5) + float2(sin(t * 0.11), cos(t * 0.15)) * s * 0.16;
  float2 cF = float2(uSize.x * 0.55, uSize.y * 1.06) + float2(cos(t * 0.09), 0.0) * s * 0.25;

  float g = pool(p, cGlow, s * 0.58) * (0.8 + 0.3 * uPulse);
  float core = pool(xy, uFocus, s * 0.2) * uPulse;
  float a = pool(p, cA, s * 0.62);
  float b = pool(p, cB, s * 0.62);
  float f = pool(p, cF, s * 0.85);
  float dust = motes(xy, s) * uMotes;

  float3 col = uBase;
  if (uDark > 0.5) {
    col += (uGlow * (g * 0.42 + core * 0.3) + uTintA * a * 0.24 + uTintB * b * 0.22 + uFloor * f * 0.32) * uIntensity;
    col += float3(dust * 0.3);
    float2 v = (xy - uSize * 0.5) / uSize.y;
    col *= 1.0 - dot(v, v) * 0.6;
  } else {
    col = mix(col, uGlow, clamp((g * 0.34 + core * 0.22) * uIntensity, 0.0, 1.0));
    col = mix(col, uTintA, a * 0.26 * uIntensity);
    col = mix(col, uTintB, b * 0.22 * uIntensity);
    col = mix(col, uFloor, f * 0.35 * uIntensity);
    col = mix(col, uGlow, dust * 0.22);
  }
  col += (hash(xy + fract(t) * 61.0) - 0.5) * (1.5 / 255.0);
  return half4(half3(col), 1.0);
}
`

/** `null` if the shader failed to compile — callers fall back to `uBase`. */
export const auroraShader = Skia.RuntimeEffect.Make(source)
