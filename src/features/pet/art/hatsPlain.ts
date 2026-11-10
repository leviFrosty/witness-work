import type { ShapeSpec } from '@/lib/pixelArt'

import { box, domeOf, ell, feat, paint, poly, type Tones } from './hatCanvas'

export type PlainHatId =
  | 'toast'
  | 'acorn'
  | 'leaf'
  | 'box'
  | 'saucepan'
  | 'toque'
  | 'cone'
  | 'melon'
  | 'umbrella'
  | 'books'
  | 'dropped'

const coneWidth = (u: number) => 5.8 - (u - 1.4) * (4.5 / 14.4)

const coneBand = (a: number, b: number) =>
  poly(
    [
      [-coneWidth(a), a],
      [coneWidth(a), a],
      [coneWidth(b), b],
      [-coneWidth(b), b],
    ],
    ['#fbf6ea', '#d9d2c2'],
    { g: 'cone' }
  )

const canopyWedge = (a: number, b: number) =>
  [
    [0, 15],
    [a, 4],
    [b, 4],
  ] as const

function book(
  d0: number,
  u0: number,
  d1: number,
  u1: number,
  t: Tones,
  tilt = 0
) {
  return [
    poly(
      [
        [d0, u0],
        [d1, u0 + tilt],
        [d1, u1 + tilt],
        [d0, u1],
      ],
      t
    ),
    poly(
      [
        [d1 - 5, u0 + 0.7 + tilt * 0.6],
        [d1 - 0.2, u0 + 0.7 + tilt],
        [d1 - 0.2, u1 - 0.7 + tilt],
        [d1 - 5, u1 - 0.7 + tilt * 0.6],
      ],
      ['#f7efdc', '#e0d4b8'],
      { no: true }
    ),
  ]
}

const ICE: Tones = ['#f6a8c0', '#e27f9f', '#ffcbdb']
const ICE_DRIP: Tones = ['#f6a8c0', '#e27f9f']
const WAFFLE = '#b57f3d'
const STEEL: Tones = ['#b9c0c7', '#8d959d', '#dfe4e8']
const WHITE: Tones = ['#fbf8f1', '#dcd6ca', '#ffffff']
const CARD: Tones = ['#c9a06a', '#a47f4c', '#dcb985']

const ACORN: Tones = ['#a06c3a', '#7c4f27', '#c08c56']

const ACORN_CAP: [number, number][] = [
  [-8.8, 2.2],
  [-9, 4.6],
  [-8, 7],
  [-6, 8.8],
  [-3, 9.8],
  [0, 10.1],
  [3, 9.8],
  [6, 8.8],
  [8, 7],
  [9, 4.6],
  [8.8, 2.2],
]

const ACORN_SCALES = (() => {
  const out = []
  for (let u = 4; u <= 9; u++)
    for (let d = -8; d <= 7; d++) {
      const reach = 8.4 * Math.sqrt(1 - ((u - 2.6) / 7.6) ** 2)
      if (Math.abs(d + 0.5) > reach - 0.6) continue
      if ((d + u + 40) % 4 === 0 || (d - u + 40) % 4 === 0)
        out.push(feat(d, u, '#6d4421'))
    }
  return out
})()

const leafRib = (d: number) => 5.2 - 0.012 * d * d - Math.max(0, d - 6) * 0.5

const LEAF_VEINS = [
  ...Array.from({ length: 23 }, (_, i) => i - 11).map((d) =>
    feat(d, leafRib(d) + 0.5, '#bfe79a')
  ),
  ...[-8, -4, 0, 4].flatMap((d) => [
    feat(d + 1, leafRib(d) + 1.5, '#3f7a2c'),
    feat(d + 2, leafRib(d) + 2.5, '#3f7a2c'),
    feat(d + 3, leafRib(d) + 3.5, '#3f7a2c'),
    feat(d + 1, leafRib(d) - 0.5, '#3f7a2c'),
    feat(d + 2, leafRib(d) - 1.5, '#3f7a2c'),
  ]),
  feat(9, leafRib(8) + 1.5, '#3f7a2c'),
  feat(10, leafRib(8) + 2.5, '#3f7a2c'),
]

const melonStripe = (d: number) => {
  const at = (u: number) => d * Math.sqrt(Math.max(0, 1 - (u / 11.4) ** 2))
  const zig = (u: number) => (Math.floor(u / 1.5) % 2 ? 0.55 : -0.55)
  const rows = [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5]
  const half = (u: number) => 0.95 - u * 0.04
  return paint(
    [
      ...rows.map((u) => [at(u) + zig(u) - half(u), u] as const),
      ...rows
        .slice()
        .reverse()
        .map((u) => [at(u) + zig(u) + half(u), u] as const),
    ],
    ['#256a33'],
    ['melon']
  )
}

const CONE_WAFFLE = (() => {
  const inside = (d: number, u: number) => {
    const x = d + 0.5
    const y = u - 0.6
    if (y < 9.6 || y > 17) return false
    const k = (18.7 - y) / 10.9
    return x > 2.2 - 6.15 * k && x < 2.2 + 3.15 * k
  }
  const out = []
  for (let u = 10; u <= 18; u++)
    for (let d = -5; d <= 5; d++)
      if (
        inside(d, u) &&
        inside(d - 1, u) &&
        ((d + u) % 4 === 0 || (d - u + 40) % 4 === 0)
      )
        out.push(feat(d, u, WAFFLE))
  return out
})()

export const PLAIN_HAT_SPECS: Readonly<Record<PlainHatId, ShapeSpec>> = {
  toast: {
    shapes: [
      poly(
        [...domeOf(0, 7, 7.2, 4.4), [7.2, 0.2], [-7.2, 0.2]],
        ['#b9783c', '#935c2b', '#cf9355']
      ),
      poly(
        [...domeOf(0, 7, 5.8, 3.2), [5.8, 1.4], [-5.8, 1.4]],
        ['#f0cf8e', '#dfb56e', '#f8e2b0'],
        { no: true }
      ),
      box(-2.2, 5, 2.2, 8, ['#f8e27a', '#e6c64e', '#fff2a8']),
    ],
    feats: [
      feat(-4, 3, '#dfb56e'),
      feat(3, 3, '#dfb56e'),
      feat(-1, 2.6, '#dfb56e'),
      feat(4, 6, '#dfb56e'),
      feat(-4, 7, '#dfb56e'),
    ],
  },
  acorn: {
    shapes: [
      poly(
        [
          [-0.9, 9.6],
          [0.9, 9.6],
          [1.1, 11.6],
          [2.9, 12.6],
          [2.5, 14],
          [-0.3, 13],
        ],
        ['#6a4a2c', '#4e3520']
      ),
      box(-7.2, 0, 7.2, 3, ['#dba95f', '#bb863f', '#f0cc90']),
      poly(ACORN_CAP, ACORN, { edge: true }),
    ],
    feats: ACORN_SCALES,
  },
  leaf: {
    shapes: [
      poly(
        [
          [-11.2, 3.4],
          [-11.2, 5],
          [-13.4, 6.4],
          [-14.6, 8.6],
          [-15.8, 8.2],
          [-14.4, 5.4],
        ],
        ['#5a8f3c', '#457d30']
      ),
      poly(
        [
          [-12, 4.2],
          [-9.4, 7.6],
          [-5, 9.8],
          [-2, 10.5],
          [2, 10.5],
          [5, 9.8],
          [9, 7.4],
          [12, 3.4],
          [13.6, -0.8],
          [11, 0.2],
          [8, 1.2],
          [4, 1],
          [0, 0.6],
          [-5, 0.8],
          [-9, 2],
        ],
        ['#6cae4a', '#4f8f36', '#92cc6a']
      ),
    ],
    feats: [
      ...LEAF_VEINS,
      feat(13, -1.2, '#8fd6f2'),
      feat(13, -2.2, '#5fb4e0'),
    ],
  },
  box: {
    shapes: [
      box(-7.2, 8.4, 7.2, 12.6, ['#a47f4c', '#8a6838', '#b8915c']),
      poly(
        [
          [-8.4, 8.8],
          [-13, 12.8],
          [-14.4, 11.6],
          [-8.4, 6.6],
        ],
        ['#b48c58', '#94703f', '#cda671'],
        { edge: true }
      ),
      poly(
        [
          [8.4, 8.8],
          [13, 12.8],
          [14.4, 11.6],
          [8.4, 6.6],
        ],
        ['#b48c58', '#94703f', '#cda671'],
        { edge: true }
      ),
      box(-8.4, 0, 8.4, 8.8, CARD),
      box(-1.1, 4.6, 1.1, 8.8, ['#ecdcae', '#d6c28c'], { no: true }),
      box(3.4, 4.8, 6.6, 6.2, ['#6d5230'], { no: true }),
      box(-6.6, 1.4, -2.8, 4.6, ['#f6eeda', '#ddd2b8'], { no: true }),
    ],
    feats: [
      feat(-6, 4, '#8a7a5c'),
      feat(-5, 4, '#8a7a5c'),
      feat(-4, 4, '#8a7a5c'),
      feat(-6, 3, '#b5a688'),
      feat(-5, 3, '#b5a688'),
    ],
  },
  saucepan: {
    shapes: [
      box(7, 4.6, 16, 6.2, ['#3a3f46', '#2a2d33', '#585f68'], { edge: true }),
      box(-7.4, 0, 7.4, 8.6, STEEL),
      box(-8.2, 0, 8.2, 1.4, ['#8d959d', '#6f777f']),
      ell(0, 8.6, 7.4, 1.2, ['#dfe4e8', '#b9c0c7']),
    ],
    feats: [
      feat(-5, 6, '#ffffff'),
      feat(-5, 5, '#ffffff'),
      feat(-5, 4, '#ffffff'),
    ],
  },
  toque: {
    shapes: [
      ell(-4.6, 8.6, 4.6, 4.6, WHITE, { g: 'puff' }),
      ell(4.6, 8.6, 4.6, 4.6, WHITE, { g: 'puff' }),
      ell(0, 10.4, 5.4, 5.4, WHITE, { g: 'puff' }),
      box(-6.6, 0, 6.6, 6, WHITE, { g: 'puff' }),
      box(-7, 0, 7, 3, ['#efe9dd', '#d3cdc0'], { edge: true }),
    ],
    feats: [
      feat(-3, 7, '#d3cdc0'),
      feat(-3, 6, '#d3cdc0'),
      feat(3, 7, '#d3cdc0'),
      feat(3, 6, '#d3cdc0'),
    ],
  },
  cone: {
    shapes: [
      box(-9, 0, 9, 1.8, ['#d9561f', '#ab3f14', '#ef7a3a']),
      poly(
        [
          [-5.8, 1.4],
          [5.8, 1.4],
          [1.3, 15.8],
          [-1.3, 15.8],
        ],
        ['#f47a24', '#cf5a12', '#ff9d55'],
        { g: 'cone' }
      ),
      coneBand(4.4, 7),
      coneBand(9.6, 11.6),
    ],
  },
  melon: {
    shapes: [
      poly(domeOf(0, 0.4, 9.6, 10.6), ['#4fa858', '#35873f', '#74c878'], {
        k: 'melon',
      }),
    ],
    paints: [
      ...[-7.6, -3.8, 0, 3.8, 7.6].map((d) => melonStripe(d)),
      paint(
        [
          [1.4, 12],
          [10.6, 4.8],
          [3.2, 3.4],
        ],
        ['#f3efc9'],
        ['melon']
      ),
      paint(
        [
          [2.6, 10.4],
          [8.8, 5.4],
          [4, 4.6],
        ],
        ['#e8505b', '#c93a47', '#f4757b'],
        ['melon']
      ),
      paint(
        [
          [-11, 0.4],
          [11, 0.4],
          [11, 2.8],
          [-11, 2.8],
        ],
        ['#f3efc9'],
        ['melon']
      ),
      paint(
        [
          [-11, 0.4],
          [11, 0.4],
          [11, 2],
          [-11, 2],
        ],
        ['#e8505b', '#c93a47'],
        ['melon']
      ),
    ],
    feats: [
      feat(-6, 1.1, '#2b1a1a'),
      feat(-2, 1.1, '#2b1a1a'),
      feat(2, 1.1, '#2b1a1a'),
      feat(6, 1.1, '#2b1a1a'),
      feat(4, 8, '#2b1a1a'),
      feat(5, 6, '#2b1a1a'),
      feat(6, 7, '#2b1a1a'),
    ],
  },
  umbrella: {
    shapes: [
      box(-0.6, 1, 0.6, 7, ['#8a6a45']),
      box(-7, 0, 7, 1.9, ['#3a3f55', '#2a2d40', '#52587a']),
      poly(
        [
          ...domeOf(0, 6.4, 12, 8.4),
          [12, 6.4],
          [9, 5.4],
          [6, 6.4],
          [3, 5.4],
          [0, 6.4],
          [-3, 5.4],
          [-6, 6.4],
          [-9, 5.4],
        ],
        ['#e0464f', '#b93039', '#f4757b'],
        { k: 'canopy' }
      ),
      ell(0, 15.4, 0.9, 0.9, ['#f6d55c']),
    ],
    paints: [
      paint(canopyWedge(-9, -4.6), ['#fff7e6', '#e7dcc6'], ['canopy']),
      paint(canopyWedge(-0.2, 4.2), ['#fff7e6', '#e7dcc6'], ['canopy']),
      paint(canopyWedge(8.2, 13), ['#fff7e6', '#e7dcc6'], ['canopy']),
    ],
  },
  books: {
    shapes: [
      ...book(-9, 0, 8, 3.2, ['#3f6fb5', '#2c5290', '#6793d6']),
      ...book(-7.5, 3.2, 9, 6.4, ['#c0453f', '#97302d', '#e06a5f']),
      ...book(-8.5, 6.4, 7, 9.2, ['#4c9a68', '#367a4f', '#74bc8c']),
      ...book(-6.5, 9.2, 8, 12, ['#d6a23a', '#ae7f22', '#f0c566']),
      poly(
        [
          [-3.4, 12.4],
          [-2.2, 12.4],
          [-2.2, 7],
          [-2.8, 7.8],
          [-3.4, 7],
        ],
        ['#e0464f', '#b93039'],
        { no: true }
      ),
    ],
    feats: [
      feat(-8, 1.6, '#f6d55c'),
      feat(-7, 1.6, '#f6d55c'),
      feat(-6.5, 4.8, '#fbf6ea'),
      feat(-5.5, 4.8, '#fbf6ea'),
      feat(-7.5, 7.8, '#f6d55c'),
    ],
  },
  dropped: {
    shapes: [
      poly(
        [
          [-3.95, 8.45],
          [5.35, 7.15],
          [2.2, 18.7],
        ],
        ['#e2b06a', '#c98f47', '#f3d096']
      ),
      poly(
        [
          [-5, 7.6],
          [5.8, 5.8],
          [6.2, 7.6],
          [-4.6, 9.4],
        ],
        ['#c98f47', '#a9742f', '#e6b872'],
        { edge: true }
      ),
      poly(
        [
          [-9.6, 0],
          [-10, 1.4],
          [-8.6, 3.2],
          [-7.2, 5.4],
          [-4.8, 7.2],
          [-2, 8],
          [1.5, 8],
          [4.6, 7],
          [7, 5.2],
          [8.6, 3],
          [10, 1.4],
          [9.6, 0],
        ],
        ICE,
        { g: 'ice' }
      ),
      ell(-6, -0.1, 1.3, 1.3, ICE_DRIP, { g: 'ice' }),
      ell(6.4, -0.9, 1.4, 2.5, ICE_DRIP, { g: 'ice' }),
    ],
    feats: [
      ...CONE_WAFFLE,
      feat(-6, 5, '#fff7e6'),
      feat(-5, 6, '#fff7e6'),
      feat(-2, 4, '#5ec4e8'),
      feat(3, 5, '#f6d55c'),
      feat(6, 3.4, '#7fd08a'),
      feat(-7, 2.6, '#f6d55c'),
      feat(0, 2.4, '#7fd08a'),
      feat(4, 2, '#5ec4e8'),
      feat(-3, 1.6, '#f6d55c'),
    ],
  },
}
