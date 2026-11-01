import {
  createRng,
  fillEllipse,
  fillRect,
  mix,
  plot,
  readRgb,
  rgb,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'
import { SEASONS, TIMES_OF_DAY, type Season, type TimeOfDay } from '@/types/pet'

export { SEASONS, TIMES_OF_DAY }
export type { Season, TimeOfDay }

export const WINDOW_GLASS = { x0: 16, y0: 10, x1: 58, y1: 44 } as const

export function isWindowGlass(x: number, y: number): boolean {
  return (
    x >= WINDOW_GLASS.x0 &&
    x < WINDOW_GLASS.x1 &&
    y >= WINDOW_GLASS.y0 &&
    y < WINDOW_GLASS.y1
  )
}

export function isWindowPane(x: number, y: number): boolean {
  return isWindowGlass(x, y) && !(x >= 36 && x < 38) && !(y >= 26 && y < 28)
}

const hexes = (list: readonly string[]): Rgb[] => list.map(rgb)

const SKY: Readonly<Record<TimeOfDay, readonly Rgb[]>> = {
  night: hexes(['#1d2550', '#232d5e', '#2a376b', '#33437a', '#3d5089']),
  dawn: hexes(['#4a5a9a', '#8a6aa0', '#d9839a', '#f2a985', '#f8cf96']),
  day: hexes(['#5aa8e6', '#6fb6ea', '#86c4ef', '#9fd2f3', '#b8def6']),
  dusk: hexes(['#2f2a66', '#5a3a7a', '#a64d7a', '#e0705e', '#f4a35a']),
}

const TINT: Readonly<Record<TimeOfDay, readonly [Rgb, number]>> = {
  night: [rgb('#141a33'), 0.62],
  dusk: [rgb('#5a2a50'), 0.32],
  dawn: [rgb('#6a4a7a'), 0.25],
  day: [rgb('#ffffff'), 0],
}

const HILLS: Readonly<Record<Season, readonly [Rgb, Rgb]>> = {
  spring: [rgb('#5fae55'), rgb('#7cc463')],
  summer: [rgb('#3d8a43'), rgb('#55a64b')],
  autumn: [rgb('#b8742f'), rgb('#d39a3e')],
  winter: [rgb('#c9d6e4'), rgb('#eef4f9')],
}

const RAINBOW = hexes([
  '#e8574a',
  '#f2994a',
  '#f2d14a',
  '#6cc160',
  '#4a9be0',
  '#8a63d2',
])
const STARS: readonly (readonly [number, number])[] = [
  [20, 13],
  [27, 18],
  [31, 12],
  [44, 14],
  [23, 24],
  [53, 23],
  [40, 21],
  [50, 12],
]
const C = {
  frame: rgb('#7a4f30'),
  sill: rgb('#8a5a3a'),
  sillShadow: rgb('#6e4529'),
  star: rgb('#fff4c8'),
  moon: rgb('#fff1c0'),
  sun: rgb('#fff4b0'),
  cloud: rgb('#ffffff'),
  cloudFar: rgb('#f4fbff'),
  dawnSun: rgb('#ffe39a'),
  duskSun: rgb('#ffb15a'),
  white: rgb('#ffffff'),
  pink: rgb('#ffd6e8'),
  yellow: rgb('#ffe066'),
  trunk: rgb('#6b4a2c'),
  summerLeaves: rgb('#2f7438'),
  autumnLeaves: rgb('#d8642a'),
  leafA: rgb('#e08a3a'),
  leafB: rgb('#c8502a'),
  winterTrunk: rgb('#5a4a3c'),
  pine: rgb('#3e6b55'),
}

export interface WindowOptions {
  readonly time: TimeOfDay
  readonly season: Season

  readonly rainbow?: boolean
}

function drawSky(buf: PixelBuffer, time: TimeOfDay): void {
  const sky = SKY[time]
  fillRect(buf, 14, 8, 60, 46, C.frame)
  for (let y = 10; y < 44; y++) {
    fillRect(buf, 16, y, 58, y + 1, sky[Math.min(4, Math.floor((y - 10) / 7))])
  }
  if (time === 'night') {
    for (const [x, y] of STARS) plot(buf, x, y, C.star)
    fillEllipse(buf, 48, 17, 3.6, 3.6, C.moon)
    fillEllipse(buf, 49.5, 16, 3, 3, sky[1])
  }
  if (time === 'day') {
    fillEllipse(buf, 51, 15, 3.4, 3.4, C.sun)
    fillEllipse(buf, 24, 16, 4, 1.8, C.cloud)
    fillEllipse(buf, 28, 15, 3, 2, C.cloud)
    fillEllipse(buf, 44, 22, 3.5, 1.5, C.cloudFar)
  }
  if (time === 'dawn') fillEllipse(buf, 25, 35, 4.5, 4.5, C.dawnSun)
  if (time === 'dusk') fillEllipse(buf, 48, 34, 5, 5, C.duskSun)
}

function drawRainbow(buf: PixelBuffer, tint: (c: Rgb) => Rgb): void {
  for (let y = 10; y < 44; y++) {
    for (let x = 16; x < 58; x++) {
      const band = Math.floor(23 - Math.hypot(x + 0.5 - 37, y + 0.5 - 46))
      if (band >= 0 && band < 6) {
        plot(buf, x, y, tint(mix(RAINBOW[band], readRgb(buf, x, y), 0.3)))
      }
    }
  }
}

function drawLandscape(
  buf: PixelBuffer,
  season: Season,
  tint: (c: Rgb) => Rgb
): void {
  const [back, front] = HILLS[season]
  for (let x = 16; x < 58; x++) {
    fillRect(
      buf,
      x,
      34 + Math.round(Math.sin(x / 6) * 2),
      x + 1,
      44,
      tint(back)
    )
    fillRect(
      buf,
      x,
      39 + Math.round(Math.sin(x / 4 + 1) * 1.5),
      x + 1,
      44,
      tint(front)
    )
  }
  if (season === 'spring') {
    const flowers: readonly (readonly [number, number, Rgb])[] = [
      [19, 41, C.pink],
      [24, 40, C.white],
      [30, 42, C.yellow],
      [45, 41, C.pink],
      [52, 40, C.white],
      [40, 42, C.yellow],
    ]
    for (const [x, y, c] of flowers) plot(buf, x, y, tint(c))
  }
  if (season === 'summer') {
    fillRect(buf, 51, 32, 52, 40, tint(C.trunk))
    fillEllipse(buf, 51.5, 30, 3.5, 3.4, tint(C.summerLeaves))
  }
  if (season === 'autumn') {
    fillRect(buf, 51, 32, 52, 40, tint(C.trunk))
    fillEllipse(buf, 51.5, 30, 3.5, 3.4, tint(C.autumnLeaves))
    plot(buf, 47, 38, tint(C.leafA))
    plot(buf, 55, 41, tint(C.leafB))
  }
  if (season === 'winter') {
    const r = createRng(11)
    for (let i = 0; i < 22; i++)
      plot(buf, 16 + r() * 42, 10 + r() * 24, C.white)
    fillRect(buf, 51, 33, 52, 40, tint(C.winterTrunk))
    fillEllipse(buf, 51.5, 31.5, 3, 3, tint(C.pine))
    plot(buf, 50, 30, tint(C.white))
    plot(buf, 53, 32, tint(C.white))
  }
}

export function drawWindow(buf: PixelBuffer, o: WindowOptions): void {
  const [tintColor, tintStrength] = TINT[o.time]
  const tint = (c: Rgb) => mix(c, tintColor, tintStrength)
  drawSky(buf, o.time)
  if (o.rainbow) drawRainbow(buf, tint)
  drawLandscape(buf, o.season, tint)
  fillRect(buf, 36, 10, 38, 44, C.frame)
  fillRect(buf, 16, 26, 58, 28, C.frame)
  fillRect(buf, 12, 44, 62, 47, C.sill)
  fillRect(buf, 12, 47, 62, 48, C.sillShadow)
}
