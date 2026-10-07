/**
 * Badge illustrations as plain data, one per `BadgeArtId`. Dependency-free
 * (type imports only) so React Native and `scripts/badges/preview-badges.mjs`
 * render the same source.
 *
 * Coordinates live in a 64-unit box. Paths use absolute commands only (M L H V
 * C Q A Z). Renderers apply round caps and joins. Colors are roles that each
 * palette maps to its level's ink, metal and face colors.
 */
import type { BadgeArtId } from '@/types/badges'

export type EmblemRole = 'ink' | 'metal' | 'metalDeep' | 'face'

type PartStyle = {
  fill?: EmblemRole
  stroke?: EmblemRole
  strokeWidth?: number
  opacity?: number
}

export type EmblemPart =
  | ({ type: 'path'; d: string } & PartStyle)
  | ({ type: 'circle'; cx: number; cy: number; r: number } & PartStyle)

export const EMBLEM_BOX = 64

/** Main line weight (mirrors `EMBLEM_STROKE` in medallion.ts). */
const S = 4
/** Lighter weight for small interior details. */
const D = 3

const line = (d: string, strokeWidth = S, stroke: EmblemRole = 'ink') =>
  ({ type: 'path', d, stroke, strokeWidth }) satisfies EmblemPart

const shape = (d: string, fill: EmblemRole, strokeWidth = S) =>
  ({ type: 'path', d, fill, stroke: 'ink', strokeWidth }) satisfies EmblemPart

const fill = (d: string, role: EmblemRole) =>
  ({ type: 'path', d, fill: role }) satisfies EmblemPart

const dot = (cx: number, cy: number, r: number, role: EmblemRole = 'ink') =>
  ({ type: 'circle', cx, cy, r, fill: role }) satisfies EmblemPart

const r2 = (n: number) => Math.round(n * 100) / 100

type Placement = {
  /** Degrees, clockwise, around (cx, cy). */
  rotate?: number
  scale?: number
  cx?: number
  cy?: number
  dx?: number
  dy?: number
}

/**
 * Moves a part drawn in its own frame into place (rotate and scale around `cx,
 * cy`, then translate). Lets tilted objects be authored level.
 */
const place = (t: Placement) => {
  const rad = ((t.rotate ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const s = t.scale ?? 1
  const cx = t.cx ?? 0
  const cy = t.cy ?? 0
  const dx = t.dx ?? 0
  const dy = t.dy ?? 0
  const pt = (x: number, y: number) => {
    const px = (x - cx) * s
    const py = (y - cy) * s
    return `${r2(cx + px * cos - py * sin + dx)},${r2(cy + px * sin + py * cos + dy)}`
  }
  const path = (d: string) => {
    const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? []
    const out: string[] = []
    let cmd = ''
    let x = 0
    let y = 0
    let i = 0
    const n = () => Number(tokens[i++])
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) {
        cmd = tokens[i++]
        if (cmd === 'Z') {
          out.push('Z')
          continue
        }
      }
      switch (cmd) {
        case 'M':
        case 'L':
          x = n()
          y = n()
          out.push(`${cmd}${pt(x, y)}`)
          if (cmd === 'M') cmd = 'L'
          break
        case 'H':
          x = n()
          out.push(`L${pt(x, y)}`)
          break
        case 'V':
          y = n()
          out.push(`L${pt(x, y)}`)
          break
        case 'C': {
          const a = pt(n(), n())
          const b = pt(n(), n())
          x = n()
          y = n()
          out.push(`C${a} ${b} ${pt(x, y)}`)
          break
        }
        case 'Q': {
          const a = pt(n(), n())
          x = n()
          y = n()
          out.push(`Q${a} ${pt(x, y)}`)
          break
        }
        case 'A': {
          const rx = n() * s
          const ry = n() * s
          const rot = n() + (t.rotate ?? 0)
          const large = n()
          const sweep = n()
          x = n()
          y = n()
          out.push(
            `A${r2(rx)},${r2(ry)} ${r2(rot)} ${large} ${sweep} ${pt(x, y)}`
          )
          break
        }
        default:
          throw new Error(`Unsupported path command: ${cmd}`)
      }
    }
    return out.join(' ')
  }
  const part = (p: EmblemPart): EmblemPart => {
    if (p.type === 'path') return { ...p, d: path(p.d) }
    const [px, py] = pt(p.cx, p.cy).split(',').map(Number)
    return { ...p, cx: px, cy: py, r: r2(p.r * s) }
  }
  return (parts: EmblemPart[]) => parts.map(part)
}

/** A small falling droplet, point up, centered on its round end. */
const drop = (
  x: number,
  y: number,
  r: number,
  role: EmblemRole = 'metalDeep'
) =>
  fill(
    `M${x},${r2(y - r * 2.1)} C${r2(x + r * 0.5)},${r2(y - r * 1.2)} ${r2(x + r)},${r2(y - r * 0.6)} ${r2(x + r)},${y} A${r},${r} 0 0 1 ${r2(x - r)},${y} C${r2(x - r)},${r2(y - r * 0.6)} ${r2(x - r * 0.5)},${r2(y - r * 1.2)} ${x},${r2(y - r * 2.1)} Z`,
    role
  )

/** A rounded rectangle from (x1, y1) to (x2, y2). */
const roundRect = (x1: number, y1: number, x2: number, y2: number, r: number) =>
  `M${x1 + r},${y1} H${x2 - r} A${r},${r} 0 0 1 ${x2},${y1 + r} V${y2 - r} A${r},${r} 0 0 1 ${x2 - r},${y2} H${x1 + r} A${r},${r} 0 0 1 ${x1},${y2 - r} V${y1 + r} A${r},${r} 0 0 1 ${x1 + r},${y1} Z`

// --- Sharing the Good News: calendar page with a hand-drawn check ---------
const CAL_PAGE =
  'M12,22 A6,6 0 0 1 18,16 H46 A6,6 0 0 1 52,22 V48 A6,6 0 0 1 46,54 H18 A6,6 0 0 1 12,48 Z'
const monthsShared: EmblemPart[] = [
  fill(CAL_PAGE, 'face'),
  fill('M12,28 V22 A6,6 0 0 1 18,16 H46 A6,6 0 0 1 52,22 V28 Z', 'metal'),
  line('M12,28 H52', D),
  line(CAL_PAGE),
  line('M23,10.5 V20'),
  line('M41,10.5 V20'),
  line(
    'M21,40.5 C23.6,42.4 25.6,44.4 28,47.5 C31.6,40.4 36.8,34.6 44,30.5',
    5,
    'metalDeep'
  ),
]

// --- Year Round: sunrise under an arc of twelve months ---------------------
const yearRound: EmblemPart[] = place({ dy: -2 })([
  ...Array.from({ length: 12 }, (_, i) => {
    const a = Math.PI - (i * Math.PI) / 11
    return dot(
      r2(32 + 24.5 * Math.cos(a)),
      r2(43 - 24.5 * Math.sin(a)),
      2.4,
      'metalDeep'
    )
  }),
  shape('M20.5,43 A11.5,11.5 0 0 1 43.5,43 Z', 'metal'),
  line('M13.5,43 H50.5'),
  line('M23,50.5 H41', D),
])

// --- Reports Sent: open envelope with a report sheet ----------------------
const reportSent: EmblemPart[] = place({ dy: -1 })([
  shape('M8,33 H46 V51 A3,3 0 0 1 43,54 H11 A3,3 0 0 1 8,51 Z', 'metalDeep'),
  shape('M8,33 L27,18 L46,33 Z', 'metal'),
  shape(
    'M17,15 A2.5,2.5 0 0 1 19.5,12.5 H34.5 A2.5,2.5 0 0 1 37,15 V44 H17 Z',
    'face'
  ),
  line('M21.5,19.5 H32.5', D),
  line('M21.5,25 H32.5', D),
  shape('M21,29.5 H25.5 V34 H21 Z', 'metalDeep', 2.5),
  line('M29,31.75 H32.5', D),
  shape(
    'M8,33 L27,46 L46,33 V51 A3,3 0 0 1 43,54 H11 A3,3 0 0 1 8,51 Z',
    'metal'
  ),
  line('M50.5,37 H57', D),
  line('M52.5,44 H57', D),
])

// --- Ready to Go: a packed field-service bag ------------------------------
// A satchel at a slight angle (side panel on the right), books standing up
// out of it, a carry handle, and a metal clasp on the front flap.
const prepared: EmblemPart[] = place({ dx: -0.5, dy: -2.5 })([
  line('M31.5,27 C31.5,14.5 48,14.5 48,27'),
  ...place({ rotate: -9, cx: 16, cy: 27 })([
    shape(roundRect(11, 17, 19.5, 30, 1.5), 'face', D),
  ]),
  ...place({ rotate: 4, cx: 24, cy: 27 })([
    shape(roundRect(19.5, 20, 27, 30, 1.5), 'metalDeep', D),
  ]),
  shape(
    'M51,28.5 L55.5,26 A1.5,1.5 0 0 1 57.5,27.3 V48.5 A2,2 0 0 1 56.5,50.3 L51,53 Z',
    'metalDeep',
    3.5
  ),
  shape(roundRect(7, 26, 51, 53, 6), 'metal'),
  shape(
    'M7,32 A6,6 0 0 1 13,26 H45 A6,6 0 0 1 51,32 V34.5 A8,8 0 0 1 43,42.5 H15 A8,8 0 0 1 7,34.5 Z',
    'face'
  ),
  shape(roundRect(25.5, 38.5, 32.5, 46.5, 2), 'metal', D),
])

// --- Kind Words: two overlapping speech bubbles ---------------------------
const conversations: EmblemPart[] = [
  shape(
    'M16,11 H30 A8,8 0 0 1 38,19 V25 A8,8 0 0 1 30,33 H22 L13,39.5 L14.5,32.4 A8,8 0 0 1 8,25 V19 A8,8 0 0 1 16,11 Z',
    'metal'
  ),
  shape(
    'M31,24 H47 A9,9 0 0 1 56,33 V39 A9,9 0 0 1 49.5,47.6 L51,54 L42,48 H31 A9,9 0 0 1 22,39 V33 A9,9 0 0 1 31,24 Z',
    'face'
  ),
  dot(31, 36, 2.8),
  dot(39, 36, 2.8),
  dot(47, 36, 2.8),
]

// --- Return Visits: watering can pouring onto a sprout (1 Cor 3:6) --------
const CAN = place({
  rotate: 30,
  cx: 20,
  cy: 33.5,
  dx: 0.5,
  dy: -11.5,
  scale: 0.9,
})
const returnVisits: EmblemPart[] = place({ dy: 1.5 })([
  ...CAN([
    line('M12,24 C12,16.5 24,16.5 24,24'),
    line('M32,38 L45,29.5', 4.5),
    shape(
      'M11,24 H29 A3,3 0 0 1 32,27 V40 A3,3 0 0 1 29,43 H11 A3,3 0 0 1 8,40 V27 A3,3 0 0 1 11,24 Z',
      'metal'
    ),
    line('M44.25,26.12 L47.75,31.48', 4.5),
  ]),
  drop(48, 30.5, 1.9),
  drop(52.5, 34, 1.9),
  drop(47.5, 37, 1.9),
  shape('M37.5,56 Q47.5,48.5 57.5,56 Z', 'metalDeep', D),
  line('M47.5,52 V46.5', D),
  shape(
    'M47.5,48.5 C44.5,48.5 41.5,46.5 41,42.5 C44.5,42.5 47.5,45 47.5,48.5 Z',
    'metal',
    D
  ),
  shape(
    'M47.5,46.5 C47.5,42.5 50.5,40 54.5,40 C54.5,44 51.5,46.5 47.5,46.5 Z',
    'metal',
    D
  ),
])

// --- Next Time: notepad with a pencil ------------------------------------
const PENCIL = place({ rotate: -45, dx: 42.5, dy: 41 })
const nextTime: EmblemPart[] = place({ dx: 1 })([
  shape('M9,19 H39 V50 A3,3 0 0 1 36,53 H12 A3,3 0 0 1 9,50 Z', 'face'),
  shape('M7,14 A3,3 0 0 1 10,11 H38 A3,3 0 0 1 41,14 V19 H7 Z', 'metal'),
  line('M15,28 H33', D),
  line('M15,35 H33', D),
  line('M15,42 H26', D),
  ...PENCIL([
    shape('M-16,0 L-9,-4.2 V4.2 Z', 'face', 3.5),
    fill('M-16,0 L-12.6,-2 V2 Z', 'ink'),
    shape('M-9,-4.2 H9 V4.2 H-9 Z', 'metal', 3.5),
    shape('M9,-4.2 H12 V4.2 H9 Z', 'face', 3.5),
    shape('M12,-4.2 H13.5 A4.2,4.2 0 0 1 13.5,4.2 H12 Z', 'metalDeep', 3.5),
  ]),
])

// --- Keeping in Touch: a mug and a teacup, steam intertwined -------------
const keepingInTouch: EmblemPart[] = [
  line(
    'M20,25.5 C18.5,21.5 22.5,19.5 22,15.5 C21.7,12.5 24,10.5 27,10.5 C30.5,10.5 33,12.5 34.5,15.5',
    3.5,
    'metalDeep'
  ),
  line(
    'M44,30.5 C45.5,26.5 41.5,24.5 42,20.5 C42.3,17.5 40.5,15.5 37.5,15 C34.5,14.6 31.5,16 30,18.5',
    3.5,
    'metalDeep'
  ),
  line('M12,33 C5.5,33 5.5,43 12,43', 3.5),
  fill('M12,29 H28 V44 A5,5 0 0 1 23,49 H17 A5,5 0 0 1 12,44 Z', 'face'),
  fill('M12,35 H28 V39 H12 Z', 'metal'),
  line('M12,29 H28 V44 A5,5 0 0 1 23,49 H17 A5,5 0 0 1 12,44 Z'),
  line('M53.4,38.5 C58.5,38 59,44.5 52,45', 3.5),
  shape('M34,35 H54 C54,43 50,49 44,49 C38,49 34,43 34,35 Z', 'metal'),
  shape(
    'M7,49 H57 C55,52.6 51.5,54.5 47,54.5 H17 C12.5,54.5 9,52.6 7,49 Z',
    'face',
    3.5
  ),
]

// --- Two by Two: two people walking out together (Luke 10:1) -------------
const together: EmblemPart[] = place({ dx: -1, dy: -2.5 })([
  // The path ahead, narrowing as it curves away.
  fill(
    'M8,50 C30,50 46.5,46 55.6,35.6 A1.7,1.7 0 0 1 58.5,37.3 C49,52 28,57.5 8,57.5 A3.75,3.75 0 0 1 8,50 Z',
    'metal'
  ),
  // The companion, carrying a bag.
  line('M36.5,40.5 L33,50'),
  line('M39.5,40.5 L43.5,49.5'),
  shape(
    'M32,41.5 C31.5,35.5 32,30 35.5,28.5 C39,27 43,29 43.5,32.5 C44,35.5 43.5,38.5 42.5,41.5 Z',
    'face'
  ),
  dot(38, 18.5, 5.6),
  line('M45.5,37 C45.5,34.2 49.5,34.2 49.5,37', D),
  shape(
    'M43.5,37.5 H51.5 A1.5,1.5 0 0 1 53,39 V42.5 A1.5,1.5 0 0 1 51.5,44 H45 A1.5,1.5 0 0 1 43.5,42.5 Z',
    'metalDeep',
    3.5
  ),
  // The nearer walker.
  line('M20.5,40.5 L16.5,51'),
  line('M23.5,40.5 L27.5,51'),
  shape(
    'M15.5,41.5 C15,35.5 15.5,29.5 19.5,28 C23.5,26.5 27.5,28.5 28,32.5 C28.5,35.5 28,38.5 27,41.5 Z',
    'metal'
  ),
  dot(22, 18, 5.8),
])

// --- First Bible Study: open book with a sprig ---------------------------
const firstBibleStudy: EmblemPart[] = place({})([
  shape(
    'M5,27 V51 C14.5,49.5 24.5,50.5 32,54.5 C39.5,50.5 49.5,49.5 59,51 V27',
    'metal',
    D
  ),
  shape('M32,26 C26.5,22 19,21 11,22.5 V46.5 C19,45 26.5,46 32,49.5 Z', 'face'),
  shape('M32,26 C37.5,22 45,21 53,22.5 V46.5 C45,45 37.5,46 32,49.5 Z', 'face'),
  line('M32,25 V13', D),
  shape(
    'M32,19.5 C28,19.5 24.5,17 24,13 C28,13 31.5,15.5 32,19.5 Z',
    'metal',
    D
  ),
  shape('M32,17 C32,13 35.5,10 40,10 C40,14 36.5,17 32,17 Z', 'metal', D),
])

// --- First Buddy: a handshake --------------------------------------------
// Forearms rise from cuffs in the lower corners. The near hand's fingers wrap
// over the other hand, whose thumb rests across the top.
const SHAKE_TILT = 32
const SHAKE_ARM = 16.5
const SHAKE = place({ scale: 1.2, cx: 32, cy: 36, dy: -2 })
const SHAKE_LEFT = place({ rotate: -SHAKE_TILT, dx: 10.5, dy: 44.5 })
const SHAKE_RIGHT = place({ rotate: SHAKE_TILT, dx: 53.5, dy: 44.5 })
const firstBuddy: EmblemPart[] = SHAKE([
  ...SHAKE_RIGHT([
    shape(`M0,-5.8 L${-SHAKE_ARM},-5 V5 L0,5.8 Z`, 'metal'),
    shape(
      'M1,-4 A2.8,2.8 0 0 0 -1.8,-6.8 H-2.7 A2.8,2.8 0 0 0 -5.5,-4 V4 A2.8,2.8 0 0 0 -2.7,6.8 H-1.8 A2.8,2.8 0 0 0 1,4 Z',
      'metalDeep',
      3.5
    ),
  ]),
  ...SHAKE_LEFT([
    shape(`M0,-5.8 L${SHAKE_ARM},-5 V5 L0,5.8 Z`, 'face'),
    shape(
      'M-1,-4 A2.8,2.8 0 0 1 1.8,-6.8 H2.7 A2.8,2.8 0 0 1 5.5,-4 V4 A2.8,2.8 0 0 1 2.7,6.8 H1.8 A2.8,2.8 0 0 1 -1,4 Z',
      'metalDeep',
      3.5
    ),
  ]),
  // The near hand: domed back, three fingertips stepping down over the other.
  shape(
    'M21.2,30.8 C22.5,25.8 27,22 33,21.5 C36.8,21.2 40.5,21.8 42.4,23.8 A3.2,3.2 0 0 1 40.6,29.2 C42.8,29 45.2,30.1 45.6,32.3 A3.2,3.2 0 0 1 43,36.4 C44.6,36.8 45.6,38.3 45,40 A3,3 0 0 1 41,41.9 C37,43 31,42.5 26.9,39.1 Z',
    'face'
  ),
  line('M40.6,29.2 C38.6,28.9 36.6,28.2 35,27.4', D),
  line('M43,36.4 C40.8,36 38.6,35.2 36.8,34.2', D),
  // The other hand's thumb across the top.
  shape(
    'M46,27 C42.5,22.2 36,19.5 29.5,19.8 C26.2,20 25.6,24.3 28.6,25.3 C32.5,26.6 36.5,28.6 39.8,31 Z',
    'metal'
  ),
])

export const BADGE_EMBLEMS: Record<BadgeArtId, EmblemPart[]> = {
  monthsShared,
  yearRound,
  reportSent,
  prepared,
  conversations,
  returnVisits,
  nextTime,
  keepingInTouch,
  together,
  firstBibleStudy,
  firstBuddy,
}
