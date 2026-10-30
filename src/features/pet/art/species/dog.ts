/**
 * Pup: a golden retriever sitting up, four coats, pixelled by hand in the style
 * of game retriever sprites: no outline, soft golden shading with light streaks
 * in the fur, dot eyes and nose, floppy ears, a light ruff down the chest and a
 * plumed tail.
 *
 * Each part is a grid of palette keys (`.` is empty) painted in the coat's
 * colours: the tail (swayed by the wag), the body, the head (moved down by the
 * bob), then the face for the mood.
 */
import { rgbPalette, type FeaturePixel, type Rgb } from '@/lib/pixelArt'

import { SPRITE_SIZE } from '../layout'
import type { PetFace } from '../types'
import { defineSpecies, type SpritePose } from './define'

/**
 * Tone keys in the grids: fur from deep shade to highlight (`D` `S` `M` `L`
 * `H`), the light ruff and muzzle (`C`, shade `c`) and the ears (`E`, shade
 * `e`).
 */
type Tone = 'D' | 'S' | 'M' | 'L' | 'H' | 'C' | 'c' | 'E' | 'e'

interface DogCoat extends Readonly<Record<Tone, Rgb>> {
  /** Eyes. */
  readonly k: Rgb
  /** Nose. */
  readonly n: Rgb
  /** Inside of the open mouth. */
  readonly m: Rgb
  /** Tongue. */
  readonly t: Rgb
  /** Tongue tip, in shade. */
  readonly T: Rgb
}

/** Rows of palette keys from sprite row `top`, each 32 wide. */
interface Grid {
  readonly top: number
  readonly rows: readonly string[]
}

const TAIL: Grid = {
  top: 11,
  rows: [
    '...........................LH...',
    '..........................LHHL..',
    '.........................MLHLL..',
    '.........................SMLHLM.',
    '........................SMLLHLM.',
    '........................SMLLLLM.',
    '........................SMMLLMS.',
    '........................SMMLMSM.',
    '........................SSMMS.S.',
    '.......................SSMMSM...',
    '.......................SSMS.S...',
    '.......................SMS......',
  ],
}

const BODY: Grid = {
  top: 13,
  rows: [
    '...........MLLLLLLLLM...........',
    '..........MLLSSSSSSLLS..........',
    '..........MLCCCHCCCCLS..........',
    '.........MLCCHCCCCCcLMS.........',
    '.........MLCCCHCCCCcLMS.........',
    '.........MLLCCCHCCcLLMS.........',
    '.........MMLLCCCCcLLMMS.........',
    '.........MMLLLCCcLLLMMS.........',
    '........MMLLMLLCcLLMLMSS........',
    '.......MLLLMSLLHcLLSMLMSS.......',
    '.......MLLLMSLLScSLLSMLMS.......',
    '......MLHLLMSLHSDSHLSMLMSS......',
    '......MLLLLMSLLSDSLLSMLLMS......',
    '......MLLHLMSLLSDSLLSMLLMS......',
    '......MLLLMMSLLSDSLLSMMLMS......',
    '......SMLLMSSLLSDSLLSSMLMS......',
    '......SMMMSSLHLLDLHLLSSMMS......',
    '......SSSS.SMLLMSDMLLMSSSS......',
  ],
}

const HEAD: Grid = {
  top: 3,
  rows: [
    '.............LHHLMS.............',
    '...........MLHHHLLMMS...........',
    '..........MLHHHLHLLMMS..........',
    '.........EMLHHLLLLLMMSe.........',
    '........EEMLLHLLLLLLMSee........',
    '........EEELLLLLLLLMSeee........',
    '........EEEMLLLHHLLMSeee........',
    '........EEEMMLLHHLLMSeee........',
    '........eEESMLHHHHLMSeeE........',
    '........eEESSLHHHHLSSeee........',
    '........E.E.SSLCCLSS.e.e........',
    '..............SccS..............',
  ],
}

/**
 * The left eye's left column and the eyes' top row (the right eye mirrors it).
 * Open eyes are a pixel wide, in the inner column.
 */
const EYE_X = 12
const EYE_Y = 8
/** The nose's top row. */
const NOSE_Y = 12

/**
 * The open mouth for a face, under the nose: the jaw drops two rows to show the
 * dark mouth. Joy grins, its corners up, with the tongue hanging past the chin;
 * surprise gapes, the tongue resting on the jaw.
 */
const MOUTH: Partial<Record<PetFace, Grid>> = {
  joy: {
    top: 13,
    rows: [
      '.............m....m.............',
      '..............mmmm..............',
      '..............mttm..............',
      '.............ScttcS.............',
      '..............SttS..............',
      '...............TT...............',
    ],
  },
  wide: {
    top: 14,
    rows: [
      '..............mmmm..............',
      '..............mmmm..............',
      '.............ScttcS.............',
      '..............STTS..............',
    ],
  },
}

/** The mouth half shut, the jaw a row up, the frame after it was open. */
const MOUTH_CLOSING: Grid = {
  top: 14,
  rows: [
    '..............mmmm..............',
    '.............ScttcS.............',
    '..............STTS..............',
  ],
}

/** `grid`'s pixels in coat `C`, moved down `dy` and across by `dx(y)`. */
function paint(
  grid: Grid,
  C: DogCoat,
  dy = 0,
  dx: (y: number) => number = () => 0
): FeaturePixel[] {
  const out: FeaturePixel[] = []
  grid.rows.forEach((row, i) => {
    const y = grid.top + i
    for (let x = 0; x < row.length; x++) {
      const key = row[x]
      if (key !== '.') out.push([x + dx(y), y + dy, C[key as keyof DogCoat]])
    }
  })
  return out
}

/** Both eyes for `face`, their top row on `y`. */
function eyes(
  face: PetFace,
  blink: boolean,
  y: number,
  C: DogCoat
): FeaturePixel[] {
  const out: FeaturePixel[] = []
  // Each eye has a box two pixels wide; the right box mirrors the left across
  // the centre line.
  for (const x of [EYE_X, SPRITE_SIZE - 2 - EYE_X]) {
    const d = (dx: number, dy: number, c = C.k) => out.push([x + dx, y + dy, c])
    const inner = x === EYE_X ? 1 : 0
    if (face === 'nap' || face === 'dead') {
      d(-1, 0)
      d(0, 1)
      d(1, 1)
      d(2, 0)
    } else if (face === 'joy') {
      d(-1, 1)
      d(0, 0)
      d(1, 0)
      d(2, 1)
    } else if (blink) {
      d(0, 1)
      d(1, 1)
    } else if (face === 'low') {
      // Eyes cast down, under brows raised at the middle.
      d(inner, 1)
      d(inner, 2)
      d(inner, -1, C.D)
      d(1 - inner, 0, C.D)
    } else if (face === 'wide') {
      d(inner, -1)
      d(inner, 0)
      d(inner, 1)
    } else {
      d(inner, 0)
      d(inner, 1)
    }
  }
  return out
}

/**
 * The nose and, when joyful or surprised, the open mouth (half shut the frame
 * after), moved down by the bob.
 */
function muzzle(st: SpritePose, C: DogCoat): FeaturePixel[] {
  const y = NOSE_Y + st.bob
  const mouth = MOUTH[st.face] ?? (st.mouthClosing ? MOUTH_CLOSING : null)
  return [
    [15, y, C.n],
    [16, y, C.n],
    [15, y + 1, C.n],
    [16, y + 1, C.n],
    ...(mouth ? paint(mouth, C, st.bob) : []),
  ]
}

export const dog = defineSpecies<'dog', DogCoat>({
  id: 'dog',
  coats: {
    gold: {
      ...rgbPalette({
        D: '#9a6f22',
        S: '#b88a2c',
        M: '#d4a23a',
        L: '#e9b64c',
        H: '#f8d06c',
        C: '#fadc8e',
        c: '#ecc470',
        E: '#c49230',
        e: '#a87a26',
        k: '#24160e',
        n: '#1e1612',
        m: '#5a2326',
        t: '#f07a86',
        T: '#d65c6c',
      }),
      swatch: ['#d4a23a'],
    },
    white: {
      ...rgbPalette({
        D: '#a8906a',
        S: '#c8b088',
        M: '#e2cfa6',
        L: '#efe0bd',
        H: '#faf0d8',
        C: '#fff8ea',
        c: '#f3e6c8',
        E: '#d8bf92',
        e: '#bfa477',
        k: '#2a1f1a',
        n: '#3a2620',
        m: '#6a2a2c',
        t: '#f07a86',
        T: '#d65c6c',
      }),
      swatch: ['#efe0bd'],
    },
    liver: {
      ...rgbPalette({
        D: '#4e2412',
        S: '#6e361c',
        M: '#8c4b2b',
        L: '#a6603a',
        H: '#c07a4c',
        C: '#cf9466',
        c: '#b77650',
        E: '#7a3e22',
        e: '#5e2e18',
        k: '#1a0e0a',
        n: '#24120c',
        m: '#3e1414',
        t: '#e8707c',
        T: '#cc5464',
      }),
      swatch: ['#8c4b2b'],
    },
    black: {
      ...rgbPalette({
        D: '#141111',
        S: '#221e1e',
        M: '#332d2d',
        L: '#453e3d',
        H: '#5a5251',
        C: '#6a6160',
        c: '#4f4847',
        E: '#2a2525',
        e: '#1c1919',
        k: '#0a0808',
        n: '#0a0808',
        m: '#4a1c20',
        t: '#e8707c',
        T: '#cc5464',
      }),
      swatch: ['#3a3434'],
    },
  },
  build(st, C) {
    const b = st.bob
    // The wag sways the plume in toward the back, the tip furthest.
    const wag = (y: number) =>
      st.tail ? -Math.round(Math.max(0, 18 - y) / 3) : 0
    return {
      shapes: [],
      feats: [
        ...paint(TAIL, C, 0, wag),
        ...paint(BODY, C),
        ...paint(HEAD, C, b),
        ...eyes(st.face, st.blink, EYE_Y + b, C),
        ...muzzle(st, C),
      ],
    }
  },
})
