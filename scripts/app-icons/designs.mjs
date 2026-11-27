import { cardMark, personGlyph, placement, MARK_W, MARK_H } from './mark.mjs'
import { loadHeart, loadPet, pixelSvg } from './pets.mjs'
import {
  SIZE,
  blur,
  dropShadow,
  fmt,
  glow,
  linear,
  radial,
  random,
  rect,
  ridge,
} from './svg.mjs'

const BRAND = { light: '#3FE38A', mid: '#1FCB64', deep: '#119A4B' }

const sun = (defs, id, { cx, cy, r, core = '#FFF6C9', halo = '#FFE07A' }) =>
  `<circle cx="${cx}" cy="${cy}" r="${r * 2.4}" fill="${radial(
    defs,
    id,
    [
      [0, halo, 0.55],
      [1, halo, 0],
    ],
    { cx, cy, r: r * 2.4 }
  )}"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${radial(
    defs,
    id,
    [
      [0, '#FFFFFF'],
      [0.55, core],
      [1, halo],
    ],
    { cx, cy, r }
  )}"/>`

const cloud = (x, y, s, fill = '#fff', opacity = 0.95) =>
  `<g opacity="${opacity}" fill="${fill}">` +
  `<ellipse cx="${x}" cy="${y}" rx="${70 * s}" ry="${34 * s}"/>` +
  `<circle cx="${x - 30 * s}" cy="${y - 18 * s}" r="${34 * s}"/>` +
  `<circle cx="${x + 18 * s}" cy="${y - 30 * s}" r="${42 * s}"/>` +
  `</g>`

const stars = (
  seed,
  count,
  { top = 0, bottom = SIZE, color = '#fff', maxR = 4 }
) => {
  const rand = random(seed)
  let out = ''
  for (let i = 0; i < count; i++) {
    const x = fmt(rand() * SIZE)
    const y = fmt(top + rand() * (bottom - top))
    const r = fmt(1.2 + rand() * maxR)
    const o = fmt(0.45 + rand() * 0.55)
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${o}"/>`
  }
  return out
}

const glint = (defs, id, x, y, r, color = '#FFFFFF') =>
  `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r * 2.6)}" fill="${radial(
    defs,
    id,
    [
      [0, color, 0.55],
      [1, color, 0],
    ],
    { cx: fmt(x), cy: fmt(y), r: fmt(r * 2.6) }
  )}"/>` +
  `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${color}"/>`

const blossom = (x, y, r, rot, petal, center) => {
  let out = `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rot)})">`
  for (let i = 0; i < 5; i++) {
    out += `<ellipse cx="0" cy="${-r * 0.55}" rx="${r * 0.42}" ry="${r * 0.55}" fill="${petal}" transform="rotate(${i * 72})"/>`
  }
  return out + `<circle r="${r * 0.22}" fill="${center}"/></g>`
}

const maple = (x, y, r, rot, fill) => {
  const p = [
    [0, 0.55],
    [0.22, 0.5],
    [0.82, 0.42],
    [0.55, 0.22],
    [0.95, -0.3],
    [0.5, -0.28],
    [0.38, -0.62],
    [0.16, -0.42],
    [0, -0.95],
    [-0.16, -0.42],
    [-0.38, -0.62],
    [-0.5, -0.28],
    [-0.95, -0.3],
    [-0.55, 0.22],
    [-0.82, 0.42],
    [-0.22, 0.5],
  ]
  const d = p
    .map(([px, py], i) => `${i ? 'L' : 'M'} ${fmt(px * r)} ${fmt(py * r)}`)
    .join(' ')
  return (
    `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rot)})">` +
    `<path d="${d} Z" fill="${fill}" stroke="${fill}" stroke-width="${fmt(r * 0.08)}" stroke-linejoin="round"/>` +
    `<path d="M 0 ${fmt(r * 0.5)} L 0 ${fmt(r * 1.05)}" stroke="${fill}" stroke-width="${fmt(r * 0.12)}" stroke-linecap="round"/>` +
    `</g>`
  )
}

const snowflake = (x, y, r, rot, fill, opacity = 1) => {
  const w = fmt(Math.max(r * 0.13, 2.5))
  let arms = ''
  for (let i = 0; i < 6; i++) {
    arms +=
      `<g transform="rotate(${i * 60})">` +
      `<path d="M 0 0 L 0 ${-r}" />` +
      `<path d="M 0 ${-r * 0.55} L ${r * 0.24} ${-r * 0.8} M 0 ${-r * 0.55} L ${-r * 0.24} ${-r * 0.8}"/>` +
      `</g>`
  }
  return `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rot)})" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" fill="none" opacity="${opacity}">${arms}</g>`
}

const scatter = (seed, count, draw, { keepOut = 0.34, margin = 30 } = {}) => {
  const rand = random(seed)
  const half = SIZE / 2
  let out = ''
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 40) {
    const x = margin + rand() * (SIZE - margin * 2)
    const y = margin + rand() * (SIZE - margin * 2)
    const inside =
      Math.abs(x - half) < SIZE * keepOut &&
      Math.abs(y - half - 88) < SIZE * keepOut * 0.72
    if (inside) continue
    out += draw(x, y, rand)
    placed++
  }
  return out
}

const floatingCard = (
  defs,
  id,
  {
    frame,
    panel = '#FFFFFF',
    glyph,
    width = 520,
    cy = 600,
    shadowColor = '#000',
    shadowOpacity = 0.3,
  }
) =>
  cardMark(defs, id, {
    frame,
    panel,
    glyph,
    sheen: true,
    width,
    cy,
    shadow: dropShadow(defs, id, {
      dy: 22,
      blur: 40,
      color: shadowColor,
      opacity: shadowOpacity,
    }),
  })

const Dark = (defs, id) =>
  rect(
    radial(
      defs,
      id,
      [
        [0, '#2C3036'],
        [1, '#08090B'],
      ],
      { cx: 512, cy: 180, r: 900 }
    )
  ) +
  `<ellipse cx="512" cy="560" rx="380" ry="260" fill="${BRAND.mid}" opacity="0.16" filter="${blur(defs, id, 70)}"/>` +
  cardMark(defs, id, {
    frame: linear(defs, id, [
      [0, BRAND.light],
      [1, BRAND.deep],
    ]),
    panel: linear(defs, id, [
      [0, '#1E2126'],
      [1, '#121418'],
    ]),
    glyph: linear(defs, id, [
      [0, '#5CF09E'],
      [1, BRAND.mid],
    ]),
    sheen: true,
    shadow: dropShadow(defs, id, { dy: 24, blur: 46, opacity: 0.6 }),
  })

const GOLD_FOIL = [
  [0, '#FFF1B8'],
  [0.28, '#E2B54A'],
  [0.5, '#FBE39A'],
  [0.74, '#B8862A'],
  [1, '#F2D27A'],
]

const Gold = (defs, id) =>
  rect(
    radial(
      defs,
      id,
      [
        [0, '#2E2614'],
        [0.6, '#15110A'],
        [1, '#070604'],
      ],
      { cx: 512, cy: 300, r: 820 }
    )
  ) +
  scatter(
    11,
    16,
    (x, y, rand) => glint(defs, id, x, y, 3 + rand() * 6, '#F6D77E'),
    { keepOut: 0.36 }
  ) +
  cardMark(defs, id, {
    frame: linear(defs, id, GOLD_FOIL, [0, 0, 1, 1]),
    panel: linear(defs, id, [
      [0, '#211B10'],
      [1, '#120F09'],
    ]),
    glyph: linear(defs, id, GOLD_FOIL, [0, 0, 1, 1]),
    sheen: true,
    shadow: dropShadow(defs, id, { dy: 26, blur: 50, opacity: 0.7 }),
  })

const Mono = (defs, id) =>
  rect(
    linear(defs, id, [
      [0, '#1C1C1E'],
      [1, '#000000'],
    ])
  ) +
  cardMark(defs, id, {
    frame: '#FFFFFF',
    panel: '#000000',
    glyph: '#FFFFFF',
    shadow: dropShadow(defs, id, { dy: 20, blur: 40, opacity: 0.5 }),
  })

const Minimalist = (defs, id) =>
  rect(
    linear(
      defs,
      id,
      [
        [0, '#4BEA93'],
        [1, '#0E9F52'],
      ],
      [0, 0, 0.6, 1]
    )
  ) +
  rect(
    radial(
      defs,
      id,
      [
        [0, '#FFFFFF', 0.28],
        [1, '#FFFFFF', 0],
      ],
      { cx: 300, cy: 140, r: 700 }
    )
  ) +
  `<g filter="${dropShadow(defs, id, { dy: 18, blur: 36, color: '#04532A', opacity: 0.35 })}">` +
  personGlyph({ fill: '#FFFFFF', height: 470, cy: 520 }) +
  `</g>`

const colorTile =
  (top, bottom, glyphTop = top, glyphBottom = bottom) =>
  (defs, id) =>
    rect(
      linear(
        defs,
        id,
        [
          [0, top],
          [1, bottom],
        ],
        [0.2, 0, 0.8, 1]
      )
    ) +
    rect(
      radial(
        defs,
        id,
        [
          [0, '#FFFFFF', 0.3],
          [1, '#FFFFFF', 0],
        ],
        { cx: 260, cy: 120, r: 720 }
      )
    ) +
    cardMark(defs, id, {
      frame: linear(defs, id, [
        [0, '#FFFFFF', 0.7],
        [1, '#FFFFFF', 0.42],
      ]),
      panel: '#FFFFFF',
      glyph: linear(defs, id, [
        [0, glyphTop],
        [1, glyphBottom],
      ]),
      shadow: dropShadow(defs, id, {
        dy: 24,
        blur: 44,
        color: bottom,
        opacity: 0.55,
      }),
    })

const Cherry = colorTile('#FF6B7A', '#D3123B')
const Tangerine = colorTile('#FFB04D', '#F2560F')
const Lemon = colorTile('#FFE86B', '#F5B400', '#F5B400', '#E08A00')
const Lagoon = colorTile('#4BE3D2', '#0A9BAE')
const Sky = colorTile('#7FD3FF', '#1C8CF0')
const Blueberry = colorTile('#6E8BFF', '#3236C9')
const Grape = colorTile('#C08BFF', '#7429D6')
const Bubblegum = colorTile('#FF9AD5', '#E83F9C')

const Paradise = (defs, id) =>
  rect(
    linear(defs, id, [
      [0, '#4FB8F5'],
      [0.7, '#BEEBFF'],
    ])
  ) +
  sun(defs, id, { cx: 780, cy: 210, r: 92 }) +
  cloud(230, 190, 1.25) +
  cloud(620, 120, 0.8, '#fff', 0.85) +
  `<path d="${ridge([
    [0, 690],
    [260, 610],
    [560, 680],
    [820, 600],
    [1024, 650],
  ])}" fill="#9DE38A"/>` +
  `<path d="${ridge([
    [0, 790],
    [300, 720],
    [640, 800],
    [1024, 730],
  ])}" fill="#58C46C"/>` +
  `<path d="${ridge([
    [0, 900],
    [380, 850],
    [760, 910],
    [1024, 870],
  ])}" fill="#2E9F55"/>` +
  floatingCard(defs, id, {
    frame: linear(defs, id, [
      [0, BRAND.light],
      [1, BRAND.deep],
    ]),
    glyph: BRAND.mid,
    shadowColor: '#0B4A2A',
  })

const Sunrise = (defs, id) =>
  rect(
    linear(defs, id, [
      [0, '#FF7E6B'],
      [0.45, '#FFB36B'],
      [0.75, '#FFE3A3'],
    ])
  ) +
  sun(defs, id, {
    cx: 512,
    cy: 700,
    r: 210,
    core: '#FFF4D2',
    halo: '#FFD27A',
  }) +
  `<path d="${ridge([
    [0, 720],
    [300, 650],
    [620, 730],
    [1024, 660],
  ])}" fill="#E0727F"/>` +
  `<path d="${ridge([
    [0, 820],
    [340, 770],
    [700, 840],
    [1024, 780],
  ])}" fill="#A84C78"/>` +
  `<path d="${ridge([
    [0, 920],
    [420, 880],
    [800, 930],
    [1024, 900],
  ])}" fill="#5E2B66"/>` +
  floatingCard(defs, id, {
    frame: linear(defs, id, [
      [0, '#8C3D7A'],
      [1, '#4E2160'],
    ]),
    panel: '#FFF8EE',
    glyph: linear(defs, id, [
      [0, '#FF9A5A'],
      [1, '#F0566E'],
    ]),
    shadowColor: '#4E1F4A',
  })

const wave = (y, amp, len, phase = 0) => {
  const pts = []
  for (let x = -len; x <= SIZE + len; x += len / 2) {
    const i = Math.round((x + phase) / (len / 2))
    pts.push([x + phase, y + (i % 2 === 0 ? -amp : amp)])
  }
  return ridge(pts)
}

const Ocean = (defs, id) =>
  rect(
    linear(defs, id, [
      [0, '#7FD4FF'],
      [0.6, '#D8F4FF'],
    ])
  ) +
  sun(defs, id, { cx: 230, cy: 200, r: 80 }) +
  cloud(760, 170, 1, '#fff', 0.9) +
  `<path d="${wave(640, 14, 220)}" fill="#3FB6EA"/>` +
  `<path d="${wave(730, 18, 260, 90)}" fill="#1E95D6"/>` +
  `<path d="${wave(830, 20, 300, 40)}" fill="#0F73BB"/>` +
  `<path d="${wave(930, 22, 340, 150)}" fill="#0A5598"/>` +
  floatingCard(defs, id, {
    frame: linear(defs, id, [
      [0, '#2D8FE0'],
      [1, '#0B4F8F'],
    ]),
    glyph: linear(defs, id, [
      [0, '#33B5F5'],
      [1, '#1373C8'],
    ]),
    shadowColor: '#06345E',
  })

const peak = (cx, base, w, h, fill, snow) => {
  const l = cx - w / 2
  const r = cx + w / 2
  const top = base - h
  const sy = top + h * 0.28
  const sl = cx - (w / 2) * 0.28
  const sr = cx + (w / 2) * 0.28
  return (
    `<path d="M ${l} ${base} L ${cx} ${top} L ${r} ${base} Z" fill="${fill}"/>` +
    `<path d="M ${sl} ${sy} L ${cx} ${top} L ${sr} ${sy} L ${cx + w * 0.06} ${sy - 18} L ${cx - w * 0.03} ${sy + 6} L ${cx - w * 0.09} ${sy - 14} Z" fill="${snow}"/>`
  )
}

const pine = (x, base, h, fill) =>
  `<path d="M ${x} ${base - h} L ${x + h * 0.28} ${base} L ${x - h * 0.28} ${base} Z" fill="${fill}"/>`

const forest = (
  seed,
  base,
  fill,
  { minH = 70, maxH = 130, step = 46 } = {}
) => {
  const rand = random(seed)
  let out = ''
  for (let x = -20; x < SIZE + 40; x += step * (0.7 + rand() * 0.6)) {
    out += pine(
      fmt(x),
      base + rand() * 20,
      fmt(minH + rand() * (maxH - minH)),
      fill
    )
  }
  return (
    out +
    `<rect x="0" y="${base}" width="${SIZE}" height="${SIZE - base}" fill="${fill}"/>`
  )
}

const Mountains = (defs, id) =>
  rect(
    linear(defs, id, [
      [0, '#8DB8FF'],
      [0.7, '#E6F0FF'],
    ])
  ) +
  peak(250, 760, 620, 470, '#8EA2D8', '#F4F7FF') +
  peak(760, 760, 700, 560, '#6F86C6', '#FFFFFF') +
  peak(520, 800, 520, 330, '#5469AE', '#EEF2FF') +
  forest(5, 860, '#1F5B4A') +
  floatingCard(defs, id, {
    frame: linear(defs, id, [
      [0, '#4C78D6'],
      [1, '#27428F'],
    ]),
    glyph: linear(defs, id, [
      [0, '#5C8BF0'],
      [1, '#2E4FA8'],
    ]),
    shadowColor: '#14214A',
  })

const crescent = (defs, id, cx, cy, r, fill) => {
  const mask = id('moon')
  defs.push(
    `<mask id="${mask}"><rect width="${SIZE}" height="${SIZE}" fill="#fff"/><circle cx="${cx + r * 0.42}" cy="${cy - r * 0.28}" r="${r * 0.86}" fill="#000"/></mask>`
  )
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r * 2.2}" fill="${radial(
      defs,
      id,
      [
        [0, fill, 0.35],
        [1, fill, 0],
      ],
      { cx, cy, r: r * 2.2 }
    )}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" mask="url(#${mask})"/>`
  )
}

const NightSky = (defs, id) =>
  rect(
    linear(defs, id, [
      [0, '#070B2A'],
      [0.6, '#1B2368'],
      [1, '#4A3A93'],
    ])
  ) +
  stars(21, 90, { bottom: 760, maxR: 3 }) +
  glint(defs, id, 170, 210, 9) +
  glint(defs, id, 880, 560, 7) +
  glint(defs, id, 120, 600, 6) +
  crescent(defs, id, 800, 200, 92, '#FFF2C2') +
  `<path d="${ridge([
    [0, 860],
    [320, 800],
    [700, 870],
    [1024, 820],
  ])}" fill="#0C1240"/>` +
  floatingCard(defs, id, {
    frame: linear(defs, id, [
      [0, '#5560D9'],
      [1, '#2A2F8F'],
    ]),
    panel: '#FFF8E1',
    glyph: linear(defs, id, [
      [0, '#4D59D0'],
      [1, '#232A7C'],
    ]),
    shadowColor: '#000016',
    shadowOpacity: 0.55,
  })

const ribbon = (defs, id, d, stops, width, b) =>
  `<path d="${d}" fill="none" stroke="${linear(defs, id, stops, [0, 0, 1, 0])}" stroke-width="${width}" stroke-linecap="round" filter="${blur(defs, id, b)}"/>`

const Aurora = (defs, id) =>
  rect(
    linear(defs, id, [
      [0, '#03101F'],
      [0.7, '#082B3A'],
      [1, '#0B3B45'],
    ])
  ) +
  stars(33, 70, { bottom: 700, maxR: 2.6 }) +
  ribbon(
    defs,
    id,
    'M -60 420 C 200 200 420 520 640 300 S 980 180 1100 260',
    [
      [0, '#3CFFB0', 0],
      [0.3, '#3CFFB0', 0.9],
      [0.7, '#2BD6FF', 0.85],
      [1, '#9B6BFF', 0],
    ],
    120,
    34
  ) +
  ribbon(
    defs,
    id,
    'M -60 560 C 260 380 480 600 700 420 S 980 360 1100 420',
    [
      [0, '#9B6BFF', 0],
      [0.4, '#5CFFC2', 0.7],
      [1, '#3CFFB0', 0],
    ],
    70,
    26
  ) +
  forest(9, 880, '#020A12', { minH: 90, maxH: 170, step: 40 }) +
  floatingCard(defs, id, {
    frame: linear(defs, id, [
      [0, '#2CE6A6'],
      [1, '#128E8C'],
    ]),
    glyph: linear(defs, id, [
      [0, '#22CFA0'],
      [1, '#0F6E7E'],
    ]),
    shadowColor: '#000',
    shadowOpacity: 0.55,
  })

const season =
  ({ sky, hills, frame, glyph, extras }) =>
  (defs, id) =>
    rect(
      linear(defs, id, [
        [0, sky[0]],
        [0.75, sky[1]],
      ])
    ) +
    (extras.back?.(defs, id) ?? '') +
    `<path d="${ridge([
      [0, 760],
      [280, 700],
      [640, 780],
      [1024, 710],
    ])}" fill="${hills[0]}"/>` +
    `<path d="${ridge([
      [0, 880],
      [360, 830],
      [740, 900],
      [1024, 850],
    ])}" fill="${hills[1]}"/>` +
    floatingCard(defs, id, {
      frame: linear(defs, id, [
        [0, frame[0]],
        [1, frame[1]],
      ]),
      glyph: linear(defs, id, [
        [0, glyph[0]],
        [1, glyph[1]],
      ]),
      shadowColor: frame[1],
      shadowOpacity: 0.4,
    }) +
    (extras.front?.(defs, id) ?? '')

const SeasonalSpring = season({
  sky: ['#FFD3E4', '#E6F6FF'],
  hills: ['#B5E8A1', '#7CCB76'],
  frame: ['#FF9CC5', '#E8558F'],
  glyph: ['#FF7FB0', '#D9417D'],
  extras: {
    front: () =>
      scatter(4, 11, (x, y, rand) =>
        blossom(
          x,
          y,
          26 + rand() * 22,
          rand() * 72,
          rand() > 0.4 ? '#FF9CC5' : '#FFFFFF',
          '#FFD84D'
        )
      ),
  },
})

const SeasonalSummer = season({
  sky: ['#3FBDFF', '#C9F0FF'],
  hills: ['#2BA9E6', '#FFE2A0'],
  frame: ['#FFC54D', '#F28A12'],
  glyph: ['#FFB23F', '#EE7A0E'],
  extras: {
    back: (defs, id) =>
      sun(defs, id, { cx: 820, cy: 190, r: 96 }) + cloud(200, 180, 1.1),
  },
})

const SeasonalFall = season({
  sky: ['#FFB866', '#FFE9C2'],
  hills: ['#E58A3C', '#B94E26'],
  frame: ['#F07A2E', '#B53A1A'],
  glyph: ['#EC6A26', '#B33A1C'],
  extras: {
    front: () => {
      const colors = ['#D9441E', '#F29A1F', '#B8321B', '#F5C02E']
      return scatter(8, 10, (x, y, rand) =>
        maple(
          x,
          y,
          28 + rand() * 20,
          rand() * 80 - 40,
          colors[Math.floor(rand() * colors.length)]
        )
      )
    },
  },
})

const SeasonalWinter = season({
  sky: ['#BFDDFF', '#F3F8FF'],
  hills: ['#E4EEFB', '#FFFFFF'],
  frame: ['#73A6F0', '#3C6CC8'],
  glyph: ['#6A9DEB', '#355FB8'],
  extras: {
    front: () =>
      scatter(12, 14, (x, y, rand) =>
        snowflake(
          x,
          y,
          20 + rand() * 22,
          rand() * 60,
          rand() > 0.45 ? '#FFFFFF' : '#7FAAF0',
          0.95
        )
      ),
  },
})

const Neon = (defs, id) => {
  const horizon = 640
  let grid = ''
  for (let i = -10; i <= 10; i++) {
    grid += `<line x1="${512 + i * 40}" y1="${horizon}" x2="${512 + i * 210}" y2="${SIZE}" />`
  }
  for (let k = 0; k < 7; k++) {
    const y = horizon + Math.pow(k / 6, 1.9) * (SIZE - horizon)
    grid += `<line x1="0" y1="${fmt(y)}" x2="${SIZE}" y2="${fmt(y)}" />`
  }
  return (
    rect(
      linear(defs, id, [
        [0, '#0B0222'],
        [0.62, '#2A0A5C'],
        [0.63, '#12052E'],
        [1, '#07010F'],
      ])
    ) +
    stars(41, 40, { bottom: 560, maxR: 2.2 }) +
    `<g stroke="#B04CFF" stroke-width="3" opacity="0.6" filter="${glow(defs, id, { blur: 6 })}">${grid}</g>` +
    cardMark(defs, id, {
      stroke: '#FF4FB8',
      glyph: '#3FF4FF',
      strokeWidth: 20,
      width: 620,
      cy: 470,
      shadow: glow(defs, id, { blur: 16 }),
    })
  )
}

const Glass = (defs, id) => {
  const blobs = (soft) =>
    `<g filter="${blur(defs, id, soft)}">` +
    `<circle cx="250" cy="260" r="260" fill="#FF6FB1"/>` +
    `<circle cx="820" cy="300" r="250" fill="#FFB547"/>` +
    `<circle cx="720" cy="820" r="300" fill="#5C7CFF"/>` +
    `<circle cx="200" cy="820" r="230" fill="#3EE0C4"/>` +
    `</g>`
  const { transform } = placement({ width: 640, cy: 520 })
  const clip = id('glass')
  defs.push(
    `<clipPath id="${clip}"><rect width="${MARK_W}" height="${MARK_H}" rx="61" transform="${transform}"/></clipPath>`
  )
  return (
    rect('#F4EEFF') +
    blobs(60) +
    `<g filter="${dropShadow(defs, id, { dy: 24, blur: 50, color: '#3B2A80', opacity: 0.3 })}">` +
    `<g clip-path="url(#${clip})">${rect('#F4EEFF')}${blobs(140)}${rect('#FFFFFF', 'opacity="0.38"')}</g>` +
    `</g>` +
    cardMark(defs, id, {
      frame: 'none',
      panel: '#FFFFFF',
      glyph: linear(defs, id, [
        [0, '#B06BFF'],
        [1, '#5C7CFF'],
      ]),
      width: 640,
      cy: 520,
    }) +
    `<rect width="${MARK_W}" height="${MARK_H}" rx="61" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="5" transform="${transform}"/>`
  )
}

const PIXEL_SPRITE = [
  '.FFFFFFFFFFFFFFFFFFFF.',
  'FLLLLLLLLLLLLLLLLLLLLF',
  'FFFFFFFFFFFFFFFFFFFFFF',
  'FFPPPPPPPPPPPPPPPPPPFF',
  'FFPPPPGGGGPPPPPPPPPPFF',
  'FFPPPGGGGGGPPGGGGGGPFF',
  'FFPPPGGGGGGPPGGGGGGPFF',
  'FFPPPGGGGGGPPPPPPPPPFF',
  'FFPPPGGGGGGPPPPPPPPPFF',
  'FFPPPPGGGGPPPGGGGGGPFF',
  'FFPPPPPPPPPPPGGGGGGPFF',
  'FFPPPPPPPPPPPPPPPPPPFF',
  'FFPPPPGGGGPPPPPPPPPPFF',
  'FFPPGGGGGGGGPPPPPPPPFF',
  'FFPGGGGGGGGGGPPPPPPPFF',
  'FFPGGGGGGGGGGPPPPPPPFF',
  '.FFFFFFFFFFFFFFFFFFFF.',
]

const Pixel = () => {
  const cell = 32
  const colors = { F: '#22B85C', L: '#5BE896', P: '#FFFFFF', G: '#1C9E4F' }
  const ox = (SIZE - PIXEL_SPRITE[0].length * cell) / 2
  const oy = 7 * cell
  let pixels = ''
  let shadow = ''
  PIXEL_SPRITE.forEach((row, gy) => {
    ;[...row].forEach((kind, gx) => {
      if (kind === '.') return
      const x = ox + gx * cell
      const y = oy + gy * cell
      pixels += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${colors[kind]}"/>`
      shadow += `<rect x="${x + cell}" y="${y + cell}" width="${cell}" height="${cell}"/>`
    })
  })
  let checker = ''
  for (let gy = 0; gy < SIZE / 64; gy++) {
    for (let gx = gy % 2; gx < SIZE / 64; gx += 2) {
      checker += `<rect x="${gx * 64}" y="${gy * 64}" width="64" height="64"/>`
    }
  }
  return (
    rect('#FFD25C') +
    `<g fill="#FFC23A">${checker}</g>` +
    `<g fill="#B8741A" opacity="0.5">${shadow}</g>` +
    pixels
  )
}

const Blueprint = (defs, id) => {
  let grid = ''
  for (let v = 0; v <= SIZE; v += 32) {
    const major = v % 128 === 0
    const attrs = `stroke="#FFFFFF" stroke-opacity="${major ? 0.22 : 0.09}" stroke-width="${major ? 2.5 : 1.5}"`
    grid += `<line x1="${v}" y1="0" x2="${v}" y2="${SIZE}" ${attrs}/><line x1="0" y1="${v}" x2="${SIZE}" y2="${v}" ${attrs}/>`
  }
  const { x, y, scale } = placement({ width: 600, cy: 540 })
  const w = MARK_W * scale
  const h = MARK_H * scale
  const dim =
    'stroke="#FFFFFF" stroke-width="4" stroke-opacity="0.85" fill="none" stroke-linecap="round"'
  const arrows =
    `<path d="M ${x} ${y - 70} L ${x + w} ${y - 70} M ${x} ${y - 92} L ${x} ${y - 48} M ${x + w} ${y - 92} L ${x + w} ${y - 48}" ${dim}/>` +
    `<path d="M ${x + 24} ${y - 84} L ${x} ${y - 70} L ${x + 24} ${y - 56} M ${x + w - 24} ${y - 84} L ${x + w} ${y - 70} L ${x + w - 24} ${y - 56}" ${dim}/>` +
    `<path d="M ${x + w + 70} ${y} L ${x + w + 70} ${y + h} M ${x + w + 48} ${y} L ${x + w + 92} ${y} M ${x + w + 48} ${y + h} L ${x + w + 92} ${y + h}" ${dim}/>` +
    `<path d="M ${x + w + 56} ${y + 24} L ${x + w + 70} ${y} L ${x + w + 84} ${y + 24} M ${x + w + 56} ${y + h - 24} L ${x + w + 70} ${y + h} L ${x + w + 84} ${y + h - 24}" ${dim}/>` +
    `<circle cx="${x + 234 * scale}" cy="${y + 252 * scale}" r="${110 * scale}" fill="none" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="3" stroke-dasharray="10 10"/>`
  return (
    rect(
      radial(
        defs,
        id,
        [
          [0, '#2F74D0'],
          [1, '#123E86'],
        ],
        { cx: 512, cy: 420, r: 760 }
      )
    ) +
    grid +
    arrows +
    cardMark(defs, id, {
      stroke: '#FFFFFF',
      glyph: '#FFFFFF',
      strokeWidth: 14,
      width: 600,
      cy: 540,
    })
  )
}

const Retro = (defs, id) => {
  const bands = ['#F15A24', '#F7931E', '#FBB03B', '#8C4A2F']
  const stripes = bands
    .map(
      (c, i) =>
        `<path d="M ${-200 + i * 130} ${SIZE + 50} L ${SIZE + 50} ${-200 + i * 130}" stroke="${c}" stroke-width="120"/>`
    )
    .join('')
  const place = { width: 620, cy: 500 }
  const { transform } = placement(place)
  return (
    rect('#FFF1D6') +
    `<g transform="translate(0 260)">${stripes}</g>` +
    `<g transform="translate(22 22)"><rect width="${MARK_W}" height="${MARK_H}" rx="61" fill="#3A1C12" transform="${transform}"/></g>` +
    cardMark(defs, id, {
      frame: '#5B2E1E',
      panel: '#FFF1D6',
      glyph: '#F15A24',
      ...place,
    })
  )
}

const Sticker = (defs, id) => {
  const { transform } = placement({ width: 600, cy: 520 })
  const dots = (() => {
    let out = ''
    for (let y = 16; y < SIZE; y += 64) {
      for (let x = (y / 64) % 2 ? 48 : 16; x < SIZE; x += 64)
        out += `<circle cx="${x}" cy="${y}" r="7"/>`
    }
    return out
  })()
  return (
    rect(
      linear(defs, id, [
        [0, '#7CE0FF'],
        [1, '#3AA8F5'],
      ])
    ) +
    `<g fill="#FFFFFF" opacity="0.22">${dots}</g>` +
    `<g transform="rotate(-8 512 520)" filter="${dropShadow(defs, id, { dy: 22, blur: 30, color: '#0A3C73', opacity: 0.4 })}">` +
    `<rect width="${MARK_W}" height="${MARK_H}" rx="61" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="64" stroke-linejoin="round" transform="${transform}"/>` +
    cardMark(defs, id, {
      frame: linear(defs, id, [
        [0, BRAND.light],
        [1, BRAND.deep],
      ]),
      panel: '#FFFFFF',
      glyph: BRAND.mid,
      sheen: true,
      width: 600,
      cy: 520,
    }) +
    `</g>` +
    glint(defs, id, 160, 180, 16) +
    glint(defs, id, 870, 860, 12) +
    glint(defs, id, 880, 170, 8)
  )
}

const PET_CARD = { width: 440, cy: 715 }
const PET_SCALE = 14
const PAIR_CARD = { width: 560, cy: 700 }

const sittingPets = (defs, id, pets, scale, card = PET_CARD) => {
  const { y: cardTop } = placement(card)
  const bottom = cardTop + scale * 2
  const shadow = blur(defs, id, 10)
  return pets
    .map(({ species, coat, cx = 512 }) => {
      const pet = loadPet(species, coat)
      const w = pet.box.w * scale
      return (
        `<ellipse cx="${cx}" cy="${bottom - scale}" rx="${w * 0.42}" ry="${scale * 1.6}" fill="#000" opacity="0.22" filter="${shadow}"/>` +
        pixelSvg(pet, { cx, bottom, scale })
      )
    })
    .join('')
}

const hearts = (spots) => {
  const heart = loadHeart()
  return spots
    .map(([cx, bottom, scale]) => pixelSvg(heart, { cx, bottom, scale }))
    .join('')
}

const petCardMark = (defs, id, card = PET_CARD) =>
  cardMark(defs, id, {
    frame: linear(defs, id, [
      [0, BRAND.light],
      [1, BRAND.deep],
    ]),
    panel: '#FFFFFF',
    glyph: BRAND.mid,
    sheen: true,
    ...card,
    shadow: dropShadow(defs, id, { dy: 22, blur: 40, opacity: 0.28 }),
  })

const petTile =
  ({ top, bottom, species, coat }) =>
  (defs, id) =>
    rect(
      linear(
        defs,
        id,
        [
          [0, top],
          [1, bottom],
        ],
        [0.2, 0, 0.8, 1]
      )
    ) +
    rect(
      radial(
        defs,
        id,
        [
          [0, '#FFFFFF', 0.45],
          [1, '#FFFFFF', 0],
        ],
        {
          cx: 512,
          cy: 330,
          r: 420,
        }
      )
    ) +
    hearts([
      [170, 300, 15],
      [860, 230, 12],
    ]) +
    petCardMark(defs, id) +
    sittingPets(defs, id, [{ species, coat }], PET_SCALE)

const PetLion = petTile({ top: '#FFE7A6', bottom: '#F4A23C', species: 'lion' })
const PetDog = petTile({ top: '#C9EBFF', bottom: '#4FA8F0', species: 'dog' })
const PetCat = petTile({ top: '#E8DEFF', bottom: '#9C80EE', species: 'cat' })
const PetDonkey = petTile({
  top: '#CFF5EF',
  bottom: '#3FB5A8',
  species: 'donkey',
})
const PetLamb = petTile({ top: '#FFE4DA', bottom: '#F29A86', species: 'lamb' })

const PetLionAndLamb = (defs, id) =>
  rect(
    linear(defs, id, [
      [0, '#4FB8F5'],
      [0.7, '#BEEBFF'],
    ])
  ) +
  sun(defs, id, { cx: 512, cy: 230, r: 86 }) +
  cloud(190, 170, 1.05) +
  cloud(850, 140, 0.8, '#fff', 0.85) +
  `<path d="${ridge([
    [0, 690],
    [260, 620],
    [560, 680],
    [820, 610],
    [1024, 650],
  ])}" fill="#9DE38A"/>` +
  `<path d="${ridge([
    [0, 820],
    [300, 760],
    [640, 830],
    [1024, 770],
  ])}" fill="#58C46C"/>` +
  `<path d="${ridge([
    [0, 930],
    [380, 890],
    [760, 940],
    [1024, 900],
  ])}" fill="#2E9F55"/>` +
  petCardMark(defs, id, PAIR_CARD) +
  sittingPets(
    defs,
    id,
    [
      { species: 'lion', cx: 372 },
      { species: 'lamb', cx: 658 },
    ],
    10.5,
    PAIR_CARD
  )

export const DESIGNS = {
  Dark,
  Gold,
  Mono,
  Minimalist,
  Cherry,
  Tangerine,
  Lemon,
  Lagoon,
  Sky,
  Blueberry,
  Grape,
  Bubblegum,
  Paradise,
  Sunrise,
  Ocean,
  Mountains,
  NightSky,
  Aurora,
  SeasonalSpring,
  SeasonalSummer,
  SeasonalFall,
  SeasonalWinter,
  PetLion,
  PetDog,
  PetCat,
  PetDonkey,
  PetLamb,
  PetLionAndLamb,
  Neon,
  Glass,
  Pixel,
  Blueprint,
  Retro,
  Sticker,
}
