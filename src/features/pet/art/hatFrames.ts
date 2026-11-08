import type { FeaturePixel, ShapeSpec } from '@/lib/pixelArt'
import type { Season } from '@/types/pet'

import { box, domeOf, ell, feat, paint, poly, type Tones } from './hatCanvas'

const specs: Record<string, ShapeSpec> = {}

const beanieBase = [
  box(-0.6, 8, 0.6, 11.4, ['#3a3f55']),
  poly(domeOf(0, 0.2, 8.6, 8.8), ['#e0464f', '#b93039', '#f4757b'], { k: 'b' }),
  ell(0, 8.8, 1.4, 1, ['#f6d55c']),
]
const beaniePaint = [
  paint(
    [
      [0, 9],
      [-3, 0],
      [3, 0],
    ],
    ['#3f7fd0', '#2c5fa3', '#6aa3e8'],
    ['b']
  ),
  paint(
    [
      [-9, 0],
      [-9, 5],
      [-4.8, 0],
    ],
    ['#f6d55c', '#d6ae2c'],
    ['b']
  ),
  paint(
    [
      [9, 0],
      [9, 5],
      [4.8, 0],
    ],
    ['#f6d55c', '#d6ae2c'],
    ['b']
  ),
]
const blade = (rx: number, swapped: boolean) => [
  poly(
    [
      [-rx, 11.2],
      [0, 10.6],
      [0, 12.2],
      [-rx, 12],
    ],
    swapped ? ['#3f7fd0'] : ['#f6d55c']
  ),
  poly(
    [
      [rx, 11.2],
      [0, 10.6],
      [0, 12.2],
      [rx, 12],
    ],
    swapped ? ['#f6d55c'] : ['#3f7fd0']
  ),
  ell(0, 11.4, 0.9, 0.9, ['#2d2a32']),
]
const BLADES: readonly (readonly [number, boolean])[] = [
  [10, false],
  [5.4, false],
  [1.2, false],
  [5.4, true],
  [10, true],
  [5.4, true],
  [1.2, true],
  [5.4, false],
]
BLADES.forEach(([rx, swapped], i) => {
  specs[`propeller/${i}`] = {
    shapes: [...beanieBase, ...blade(rx, swapped)],
    paints: beaniePaint,
  }
})

const MAIL: Tones = ['#4a9aa8', '#34798a', '#74c1cc']
const FLAG: Tones = ['#e0464f', '#b93039', '#f4757b']
const mailBody = [
  box(-1.5, 0, 1.5, 6, ['#9a7248', '#775432', '#b8905f']),
  poly(domeOf(-0.5, 10, 7.2, 4), MAIL),
  box(-7.7, 5.6, 6.7, 10.2, MAIL, { g: 'mail' }),
]
const mailDoor = box(-9, 5.6, -7.2, 13.4, ['#34798a', '#27606f', '#4a9aa8'], {
  edge: true,
})
const flagUp = [
  box(3.2, 10, 4.4, 18.4, ['#d0d6dc', '#a4adb6'], { edge: true }),
  box(4.4, 15, 9, 18.4, FLAG, { edge: true }),
]
specs['mailbox/down'] = {
  shapes: [
    ...mailBody,
    mailDoor,
    box(2.6, 8.1, 9.4, 9.5, FLAG, { edge: true }),
    box(8, 8.1, 10.2, 10.4, FLAG, { edge: true }),
  ],
}
specs['mailbox/up'] = { shapes: [...mailBody, mailDoor, ...flagUp] }
specs['mailbox/open'] = {
  shapes: [
    ...mailBody,
    box(-13.6, 6.4, -7, 10.6, ['#fbf6ea', '#e0d6bf'], { edge: true }),
    ...flagUp,
  ],
  feats: [
    feat(-12, 9, '#a89a7f'),
    feat(-11, 8.5, '#a89a7f'),
    feat(-10, 8, '#a89a7f'),
    feat(-9, 8.5, '#a89a7f'),
    feat(-8, 9, '#a89a7f'),
    feat(-12, 7.4, '#e0464f'),
  ],
}

const FROG: Tones = ['#6fb84c', '#4f9638', '#96d470']
const frogBody = (belly: number) => [
  ell(-7.4, 1, 3.2, 1.3, FROG, { g: 'f' }),
  ell(7.4, 1, 3.2, 1.3, FROG, { g: 'f' }),
  ell(0, 4.8, 8.8, 4.9, FROG, { g: 'f' }),
  ell(-4.8, 9.4, 2.8, 2.8, FROG, { g: 'f' }),
  ell(4.8, 9.4, 2.8, 2.8, FROG, { g: 'f' }),
  ell(0, 2.8, 5.2, belly, ['#e2eeb0', '#c8d98f'], { no: true }),
]
const frogEyes = [
  ell(-4.8, 9.6, 1.7, 1.7, ['#fbf6ea'], { no: true }),
  ell(4.8, 9.6, 1.7, 1.7, ['#fbf6ea'], { no: true }),
]
const PUPILS: readonly FeaturePixel[] = [-5, -4, 5, 4].map((d) =>
  feat(d, 9.4, '#23201c')
)
const FROG_MOUTH: readonly FeaturePixel[] = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(
  (d) => feat(d, 6.1, '#2f6a23')
)
specs['frog/idle'] = {
  shapes: [...frogBody(2.5), ...frogEyes],
  feats: [...PUPILS, ...FROG_MOUTH],
}
specs['frog/throat'] = {
  shapes: [...frogBody(3.5), ...frogEyes],
  feats: [...PUPILS, ...FROG_MOUTH],
}
specs['frog/blink'] = {
  shapes: frogBody(2.5),
  feats: [
    ...[-6, -5, -4, 4, 5, 6].map((d) => feat(d, 9.4, '#2f6a23')),
    ...FROG_MOUTH,
  ],
}
specs['frog/tongue'] = {
  shapes: [
    ...frogBody(2.5),
    ...frogEyes,
    box(1, 5.4, 16, 6.4, ['#ef7b9b'], { no: true }),
    ell(16.4, 6, 1.4, 1.2, ['#ef7b9b'], { no: true }),
  ],
  feats: [...PUPILS, ...FROG_MOUTH.slice(0, 4)],
}

const cottage = (glass: string) => [
  box(3.6, 10.6, 6.2, 17.4, ['#a15a42', '#7f4432', '#bf7a5e']),
  box(-8, 0, 8, 8.6, ['#f4e6c8', '#d9c49b', '#fff5de']),
  poly(
    [
      [-10.2, 8],
      [10.2, 8],
      [0, 16.6],
    ],
    ['#c9583d', '#a0432c', '#e57e5c'],
    { edge: true }
  ),
  box(-1.5, 0, 1.5, 5.2, ['#7a5232', '#5e3d24'], { no: true }),
  box(-6.2, 2.8, -3.4, 5.6, [glass], { no: true }),
  box(3.4, 2.8, 6.2, 5.6, [glass], { no: true }),
  ell(0, 10.6, 1.3, 1.3, [glass], { no: true }),
]
specs['cottage/day'] = { shapes: cottage('#7fa9c4') }
specs['cottage/night'] = { shapes: cottage('#ffd45c') }

const SNAIL_SHELL = [
  ell(-0.6, 4.2, 3.6, 3.5, ['#c0763e', '#9a5a2b', '#dc9a62']),
]
const SNAIL_SWIRL: readonly FeaturePixel[] = [
  feat(-1, 5, '#7e4620'),
  feat(0, 5, '#7e4620'),
  feat(1, 4, '#7e4620'),
  feat(0, 3, '#7e4620'),
  feat(-2, 3, '#7e4620'),
  feat(-3, 4, '#7e4620'),
]
specs['snail/out'] = {
  shapes: [
    poly(
      [
        [-5, 0],
        [6, 0],
        [7.4, 2],
        [7.4, 4.4],
        [5.4, 4.4],
        [4.4, 1.8],
        [-4, 1.6],
      ],
      ['#e6d3a6', '#c9b482', '#f4e8c6']
    ),
    box(5.8, 4, 6.4, 7, ['#c9b482'], { no: true }),
    box(7, 4, 7.6, 6.6, ['#c9b482'], { no: true }),
    ...SNAIL_SHELL,
  ],
  feats: [...SNAIL_SWIRL, feat(6, 7, '#23201c'), feat(7, 6.6, '#23201c')],
}
specs['snail/in'] = {
  shapes: [box(-4, 0, 3.4, 1, ['#c9b482'], { no: true }), ...SNAIL_SHELL],
  feats: SNAIL_SWIRL,
}

const CHICK: Tones = ['#f6d55c', '#d9b43a', '#ffe88a']
const nest = (open: readonly boolean[], lift: readonly number[]) => {
  const beak = (d: number, u: number, wide: boolean) =>
    wide
      ? [
          feat(d + 2, u + 0.4, '#e0883a'),
          feat(d + 3, u + 0.4, '#e0883a'),
          feat(d + 2, u - 0.7, '#c9502f'),
          feat(d + 2, u - 1.6, '#e0883a'),
          feat(d + 3, u - 1.6, '#e0883a'),
        ]
      : [feat(d + 2, u - 0.6, '#e0883a'), feat(d + 3, u - 0.6, '#e0883a')]
  const chicks = [
    [-4.6, 6],
    [0, 7],
    [4.6, 6],
  ] as const
  return {
    shapes: [
      ...chicks.map(([d, u], i) => ell(d, u + lift[i], 2.5, 2.5, CHICK)),
      ell(0, 2.6, 9.4, 3.1, ['#8d6a42', '#6d4f2d', '#ad8a5e']),
    ],
    feats: [
      ...chicks.flatMap(([d, u], i) => [
        feat(d + 0.6, u + lift[i] + 0.8, '#23201c'),
        ...beak(d, u + lift[i], open[i]),
      ]),
      ...[-8, -5, -2, 1, 4, 7].flatMap((d, i) => [
        feat(d, 3.6 - (i % 2), '#6d4f2d'),
        feat(d + 1, 1.8 + (i % 2), '#ad8a5e'),
      ]),
    ],
  }
}
specs['nest/0'] = nest([false, false, false], [0, 0, 0])
specs['nest/1'] = nest([false, true, false], [0, 1, 0])
specs['nest/2'] = nest([true, false, false], [1, 0, 0])
specs['nest/3'] = nest([false, false, true], [0, 0, 1])
specs['nest/fed'] = nest([true, true, true], [1, 1, 1])

specs.hive = {
  shapes: [
    box(-8.6, 0, 8.6, 1.4, ['#8a6a45', '#6d5230', '#a98a62']),
    poly(domeOf(0, 1.2, 7.8, 12), ['#e3ad45', '#c58c28', '#f4cc78'], {
      k: 'hive',
    }),
    ell(0, 3.4, 2, 2, ['#3a2a1c'], { no: true }),
  ],
  paints: [3.8, 7.2, 10.6].map((u) =>
    paint(
      [
        [-9, u],
        [9, u],
        [9, u + 0.9],
        [-9, u + 0.9],
      ],
      ['#c58c28'],
      ['hive']
    )
  ),
}

const cloudOf = (dark: boolean) => {
  const c: Tones = dark
    ? ['#c9d1dc', '#9daab8', '#e4e9ef']
    : ['#fbfcfe', '#d5dde8', '#ffffff']
  return {
    shapes: [
      ell(-6.4, 11, 4.6, 3.4, c, { g: 'cloud' }),
      ell(6.4, 11, 4.6, 3.4, c, { g: 'cloud' }),
      ell(0, 13.4, 6, 4.8, c, { g: 'cloud' }),
      box(-8, 8.2, 8, 11, c, { g: 'cloud' }),
    ],
  }
}
specs['cloud/light'] = cloudOf(false)
specs['cloud/heavy'] = cloudOf(true)

const CASE: Tones = ['#8a5a34', '#6d4526', '#a97a50']
const cuckooBody = [
  box(-7, 0, 7, 12, CASE),
  poly(
    [
      [-9, 11.4],
      [9, 11.4],
      [0, 18.4],
    ],
    ['#6d4526', '#55351c', '#8a5a34'],
    { edge: true }
  ),
  ell(0, 5.6, 4.6, 4.6, ['#f7efdc', '#e0d4b8'], { edge: true }),
]
specs['cuckoo/shut'] = {
  shapes: [
    ...cuckooBody,
    box(-1.5, 12, 1.5, 15, ['#55351c', '#402713'], { edge: true }),
  ],
}
specs['cuckoo/out'] = {
  shapes: [
    ...cuckooBody,
    box(-1.5, 12, 1.5, 15, ['#26180c'], { edge: true }),
    box(-7, 12.6, 0.4, 13.4, ['#b9a78a'], { edge: true }),
    ell(-7.6, 13.8, 2.4, 1.7, ['#5ea9d6', '#3f86b2', '#8ac8ea'], {
      edge: true,
    }),
    ell(-9.4, 15, 1.4, 1.3, ['#5ea9d6', '#3f86b2'], { edge: true, g: 'bird' }),
  ],
  feats: [feat(-10, 15.2, '#23201c'), feat(-11, 14.8, '#f6d55c')],
}

specs.balloon = {
  shapes: [
    box(-2.6, 0, 2.6, 3, ['#a57c4a', '#83602f', '#c79c66']),
    poly(
      [
        [-2.4, 3],
        [-5, 7.4],
        [-4, 7.4],
        [-1.4, 3],
      ],
      ['#6b5a44']
    ),
    poly(
      [
        [2.4, 3],
        [5, 7.4],
        [4, 7.4],
        [1.4, 3],
      ],
      ['#6b5a44']
    ),
    poly(
      [...domeOf(0, 12, 8, 9), [8, 12], [3.4, 6.6], [-3.4, 6.6], [-8, 12]],
      ['#e0464f', '#b93039', '#f4757b'],
      { k: 'env' }
    ),
  ],
  paints: [
    paint(
      [
        [-5, 22],
        [-1.6, 22],
        [-1, 6],
        [-2.6, 6],
      ],
      ['#fbf6ea', '#e0d6bf'],
      ['env']
    ),
    paint(
      [
        [1.6, 22],
        [5, 22],
        [2.6, 6],
        [1, 6],
      ],
      ['#f6d55c', '#d6ae2c'],
      ['env']
    ),
  ],
}

const bowlBody = (left: number, right: number): ShapeSpec => ({
  shapes: [
    ell(0, 10.4, 10.8, 10.2, ['#dcf2fa'], { k: 'g' }),
    ell(0, 20.2, 6.8, 1.5, ['#f4fbff', '#c6e4ef']),
  ],
  paints: [
    paint(
      [
        [-12, 0],
        [12, 0],
        [12, right],
        [-12, left],
      ],
      ['#5fb4e0', '#3f94c8'],
      ['g']
    ),
    paint(
      [
        [-12, 0],
        [12, 0],
        [12, 3.4],
        [-12, 3.4],
      ],
      ['#ecd9a6', '#d4bd84'],
      ['g']
    ),
  ],
  feats: [
    feat(-8, 14, '#ffffff'),
    feat(-8, 13, '#ffffff'),
    feat(-7, 16, '#ffffff'),
    feat(-6, 17, '#ffffff'),
    feat(-5, 4, '#3f9a4c'),
    feat(-5, 5, '#3f9a4c'),
    feat(-4, 6, '#3f9a4c'),
    feat(-5, 7, '#3f9a4c'),
    feat(-4, 8, '#3f9a4c'),
    feat(6, 4, '#2c7a39'),
    feat(5, 5, '#2c7a39'),
    feat(6, 6, '#2c7a39'),
    feat(1, 3, '#a89a7f'),
    feat(2, 3, '#8b7f6a'),
    feat(-1, 3, '#c06a5a'),
    feat(3, 2, '#8b7f6a'),
  ],
})
specs['bowl/0'] = bowlBody(15, 15)
specs['bowl/1'] = bowlBody(15.8, 14.2)
specs['bowl/2'] = bowlBody(14.2, 15.8)

const tower = [
  ell(0, 1.6, 10, 2.6, ['#8b8f94', '#6a6e74', '#aeb2b6']),
  poly(
    [
      [-5.8, 2],
      [5.8, 2],
      [3.6, 18],
      [-3.6, 18],
    ],
    ['#fbf6ea', '#dcd3c0', '#ffffff'],
    { k: 't' }
  ),
  box(-5.6, 17.8, 5.6, 19.2, ['#2d3a4a', '#1e2733', '#47566a']),
  box(-3, 19.2, 3, 23.4, ['#fff2b8'], { k: 'l' }),
  poly(
    [
      [-3.9, 23.2],
      [3.9, 23.2],
      [0, 27],
    ],
    ['#c0453f', '#97302d', '#e06a5f']
  ),
  ell(0, 27.4, 0.8, 0.8, ['#f6d55c']),
  box(-1.1, 2, 1.1, 5.4, ['#3a4a5a'], { no: true }),
]
const towerBands = [6, 12.4].map((u) =>
  paint(
    [
      [-7, u],
      [7, u],
      [7, u + 3.2],
      [-7, u + 3.2],
    ],
    ['#d9423f', '#ad2f2d', '#ef6c66'],
    ['t']
  )
)
;[-2, -1, 0, 1, 2, 1, 0, -1].forEach((d, i) => {
  specs[`lighthouse/${i}`] = {
    shapes: tower,
    paints: [
      ...towerBands,
      paint(
        [
          [d - 1.2, 19],
          [d + 1.2, 19],
          [d + 1.2, 24],
          [d - 1.2, 24],
        ],
        ['#ffc92e'],
        ['l']
      ),
    ],
    feats: [
      feat(0, 10.6, '#3a4a5a'),
      feat(-3, 20, '#2d3a4a'),
      feat(3, 20, '#2d3a4a'),
    ],
  }
})

specs['train/bed'] = {
  shapes: [
    ell(0, 3.2, 13.6, 4.1, ['#7a5a3c', '#5e432b', '#94714f']),
    ell(0, 3.2, 11.8, 3.1, ['#b7a98c', '#9a8c6f']),
    ell(0, 3.2, 9.8, 2.2, ['#6fa64e', '#578a3c', '#8cc266']),
  ],
  feats: [-12, -9, -6, -3, 0, 3, 6, 9, 12].flatMap((d) => [
    feat(d, 5.8, '#5e432b'),
    feat(d, 0.5, '#5e432b'),
  ]),
}
specs['train/hill'] = {
  shapes: [
    ell(-3.4, 13.6, 2.8, 2.8, ['#3f8a4c', '#2c6a39', '#62ad67'], { g: 'tree' }),
    box(-3.9, 9, -2.9, 12, ['#775432'], { no: true }),
    poly(domeOf(0, 3, 8.8, 9), ['#7fbf58', '#5e9c40', '#a4dc78']),
  ],
  feats: [
    feat(2, 8, '#5e9c40'),
    feat(-1, 6, '#a4dc78'),
    feat(4, 5, '#a4dc78'),
    feat(-4, 4.4, '#5e9c40'),
  ],
}

const domeOfShow = (lit: boolean): ShapeSpec => {
  const lamp = lit ? '#ffd45c' : '#f7efdc'
  return {
    shapes: [
      box(1, 6, 3.2, 10, ['#b08a4a', '#8a6a34']),
      box(-8, 0, 8, 4.6, ['#c9a24e', '#a07c30', '#e6c66e']),
      box(-8.4, 4.2, 8.4, 5.4, ['#8a6a34', '#6d5226']),
      poly(domeOf(0, 5.2, 7.2, 7.4), ['#2c3a66', '#1e2849', '#46588f'], {
        k: 'd',
      }),
      poly(
        [
          [-0.6, 9.6],
          [5.4, 14],
          [7, 12.4],
          [1.2, 8.2],
        ],
        ['#d8b45e', '#a98838', '#f2d68c'],
        { edge: true }
      ),
      box(5, 13.4, 7.8, 15, ['#8a6a34', '#6d5226'], { edge: true }),
    ],
    paints: [
      paint(
        [
          [-3.4, 4],
          [-1.6, 4],
          [-0.4, 13],
          [-1.4, 13],
        ],
        lit ? ['#ffe9a6'] : ['#16203c'],
        ['d']
      ),
    ],
    feats: [
      ...[-6, -3, 0, 3, 6].map((d) => feat(d, 1.6, lamp)),
      feat(3, 7, '#d7e2ff'),
      feat(-5, 7, '#d7e2ff'),
      feat(1, 10, '#d7e2ff'),
      feat(4, 9, '#9db0e4'),
    ],
  }
}
specs['dome/closed'] = domeOfShow(false)
specs['dome/open'] = domeOfShow(true)

type FigLook = {
  leaf: Tones
  alt: Tones
  blossom?: string
  fruit?: string
  bare?: boolean
}
const FIG_LOOK: Readonly<Record<Season, FigLook>> = {
  summer: {
    leaf: ['#4f9c47', '#357a33', '#78c063'],
    alt: ['#3f8a3f', '#2c6a2e'],
    fruit: '#6d3a78',
  },
  spring: {
    leaf: ['#7cc25a', '#5aa043', '#a4dc7c'],
    alt: ['#6ab351', '#4f9238'],
    blossom: '#ffd3e0',
  },
  autumn: {
    leaf: ['#d98f2e', '#b0691e', '#f1b45a'],
    alt: ['#c4602a', '#9a481c'],
    fruit: '#6d3a78',
  },
  winter: { leaf: ['#8a6a4a'], alt: ['#8a6a4a'], bare: true },
}
const WOOD: Tones = ['#7a5a3c', '#5e432b', '#94714f']
const figPot = [
  poly(
    [
      [-5.2, 0],
      [5.2, 0],
      [6.2, 4.4],
      [-6.2, 4.4],
    ],
    ['#c9704a', '#a35534', '#e2926a']
  ),
  box(-6.9, 4, 6.9, 5.8, ['#d27c54', '#ad5d3a', '#ea9d76']),
  ell(0, 5.8, 5.6, 0.9, ['#4a3424'], { no: true }),
]
function figShapes(stage: number, look: FigLook) {
  const twig = (d0: number, u0: number, d1: number, u1: number, w: number) =>
    poly(
      [
        [d0 - w, u0],
        [d0 + w, u0],
        [d1 + w * 0.7, u1],
        [d1 - w * 0.7, u1],
      ],
      WOOD,
      { g: 'tree' }
    )
  const lump = (d: number, u: number, rx: number, ry: number, alt = false) =>
    look.bare ? [] : [ell(d, u, rx, ry, alt ? look.alt : look.leaf, { g: 'c' })]
  if (stage === 0)
    return [
      ...figPot,
      twig(0, 5.6, 0, 9, 0.45),
      ...(look.bare
        ? []
        : [
            ell(-1.8, 9.6, 2, 1, look.leaf, { a: -22, g: 'c' }),
            ell(1.8, 9.6, 2, 1, look.leaf, { a: 22, g: 'c' }),
          ]),
    ]
  if (stage === 1)
    return [
      ...figPot,
      twig(0, 5.6, 0, 13, 0.6),
      twig(0, 9, -2.6, 12, 0.35),
      twig(0, 10, 2.6, 13, 0.35),
      ...lump(-3, 12.6, 2.4, 1.8),
      ...lump(3, 13.6, 2.4, 1.8),
      ...lump(0, 14.6, 2.4, 2),
    ]
  if (stage === 2)
    return [
      ...figPot,
      twig(0, 5.6, 0, 14, 0.9),
      twig(0, 10, -4, 14, 0.5),
      twig(0, 11, 4, 15, 0.5),
      ...lump(0, 16, 5.4, 4),
      ...lump(-4, 14.6, 3, 2.6),
      ...lump(4, 15.4, 3, 2.6, true),
    ]
  if (stage === 3)
    return [
      ...figPot,
      twig(0, 5.6, 0, 16, 1.2),
      twig(0, 10, -5.6, 15, 0.7),
      twig(0, 11.6, 5.6, 16, 0.7),
      ...lump(0, 18.6, 7, 4.8),
      ...lump(-6, 15.6, 4.2, 3.4),
      ...lump(6, 16.6, 4.2, 3.4, true),
      ...lump(-2, 21.4, 4, 2.4, true),
    ]
  const k = stage === 5 ? 1.2 : 1
  const top = stage === 5 ? 1.05 : 1
  return [
    ...figPot,
    twig(0, 5.6, 0, 18, stage === 5 ? 1.8 : 1.5),
    twig(0, 10, -7 * k, 16, 0.9),
    twig(0, 12, 7 * k, 17, 0.9),
    twig(0, 14, -3.6, 20, 0.6),
    twig(0, 14, 3.6, 21, 0.6),
    ...lump(0, 21 * top, 9 * k, 5.6 * k),
    ...lump(-7.4 * k, 17.4, 4.6 * k, 3.8 * k),
    ...lump(7.4 * k, 18.4, 4.6 * k, 3.8 * k, true),
    ...lump(-3, 25 * top, 4.6, 2.6, true),
    ...lump(3.6, 24.6, 4.2, 2.6),
  ]
}
const FIG_SPOTS: Readonly<
  Record<number, readonly (readonly [number, number])[]>
> = {
  3: [
    [-6, 15],
    [6, 16],
    [1, 18],
  ],
  4: [
    [-7, 16],
    [7, 17],
    [-1, 19],
    [3, 22],
    [-4, 22],
  ],
  5: [
    [-9, 16],
    [9, 18],
    [-2, 19],
    [4, 23],
    [-5, 24],
    [0, 26],
    [7, 22],
    [-8, 21],
  ],
}
const FIG_VINE = [
  [-6, 5],
  [-7, 4],
  [-7, 3],
  [-6, 2],
  [-6, 1],
  [-5, 0],
  [6, 5],
  [7, 4],
  [7, 3],
  [6, 2],
] as const
export const FIG_STAGES = 6
;(Object.keys(FIG_LOOK) as Season[]).forEach((season) => {
  const look = FIG_LOOK[season]
  for (let stage = 0; stage < FIG_STAGES; stage++) {
    const spots = FIG_SPOTS[stage] ?? []
    specs[`fig/${season}${stage}`] = {
      shapes: figShapes(stage, look),
      feats: [
        ...(look.blossom
          ? spots.flatMap(([a, b]) => [
              feat(a, b, look.blossom!),
              feat(a + 1, b, '#fff4f7'),
            ])
          : []),
        ...(look.fruit && stage >= 4
          ? spots.flatMap(([a, b]) => [
              feat(a, b, look.fruit!),
              feat(a, b - 1, look.fruit!),
              feat(a + 1, b - 1, look.fruit!),
            ])
          : []),
        ...(look.bare && stage >= 2
          ? spots.map(([a, b]) => feat(a, b, '#a9cf7a'))
          : []),
        ...(stage === 5
          ? FIG_VINE.map(([a, b]) =>
              feat(a, b, look.bare ? '#6a5a3a' : '#4f9c47')
            )
          : []),
      ],
    }
  }
})

export const HAT_FRAME_SPECS: Readonly<Record<string, ShapeSpec>> = specs
