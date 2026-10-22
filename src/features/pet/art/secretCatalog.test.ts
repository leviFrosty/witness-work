/**
 * Every secret hat and room item as a PNG tile, opened and locked (its
 * silhouette), with a manifest of their unlock rules, for reviewing the set.
 * Off by default; run with `PET_CATALOG=1 pnpm vitest run
 * src/features/pet/art/secretCatalog`. Writes `.verify/pet-catalog/`
 * (gitignored).
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, it } from 'vitest'

import { crop, scaleNearest } from '@/lib/pixelArt'
import {
  DEFAULT_ROOM,
  SECRET_ROOM_ITEMS,
  type PetRoomSettings,
} from '@/types/pet'
import {
  ROOM_THUMB_VIEWS,
  roomWithChoice,
  silhouetteRooms,
  silhouetteStyle,
  thumbShowsPet,
  type RoomChoicePart,
} from '@/features/pet/lib/roomOptions'
import { SECRET_UNLOCKS } from '@/features/pet/lib/secretUnlocks'

import {
  composeScene,
  DEMO_SIGN_DATA,
  resolveRoom,
  silhouetteOf,
  SPECIES,
  type SceneInput,
} from '.'
import { encodePng } from './testing/png'

const OUT = path.join(process.cwd(), '.verify', 'pet-catalog')
const BASE: PetRoomSettings = { ...DEFAULT_ROOM, sign: 'month' }

function input(room: PetRoomSettings, part: RoomChoicePart): SceneInput {
  return {
    room: resolveRoom(room, { time: 'day', season: 'summer' }),
    sign: DEMO_SIGN_DATA,
    lampLevel: 4,
    pet: thumbShowsPet(part)
      ? {
          species: 'dog',
          coat: SPECIES.dog.defaultCoat,
          mood: 'happy',
          seed: 1000,
        }
      : null,
  }
}

describe.runIf(process.env.PET_CATALOG === '1')('secret catalog', () => {
  it('writes every secret item, opened and locked', () => {
    fs.rmSync(OUT, { recursive: true, force: true })
    fs.mkdirSync(OUT, { recursive: true })
    const manifest = SECRET_ROOM_ITEMS.map((item) => {
      const [part, option] = item.split(':') as [RoomChoicePart, string]
      const view = ROOM_THUMB_VIEWS[part]
      const room = roomWithChoice(BASE, part, option)
      const open = crop(composeScene(input(room, part), 0), view)
      const shapes = silhouetteRooms(BASE, part, option)
      const locked = silhouetteOf(
        crop(composeScene(input(shapes.room, part), 0), view),
        shapes.references.map((ref) =>
          crop(composeScene(input(ref, part), 0), view)
        ),
        silhouetteStyle(part)
      )
      const scale = Math.max(1, Math.round(320 / view[2]))
      fs.writeFileSync(
        path.join(OUT, `${part}-${option}.png`),
        encodePng(scaleNearest(open, scale))
      )
      fs.writeFileSync(
        path.join(OUT, `${part}-${option}-locked.png`),
        encodePng(scaleNearest(locked, scale))
      )
      return { part, option, rule: SECRET_UNLOCKS[item] }
    })
    fs.writeFileSync(
      path.join(OUT, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    )
  })
})
