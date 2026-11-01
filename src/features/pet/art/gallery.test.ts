import fs from 'node:fs'
import path from 'node:path'

import { describe, it } from 'vitest'

import { crop, scaleNearest, type PixelBuffer } from '@/lib/pixelArt'
import { HAT_IDS } from '@/types/pet'

import { ENTRANCES, TRICKS, WAKE, type MotionTable } from '../motion'
import {
  composeScene,
  createScenePlayer,
  DEMO_SIGN_DATA,
  heartFills,
  heartIcon,
  idlePose,
  lampSprite,
  PET_SPECIES_IDS,
  petSprite,
  ROOM_PARTS,
  SEASONS,
  SPECIES,
  TIMES_OF_DAY,
  VIEW_CARD,
  VIEW_SIGN,
  greyModeFor,
  type PetMood,
  type PetSpeciesId,
  type ResolvedRoom,
  type SceneInput,
} from '.'
import { encodePng } from './testing/png'
import { SCENES } from './testing/scenes'
import { contactSheet } from './testing/sheet'

const OUT = path.join(process.cwd(), '.verify', 'pet-gallery')
const MOODS: PetMood[] = [
  'happy',
  'content',
  'ok',
  'low',
  'weak',
  'nap',
  'dead',
  'joy',
  'wide',
]

const ROOM: ResolvedRoom = {
  time: 'night',
  season: 'summer',
  wallColor: 'sand',
  wallPattern: 'dots',
  floor: 'wood',
  bed: 'rug',
  shelf: 'scrolls',
  lamp: 'clay',
  sign: 'none',
}

function write(name: string, buf: PixelBuffer, scale = 4): void {
  const file = path.join(OUT, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encodePng(scaleNearest(buf, scale)))
}

function scene(
  room: Partial<ResolvedRoom>,
  extra: Partial<SceneInput> = {},
  t = 0
): PixelBuffer {
  return composeScene(
    {
      room: { ...ROOM, ...room },
      sign: DEMO_SIGN_DATA,
      lampLevel: 4,
      pet: null,
      ...extra,
    },
    t
  )
}

function motionStrip(
  species: PetSpeciesId,
  kind: 'entrance' | 'trick' | 'wake'
): PixelBuffer {
  const table: MotionTable =
    kind === 'entrance'
      ? ENTRANCES[species]
      : kind === 'trick'
        ? TRICKS[species]
        : WAKE
  const player = createScenePlayer({ seed: 3 })
  const t0 = 1000
  if (kind === 'entrance') player.playEntrance(species, t0)
  else if (kind === 'trick') player.playTrick(species, t0)
  else player.playWake(t0)
  const frames: PixelBuffer[] = []
  for (let u = 0; u <= table.durationMs + 100; u += 100) {
    const { buffer } = player.frame(
      {
        room: { ...ROOM, time: 'dusk', season: 'autumn' },
        sign: DEMO_SIGN_DATA,
        lampLevel: kind === 'wake' ? 0 : 4,
        pet: {
          species,
          coat: SPECIES[species].defaultCoat,
          mood: kind === 'wake' ? 'dead' : 'happy',
          seed: 1000,
        },
      },
      t0 + u
    )
    if (u % 200 === 0) frames.push(crop(buffer, VIEW_CARD))
  }
  return contactSheet(frames, 4)
}

describe.runIf(process.env.PET_GALLERY === '1')('pet gallery', () => {
  it('writes every sprite, part, room and motion', () => {
    fs.rmSync(OUT, { recursive: true, force: true })

    for (const species of PET_SPECIES_IDS) {
      const cells: PixelBuffer[] = []
      for (const coat of SPECIES[species].coatIds) {
        for (const mood of MOODS) {
          const pose = idlePose(mood, 0, 1000)
          const sprite = petSprite(species, coat, {
            ...pose,
            grey: greyModeFor(mood),
          })
          write(`sprites/${species}-${coat}-${mood}.png`, sprite)
          cells.push(sprite)
        }
      }
      write(
        `sheets/sprites-${species}.png`,
        contactSheet(cells, MOODS.length, 2),
        6
      )
    }

    const BIG_SIGN_DATA = {
      ...DEMO_SIGN_DATA,
      monthMinutes: 80010,
      yearMinutes: 800010,
      planMinutes: 8010,
      conversations: 1333,
      returnVisits: 133,
    }
    for (const digits of ['latn', 'arab'] as const) {
      const signFor = (
        sign: SceneInput['room']['sign'],
        data = DEMO_SIGN_DATA
      ) =>
        crop(
          composeScene(
            {
              room: {
                ...ROOM,
                sign,
                wallColor: 'cream',
                wallPattern: 'plain',
                time: 'day',
              },
              sign: { ...data, digits },
              lampLevel: 4,
              pet: null,
            },
            0
          ),
          VIEW_SIGN
        )
      const signs = ROOM_PARTS.sign.options.map((sign) => signFor(sign))
      signs.forEach((s, i) =>
        write(`signs/${digits}-${ROOM_PARTS.sign.options[i]}.png`, s, 6)
      )
      write(`sheets/signs-${digits}.png`, contactSheet(signs, 3), 5)
      const big = ROOM_PARTS.sign.options
        .filter((sign) => sign !== 'none')
        .map((sign) => signFor(sign, BIG_SIGN_DATA))
      write(`sheets/signs-${digits}-large.png`, contactSheet(big, 5), 5)
    }

    const windows: PixelBuffer[] = []
    for (const time of TIMES_OF_DAY) {
      for (const season of SEASONS) {
        windows.push(crop(scene({ time, season }), [10, 6, 56, 44]))
      }
    }
    for (const time of TIMES_OF_DAY) {
      windows.push(
        crop(
          scene({ time, season: 'spring' }, { moments: { rainbow: true } }),
          [10, 6, 56, 44]
        )
      )
    }
    write('sheets/parts-window.png', contactSheet(windows, 4), 5)

    const walls = ROOM_PARTS.wallColor.options.flatMap((wallColor) =>
      ROOM_PARTS.wallPattern.options.map((wallPattern) =>
        crop(scene({ wallColor, wallPattern, time: 'day' }), [60, 0, 120, 60])
      )
    )
    write('sheets/parts-wall.png', contactSheet(walls, 4), 3)
    write(
      'sheets/parts-floor.png',
      contactSheet(
        ROOM_PARTS.floor.options.map((floor) =>
          crop(scene({ floor, time: 'day' }, { lampLevel: 5 }), [0, 56, 72, 40])
        ),
        4
      ),
      5
    )
    write(
      'sheets/parts-bed.png',
      contactSheet(
        ROOM_PARTS.bed.options.map((bed) =>
          crop(
            scene(
              { bed, time: 'day' },
              {
                pet: {
                  species: 'dog',
                  coat: 'gold',
                  mood: 'happy',
                  seed: 1000,
                },
              }
            ),
            [28, 46, 82, 52]
          )
        ),
        2
      ),
      5
    )
    write(
      'sheets/parts-shelf.png',
      contactSheet(
        ROOM_PARTS.shelf.options.map((shelf) =>
          crop(scene({ shelf, time: 'day' }), [66, 14, 50, 26])
        ),
        2
      ),
      6
    )
    const lamps = ROOM_PARTS.lamp.options.flatMap((lamp) =>
      [0, 1, 2, 3, 4, 5].map((level) => lampSprite(lamp, level, 400))
    )
    write('sheets/parts-lamp.png', contactSheet(lamps, 6), 6)
    write(
      'sheets/parts-lamp-rooms.png',
      contactSheet(
        ROOM_PARTS.lamp.options.flatMap((lamp) =>
          [0, 3, 5].map((lampLevel) =>
            crop(scene({ lamp }, { lampLevel }), [60, 30, 120, 70])
          )
        ),
        3
      ),
      3
    )

    for (const [name, [input, t]] of Object.entries(SCENES)) {
      write(`rooms/${name}.png`, composeScene(input, t))
    }
    const [gold] = SCENES.goldArabic
    const player = createScenePlayer({ seed: 4 })
    let sparkles: PixelBuffer | null = null
    for (let t = 0; t <= 1500; t += 100) {
      if (t === 1000) player.pat(t, 'happy')
      sparkles = player.frame({ ...gold, pet: gold.pet }, t).buffer
    }
    if (sparkles) write('rooms/goldSparklesPat.png', sparkles)

    const hearts = [5, 4.5, 3, 0.5, 0].map((h) =>
      contactSheet(
        heartFills(h).map((f) => heartIcon(f)),
        5,
        1
      )
    )
    hearts.push(
      contactSheet(
        heartFills(5).map((f) => heartIcon(f, true)),
        5,
        1
      )
    )
    write('sheets/hearts.png', contactSheet(hearts, 1, 1), 8)

    for (const species of PET_SPECIES_IDS) {
      write(
        `motion/entrance-${species}.png`,
        motionStrip(species, 'entrance'),
        2
      )
      write(`motion/trick-${species}.png`, motionStrip(species, 'trick'), 2)
    }
    write('motion/wake-cat.png', motionStrip('cat', 'wake'), 2)

    const hatCells: PixelBuffer[] = []
    for (const species of PET_SPECIES_IDS)
      for (const hat of HAT_IDS)
        hatCells.push(
          crop(
            scene(
              { hat },
              {
                pet: {
                  species,
                  coat: SPECIES[species].defaultCoat,
                  mood: 'happy',
                  seed: 1000,
                },
              }
            ),
            [44, 36, 48, 48]
          )
        )
    write('sheets/hats.png', contactSheet(hatCells, HAT_IDS.length), 3)
  }, 120000)
})
