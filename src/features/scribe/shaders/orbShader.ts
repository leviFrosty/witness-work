import { Skia } from '@shopify/react-native-skia'

/**
 * The Scribe AI orb in one pass: a shaded sphere with slowly flowing light
 * inside, a liquid edge that wobbles more as the User speaks, a two-layer aura
 * (tight bloom plus wide haze), and an organizing ring with a rotating
 * highlight. Output is premultiplied, so it composites over any background,
 * light or dark.
 *
 * Uniforms (canvas points):
 *
 * - `uSize` — canvas size. The aura fades out before the canvas edge.
 * - `uTime` — seconds. Held still while paused.
 * - `uFlow` — the inner flow's phase, integrated on the UI thread so its speed
 *   can follow the voice without the pattern jumping.
 * - `uLevel` — 0–1 smoothed voice loudness.
 * - `uLoad` — 0–1 the loading spinner.
 * - `uPop` — 0–1 the ready dot replacing the spinner.
 * - `uGrow` — the dot springing open: 0 dot, 1 full size (overshoots).
 * - `uProc` — 0–1 blend into the organizing state (smaller orb, ring).
 * - `uMute` — 0–1 desaturates and dims (offline/disabled).
 * - `uCore` — core radius as a fraction of the canvas (0.27 leaves room for the
 *   aura).
 * - `uA` accent, `uB` second hue, `uC` deep shade, `uD` highlight (RGB 0–1).
 */
const source = `
uniform float2 uSize;
uniform float uTime;
uniform float uFlow;
uniform float uLevel;
uniform float uLoad;
uniform float uPop;
uniform float uGrow;
uniform float uProc;
uniform float uMute;
uniform float uCore;
uniform float3 uA;
uniform float3 uB;
uniform float3 uC;
uniform float3 uD;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + float2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

half4 main(float2 xy) {
  float s = min(uSize.x, uSize.y);
  float2 c = uSize * 0.5;
  float2 d = xy - c;
  float r = length(d);
  float t = uTime;
  float lvl = uLevel * (1.0 - uProc);
  float2 dir = d / max(r, 0.001);
  float ang = atan(d.y, d.x);

  // Size: idle breathing on a ~4 s sine, a small rise with the voice, and a
  // contraction while organizing. The ready dot pops in at the spinner's size
  // and springs open.
  float R0 = s * uCore;
  float breathe = 0.03 * sin(t * 1.5708);
  float opened = clamp(uGrow, 0.0, 1.0);
  float dotR = 0.13 * mix(0.55, 1.0, uPop);
  float R = R0 * (1.0 + breathe + 0.14 * lvl) * (1.0 - 0.36 * uProc) * mix(dotR, 1.0, uGrow);

  // Liquid edge, seamless around the circle; calm when quiet.
  float wob = (sin(3.0 * ang + t * 1.7) * 0.6 + sin(5.0 * ang - t * 2.3) * 0.4) * (0.005 + 0.012 * lvl);
  wob += (noise(dir * 1.6 + float2(t * 0.6, -t * 0.45)) - 0.5) * (0.012 + 0.026 * lvl);
  wob *= opened;
  float Re = R * (1.0 + wob * (1.0 - uProc));

  // ---- Aura: a tight bloom hugging the edge plus a wide haze.
  float out0 = max(r - Re, 0.0);
  float bloom = exp(-out0 / (R * (0.10 + 0.08 * lvl)));
  float haze = exp(-out0 / (R * (0.45 + 0.45 * lvl)));
  float lobe = 0.7 + 0.3 * sin(ang * 2.0 + t * 0.6);
  float edgeFade = smoothstep(s * 0.5, s * 0.36, r);
  float auraA = (bloom * 0.55 + haze * (0.28 + 0.32 * lvl)) * lobe * edgeFade;
  auraA *= (0.75 + 0.45 * lvl) * (1.0 - 0.45 * uProc) * uPop * smoothstep(0.05, 1.0, opened);
  float3 auraCol = mix(uA, uB, 0.5 + 0.5 * sin(ang + t * 0.4));
  auraCol = mix(auraCol, uD, bloom * 0.25);

  // ---- Core: domain-warped flow on a shaded sphere.
  float2 p = d / max(Re, 1.0);
  float rr = clamp(dot(p, p), 0.0, 1.0);
  float z = sqrt(1.0 - rr);
  float tt = uFlow;
  float2 q = p * 0.8;
  float2 w = float2(fbm(q + float2(tt, -tt * 0.7)), fbm(q + float2(-tt * 0.6, tt) + 5.2));
  float n = fbm(q * 1.1 + w * 1.5 + float2(t * 0.07, 0.0));
  float3 core = mix(mix(uC, uA, 0.55), uA, smoothstep(0.22, 0.78, n));
  core = mix(core, uB, smoothstep(0.38, 0.85, w.x) * 0.6);
  // Soft folds of light where the flow turns: silk, not clouds.
  float silk = 1.0 - clamp(abs(n - 0.52) * 6.0, 0.0, 1.0);
  core = mix(core, uD, silk * silk * 0.5);
  // A gentle wash of light from the top-left.
  float wash = smoothstep(0.9, -0.7, dot(p, float2(0.6, 0.8)));
  core = mix(core, uD, wash * 0.16);
  float3 nrm = float3(p, z);
  float diff = clamp(dot(nrm, normalize(float3(-0.45, -0.6, 0.65))), 0.0, 1.0);
  core *= 0.7 + 0.42 * diff;
  float spec = pow(clamp(dot(nrm, normalize(float3(-0.35, -0.55, 0.76))), 0.0, 1.0), 30.0);
  core += uD * spec * 0.4;
  float rim = pow(1.0 - z, 2.2);
  core += mix(uA, uD, 0.5) * rim * (0.7 + 0.5 * lvl);
  core *= 0.95 + 0.25 * lvl;
  // The dot is bright, and settles into the orb's colors as it opens.
  core = mix(core, mix(uA, uD, 0.7), (1.0 - opened) * 0.8);
  float inside = smoothstep(Re + 1.0, Re - 1.0, r) * uPop;

  // ---- Organizing ring: a comet of light circling the contracted orb.
  float ringR = R * 1.42;
  float ringW = max(R * 0.045, 1.2);
  float rd = (r - ringR) / ringW;
  float ring = exp(-rd * rd);
  // Screen y points down, so a growing angle runs clockwise: subtracting time
  // moves the head (sweep near 1) clockwise, with its tail behind it.
  float sweep = fract(ang / 6.2831853 - t * 0.55);
  // Bright head that fades in over a few degrees, so the comet has no seam.
  float comet = sweep * sweep * sweep * smoothstep(1.0, 0.96, sweep);
  float ringA = uProc * ring * (0.16 + 0.84 * comet);
  float ringGlow = uProc * exp(-abs(r - ringR) / (R * 0.18)) * comet * 0.35 * edgeFade;

  float3 col = core * inside;
  float a = inside;
  float outsideA = auraA * (1.0 - inside);
  col += auraCol * outsideA;
  a += outsideA;
  float ra = clamp(ringA + ringGlow, 0.0, 1.0) * (1.0 - inside);
  col += mix(uA, uD, comet) * ra;
  a = clamp(a + ra, 0.0, 1.0);

  // ---- Loading: a small arc turning clockwise, its tail fading.
  float spinR = R0 * 0.15;
  float spinW = max(R0 * 0.032, 1.4);
  float stroke = clamp(spinW * 0.5 - abs(r - spinR) + 0.5, 0.0, 1.0);
  float lead = fract(ang / 6.2831853 - t * 1.25);
  float arc = smoothstep(0.62, 0.97, lead) * smoothstep(1.0, 0.985, lead);
  float sa = uLoad * (1.0 - uPop) * stroke * arc * (1.0 - inside);
  // Mostly accent: the highlight would wash out on a light sheet.
  col += mix(uA, uD, 0.12) * sa;
  a = clamp(a + sa, 0.0, 1.0);

  float g = dot(col, float3(0.299, 0.587, 0.114));
  col = mix(col, float3(g), uMute * 0.9);
  col *= 1.0 - 0.3 * uMute;
  a *= 1.0 - 0.25 * uMute;

  col += (hash(xy + fract(t) * 61.0) - 0.5) * (1.5 / 255.0) * a;
  return half4(half3(col), half(a));
}
`

/** `null` if the shader failed to compile. */
export const orbShader = Skia.RuntimeEffect.Make(source)
