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
      box(-0.8, 6, 0.8, 9.6, ['#7a5a3c', '#5e432b']),
      poly(domeOf(0, 0.2, 8.4, 7.2), ['#a9743f', '#845829', '#c6935d']),
      box(-8.6, 0, 8.6, 1.6, ['#845829', '#6a4620']),
    ],
    feats: [
      feat(-5, 3, '#845829'),
      feat(-2, 4, '#845829'),
      feat(1, 3, '#845829'),
      feat(4, 4, '#845829'),
      feat(-3, 6, '#845829'),
      feat(2, 6, '#845829'),
      feat(6, 2.6, '#845829'),
      feat(-7, 2.4, '#845829'),
    ],
  },
  leaf: {
    shapes: [
      box(-0.6, 0, 0.6, 3.4, ['#5e9c40']),
      ell(0, 5, 11, 3.8, ['#6cae4a', '#4f8f36', '#92cc6a'], { a: -7 }),
    ],
    feats: [
      ...[-9, -7, -5, -3, -1, 1, 3, 5, 7, 9].map((d) =>
        feat(d, 5 + d * 0.11, '#457d30')
      ),
      feat(-6, 6.4, '#457d30'),
      feat(-2, 6.8, '#457d30'),
      feat(2, 7.2, '#457d30'),
      feat(6, 7.6, '#457d30'),
      feat(-10, 3.4, '#8fd6f2'),
      feat(-10, 2.4, '#5fb4e0'),
    ],
  },
  box: {
    shapes: [
      poly(
        [
          [-8.4, 8],
          [-13, 11],
          [-11.6, 12.4],
          [-6.6, 8.6],
        ],
        ['#b48c58', '#94703f'],
        { edge: true }
      ),
      poly(
        [
          [8.4, 8],
          [13, 11],
          [11.6, 12.4],
          [6.6, 8.6],
        ],
        ['#b48c58', '#94703f'],
        { edge: true }
      ),
      box(-8.4, 0, 8.4, 8.8, CARD),
      box(-1.5, 0, 1.5, 8.8, ['#e2c893', '#caae78'], { no: true }),
    ],
    feats: [
      feat(-5, 5, '#6d5230'),
      feat(-6, 4, '#6d5230'),
      feat(-5, 4, '#6d5230'),
      feat(-4, 4, '#6d5230'),
      feat(-5, 3, '#6d5230'),
      feat(-5, 2, '#6d5230'),
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
      poly(domeOf(0, 0.4, 9.6, 10.6), ['#3f9a4c', '#2c7a39', '#62bd67'], {
        k: 'melon',
      }),
    ],
    paints: [
      paint(
        [
          [-6.6, 0],
          [-5, 0],
          [-2.8, 11],
          [-3.8, 11],
        ],
        ['#256a33'],
        ['melon']
      ),
      paint(
        [
          [-1, 0],
          [1, 0],
          [0.6, 11],
          [-0.6, 11],
        ],
        ['#256a33'],
        ['melon']
      ),
      paint(
        [
          [5, 0],
          [6.6, 0],
          [3.8, 11],
          [2.8, 11],
        ],
        ['#256a33'],
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
      ...book(-8, 6.4, 6.5, 9.2, ['#4c9a68', '#367a4f', '#74bc8c']),
      ...book(-6, 9.2, 7, 11.6, ['#d6a23a', '#ae7f22', '#f0c566'], 0.9),
      poly(
        [
          [3, 2.2],
          [4.2, 2.2],
          [4.2, -2],
          [3.6, -1.2],
          [3, -2],
        ],
        ['#e0464f']
      ),
    ],
    feats: [
      feat(-8, 1.6, '#f6d55c'),
      feat(-7, 1.6, '#f6d55c'),
      feat(-6.5, 4.8, '#fbf6ea'),
      feat(-5.5, 4.8, '#fbf6ea'),
      feat(-7, 7.8, '#f6d55c'),
    ],
  },
  dropped: {
    shapes: [
      poly(
        [
          [-3.6, 6.4],
          [4, 5],
          [5.6, 18.8],
        ],
        ['#d9a35c', WAFFLE, '#efc486']
      ),
      ell(0, 3, 9, 3.8, ICE, { g: 'ice' }),
      ell(-7, 0.4, 1.5, 2.6, ICE_DRIP, { g: 'ice' }),
      ell(-2.4, 0.2, 1.3, 2, ICE_DRIP, { g: 'ice' }),
      ell(4.4, -0.6, 1.5, 3.4, ICE_DRIP, { g: 'ice' }),
      ell(8, 1.2, 1.2, 1.7, ICE_DRIP, { g: 'ice' }),
    ],
    feats: [
      feat(-5, 4, '#fff7e6'),
      feat(-2, 5, '#5ec4e8'),
      feat(2, 4.4, '#f6d55c'),
      feat(6, 3.4, '#7fd08a'),
      feat(-7, 2.6, '#f6d55c'),
      feat(0, 2.4, '#7fd08a'),
      feat(3, 1.8, '#5ec4e8'),
      feat(2, 8, WAFFLE),
      feat(3, 10, WAFFLE),
      feat(1, 10, WAFFLE),
      feat(4, 12, WAFFLE),
      feat(3, 14, WAFFLE),
      feat(4, 16, WAFFLE),
      feat(0, 8, WAFFLE),
      feat(2, 12, WAFFLE),
    ],
  },
}
