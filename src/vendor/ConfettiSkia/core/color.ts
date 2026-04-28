const DEG_TO_RAD = Math.PI / 180

function linearToSrgb(x: number): number {
  if (x <= 0.0031308) return 12.92 * x
  return 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export function oklchToRgba(
  lightness: number,
  chroma: number,
  hueDeg: number,
  alpha: number
): Rgba {
  const h = hueDeg * DEG_TO_RAD
  const a = chroma * Math.cos(h)
  const b = chroma * Math.sin(h)

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b

  const l3 = l_ * l_ * l_
  const m3 = m_ * m_ * m_
  const s3 = s_ * s_ * s_

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  return {
    r: clamp01(linearToSrgb(rLin)),
    g: clamp01(linearToSrgb(gLin)),
    b: clamp01(linearToSrgb(bLin)),
    a: clamp01(alpha),
  }
}

export function confettiColor(hueDeg: number, opacityPct: number): Rgba {
  return oklchToRgba(0.85, 0.25, hueDeg, opacityPct / 100)
}
