import type { DigitSystem } from '@/lib/digits'
import { localizeNumeral } from '@/lib/digits'
import {
  dim,
  drawText,
  fillRect,
  mix,
  plot,
  rgb,
  stamp,
  textWidth,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'
import { SIGN_IDS, type SignId } from '@/types/pet'

import { WALL_RGB, wallDarkness, type WallColor } from './wall'

export { SIGN_IDS }
export type { SignId }

export interface SignData {
  readonly monthMinutes: number

  readonly monthGoal: number

  readonly yearBars: readonly number[]

  readonly currentMonthIndex: number

  readonly yearMinutes: number

  readonly sharedMonths: readonly boolean[]

  readonly planDay: number | null

  readonly planMinutes: number | null

  readonly conversations: number

  readonly returnVisits: number

  readonly digits: DigitSystem
}

export const DEMO_SIGN_DATA: SignData = {
  monthMinutes: 870,
  monthGoal: 30,
  yearBars: [38, 41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  currentMonthIndex: 1,
  yearMinutes: 18720,
  sharedMonths: [
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ],
  planDay: 21,
  planMinutes: 150,
  conversations: 8,
  returnVisits: 3,
  digits: 'latn',
}

export const SIGN_BOUNDS = { x0: 134, y0: 12, x1: 160, y1: 38 } as const
const CX = 147

const PAPER = rgb('#f1e3c4')
const WOOD = rgb('#7a4f30')
const INK_BASE = rgb('#4a3424')
const GREEN = rgb('#2f9e5a')
const WHITE = rgb('#ffffff')
const RED = rgb('#c8463c')

const CLOCK = ['.ooooo.', 'o..k..o', 'o..k..o', 'o..kk.o', 'o.....o', '.ooooo.']
const CHECK = ['.....x', '....xx', 'x..xx.', 'xxxx..', '.xx...']
const BUBBLE = ['ooooooo', 'o.k.k.o', 'ooooooo', '.o.....']
const HOUSE = ['...o...', '..ooo..', '.ooooo.', '..o.o..', '..ooo..']

interface Ink {
  readonly paper: Rgb
  readonly frame: Rgb
  readonly ink: Rgb
  readonly green: Rgb
  readonly faint: Rgb
}

function inkFor(wall: Rgb): Ink {
  const paper = mix(PAPER, wall, 0.45 - 0.2 * wallDarkness(wall))
  const ink = mix(INK_BASE, paper, 0.38)
  return {
    paper,
    frame: mix(WOOD, wall, 0.4),
    ink,
    green: mix(GREEN, paper, 0.4),
    faint: mix(ink, paper, 0.62),
  }
}

export function signNumber(value: number | null, digits: DigitSystem): string {
  if (value === null || !Number.isFinite(value)) return '-'
  const text = String(Math.round(value * 10) / 10)
  return digits === 'arab' ? localizeNumeral(text, 'ar') : text
}

function signText(text: string, digits: DigitSystem): string {
  return digits === 'arab' ? localizeNumeral(text, 'ar') : text
}

function signCap(nines: number, digits: DigitSystem): string {
  const n = signText('9'.repeat(nines), digits)
  return digits === 'arab' ? `+${n}` : `${n}+`
}

export function fitSignNumber(
  value: number | null,
  digits: DigitSystem,
  maxWidth: number
): string {
  if (value === null || !Number.isFinite(value)) return '-'

  const plain = Math.abs(value) < 1e15
  const exact = signNumber(value, digits)
  if (plain && textWidth(exact) <= maxWidth) return exact
  const whole = Math.round(value)
  const latn = String(whole)
  const wholeText = signNumber(whole, digits)
  if (plain && textWidth(wholeText) <= maxWidth) return wholeText
  if (whole < 0) return '-'
  for (let nines = plain ? latn.length - 1 : 21; nines > 0; nines--) {
    const capped = signCap(nines, digits)
    if (textWidth(capped) <= maxWidth) return capped
  }
  return signCap(1, digits)
}

export const SIGN_TEXT_WIDTH = SIGN_BOUNDS.x1 - SIGN_BOUNDS.x0 - 4

const PLAN_DAY_WIDTH = 9

const COUNT_SLOT = { x0: 146, width: 12 } as const

interface Painter {
  readonly buf: PixelBuffer
  readonly ink: Ink
  readonly data: SignData

  centered(text: string, y: number, c?: Rgb): void
}

const CONTENT: Readonly<Record<Exclude<SignId, 'none'>, (p: Painter) => void>> =
  {
    month({ buf, ink, data, centered }) {
      stamp(buf, CLOCK, 144, 15, { o: ink.ink, k: ink.ink })
      centered(
        fitSignNumber(data.monthMinutes / 60, data.digits, SIGN_TEXT_WIDTH),
        24
      )
      fillRect(buf, 138, 32, 156, 34, ink.faint)
      const progress =
        data.monthGoal > 0
          ? Math.min(1, Math.max(0, data.monthMinutes / 60 / data.monthGoal))
          : 0
      fillRect(buf, 138, 32, 138 + Math.round(18 * progress), 34, ink.green)
    },
    year({ buf, ink, data, centered }) {
      const max = Math.max(...data.yearBars, 1)
      data.yearBars.slice(0, 12).forEach((v, i) => {
        const x = 136 + i * 2
        const h = Math.max(1, Math.round((v / max) * 7))
        const c =
          i === data.currentMonthIndex ? ink.green : v ? ink.ink : ink.faint
        fillRect(buf, x, 23 - h, x + 1, 23, c)
      })
      centered(
        fitSignNumber(data.yearMinutes / 60, data.digits, SIGN_TEXT_WIDTH),
        27
      )
    },
    shared({ buf, ink, data, centered }) {
      fillRect(buf, 143, 15, 152, 24, ink.ink)
      fillRect(buf, 144, 16, 151, 23, mix(ink.paper, WHITE, 0.5))
      if (data.sharedMonths[data.currentMonthIndex]) {
        stamp(buf, CHECK, 145, 17, { x: ink.green })
      }
      const count = data.sharedMonths.slice(0, 12).filter(Boolean).length
      centered(signText(`${count}/12`, data.digits), 28)
    },
    plan({ buf, ink, data, centered }) {
      fillRect(buf, 142, 14, 153, 25, ink.faint)
      fillRect(buf, 142, 14, 153, 17, mix(RED, ink.paper, 0.35))
      fillRect(buf, 143, 17, 152, 24, mix(ink.paper, WHITE, 0.5))
      centered(fitSignNumber(data.planDay, data.digits, PLAN_DAY_WIDTH), 18)
      centered(
        fitSignNumber(
          data.planMinutes === null ? null : data.planMinutes / 60,
          data.digits,
          SIGN_TEXT_WIDTH
        ),
        29
      )
    },
    convos({ buf, ink, data }) {
      const count = (value: number, y: number) => {
        const text = fitSignNumber(value, data.digits, COUNT_SLOT.width)
        const x =
          COUNT_SLOT.x0 + Math.floor((COUNT_SLOT.width - textWidth(text)) / 2)
        drawText(buf, text, x, y, ink.ink)
      }
      stamp(buf, BUBBLE, 138, 16, { o: ink.ink, k: ink.ink })
      count(data.conversations, 16)
      stamp(buf, HOUSE, 138, 26, { o: ink.ink })
      count(data.returnVisits, 26)
    },
  }

export function drawSign(
  buf: PixelBuffer,
  sign: SignId,
  data: SignData,
  wall: WallColor
): void {
  if (sign === 'none') return
  const ink = inkFor(WALL_RGB[wall])
  const { x0, y0, x1, y1 } = SIGN_BOUNDS
  plot(buf, CX, 8, ink.frame)
  for (let i = 0; i <= 9; i++) {
    plot(buf, CX - i, 8 + (i * 4) / 9, ink.faint)
    plot(buf, CX + i, 8 + (i * 4) / 9, ink.faint)
  }
  fillRect(buf, x0, y0, x1, y1, ink.frame)
  fillRect(buf, x0 + 1, y0 + 1, x1 - 1, y1 - 1, ink.paper)
  fillRect(buf, x0 + 1, y1 - 2, x1 - 1, y1 - 1, dim(ink.paper, 0.95))
  CONTENT[sign]({
    buf,
    ink,
    data,
    centered: (text, y, c = ink.ink) =>
      drawText(buf, text, CX - Math.floor(textWidth(text) / 2), y, c),
  })
}
