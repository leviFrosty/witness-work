import fs from 'node:fs'
import path from 'node:path'

import { describe, it } from 'vitest'

import {
  blit,
  createBuffer,
  crop,
  fillBuffer,
  rgb,
  scaleNearest,
  type PixelBuffer,
} from '@/lib/pixelArt'
import { DEFAULT_ROOM, type PetRoomSettings } from '@/types/pet'
import {
  ROOM_THUMB_VIEWS,
  roomWithChoice,
  silhouetteRooms,
  silhouetteStyle,
  type RoomChoicePart,
} from '@/features/pet/lib/roomOptions'

import {
  composeScene,
  DEMO_SIGN_DATA,
  PET_SPECIES_IDS,
  ROOM_PARTS,
  resolveRoom,
  silhouetteOf,
  SPECIES,
  VIEW_CARD,
  type PetSpeciesId,
  type SceneInput,
} from '.'
import { encodePng } from './testing/png'

const OUT = path.join(process.cwd(), '.verify', 'pet-preview')
const PARTS = [
  'hat',
  'wallColor',
  'wallPattern',
  'floor',
  'bed',
  'shelf',
  'lamp',
] as const satisfies readonly RoomChoicePart[]

const BASE: PetRoomSettings = { ...DEFAULT_ROOM, sign: 'month' }

function input(
  room: PetRoomSettings,
  time: 'day' | 'night',
  species: PetSpeciesId = 'dog',
  lampLevel = 4
): SceneInput {
  return {
    room: resolveRoom(room, { time, season: 'summer' }),
    sign: DEMO_SIGN_DATA,
    lampLevel,
    pet: {
      species,
      coat: SPECIES[species].defaultCoat,
      mood: 'happy',
      seed: 1000,
    },
  }
}

function row(cells: readonly PixelBuffer[], gap = 3): PixelBuffer {
  const w = cells.reduce((sum, c) => sum + c.width + gap, gap)
  const h = Math.max(...cells.map((c) => c.height)) + gap * 2
  const out = createBuffer(w, h)
  fillBuffer(out, rgb('#e8e8e8'))
  let x = gap
  for (const cell of cells) {
    blit(out, cell, x, gap)
    x += cell.width + gap
  }
  return out
}

function stack(rows: readonly PixelBuffer[]): PixelBuffer {
  const w = Math.max(...rows.map((r) => r.width))
  const h = rows.reduce((sum, r) => sum + r.height, 0)
  const out = createBuffer(w, h)
  fillBuffer(out, rgb('#e8e8e8'))
  let y = 0
  for (const r of rows) {
    blit(out, r, 0, y)
    y += r.height
  }
  return out
}

function optionRow(part: (typeof PARTS)[number], option: string): PixelBuffer {
  const room = roomWithChoice(BASE, part, option)
  const view = ROOM_THUMB_VIEWS[part]
  const day = composeScene(input(room, 'day'), 0)
  const night = composeScene(input(room, 'night'), 0)
  const { room: shown, references } = silhouetteRooms(BASE, part, option)
  const shownBuf = crop(composeScene(input(shown, 'day'), 0), view)
  const refs = references.map((ref) =>
    crop(composeScene(input(ref, 'day'), 0), view)
  )
  const cells = [
    crop(day, VIEW_CARD),
    crop(night, VIEW_CARD),
    crop(day, view),
    silhouetteOf(shownBuf, refs, silhouetteStyle(part)),
  ]
  if (part === 'hat') {
    for (const species of PET_SPECIES_IDS) {
      const scene = composeScene(input(room, 'day', species), 0)
      cells.push(crop(scene, [36, 30, 64, 40]))
    }
  }
  return row(cells)
}

function lampLevelsRow(option: string): PixelBuffer {
  const room = roomWithChoice(BASE, 'lamp', option)
  const view = ROOM_THUMB_VIEWS.lamp
  const night = (level: number, tMs: number): PixelBuffer =>
    crop(composeScene(input(room, 'night', 'dog', level), tMs), view)
  return row([
    ...[0, 1, 2, 3, 4, 5].map((level) => night(level, 0)),
    ...[700, 1400, 2100, 2800].map((tMs) => night(4, tMs)),
  ])
}

describe.runIf(Boolean(process.env.PET_PREVIEW))('pet art preview', () => {
  it('writes the options of a part', () => {
    const part = process.env.PET_PREVIEW as (typeof PARTS)[number]
    if (!PARTS.includes(part))
      throw new Error(`PET_PREVIEW must be one of ${PARTS.join(', ')}`)
    const only = process.env.PET_PREVIEW_IDS?.split(',').filter(Boolean)
    const options = (ROOM_PARTS[part].options as readonly string[]).filter(
      (option) => !only || only.includes(option)
    )
    fs.mkdirSync(OUT, { recursive: true })
    const rows = options.map((option) => {
      const r = optionRow(part, option)
      fs.writeFileSync(
        path.join(OUT, `${part}-${option}.png`),
        encodePng(scaleNearest(r, 4))
      )
      return r
    })
    fs.writeFileSync(
      path.join(OUT, `${part}.png`),
      encodePng(scaleNearest(stack(rows), 2))
    )
    if (part === 'lamp' && process.env.PET_PREVIEW_LEVELS) {
      const levels = options.map((option) => {
        const r = lampLevelsRow(option)
        fs.writeFileSync(
          path.join(OUT, `lamp-levels-${option}.png`),
          encodePng(scaleNearest(r, 4))
        )
        return r
      })
      fs.writeFileSync(
        path.join(OUT, 'lamp-levels.png'),
        encodePng(scaleNearest(stack(levels), 2))
      )
    }
  })
})
