import { describe, expect, it } from 'vitest'

import { hashBuffer, pixelAt } from '@/lib/pixelArt'

import {
  coatIdsFor,
  defaultCoatFor,
  greyModeFor,
  idlePose,
  isValidCoat,
  PET_MOMENTS,
  PET_SPECIES_IDS,
  petSprite,
  resolveCoat,
  SPECIES,
  type PetMood,
} from '.'
import { SPRITE_HASHES } from './testing/hashes'

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

describe('species registry', () => {
  it('lists the launch species and coats', () => {
    expect(PET_SPECIES_IDS).toEqual(['lion', 'dog', 'cat', 'donkey', 'lamb'])
    expect(coatIdsFor('dog')).toEqual(['gold', 'white', 'liver', 'black'])
    expect(coatIdsFor('cat')).toEqual([
      'orange',
      'grey',
      'black',
      'white',
      'tuxedo',
      'calico',
      'siamese',
      'tortoiseshell',
    ])
    for (const id of ['lion', 'donkey', 'lamb'] as const)
      expect(coatIdsFor(id)).toEqual(['default'])
    expect(defaultCoatFor('dog')).toBe('gold')
    expect(defaultCoatFor('cat')).toBe('orange')
  })

  it('validates coats and falls back to the default', () => {
    expect(isValidCoat('cat', 'calico')).toBe(true)
    expect(isValidCoat('dog', 'calico')).toBe(false)
    expect(isValidCoat('dog', 'toString')).toBe(false)
    expect(resolveCoat('dog', 'calico')).toBe('gold')
    expect(resolveCoat('lion', undefined)).toBe('default')
    expect(hashBuffer(petSprite('dog', 'nope', idlePose('happy', 0, 0)))).toBe(
      hashBuffer(petSprite('dog', 'gold', idlePose('happy', 0, 0)))
    )
  })

  it('gives every coat a swatch and every species its sound keys', () => {
    for (const id of PET_SPECIES_IDS) {
      const sp = SPECIES[id]
      for (const coat of sp.coatIds)
        expect(sp.coats[coat].swatch.length).toBeGreaterThan(0)
      for (const moment of PET_MOMENTS)
        expect(sp.soundKeys[moment]).toBe(`pet.sound.${id}.${moment}`)
    }
  })
})

describe('idle pose', () => {
  it('bobs, wags and blinks on the design board clock', () => {
    expect(idlePose('happy', 0, 1000)).toMatchObject({
      bob: 0,
      tail: 0,
      blink: false,
    })
    expect(idlePose('happy', 560, 1000)).toMatchObject({ bob: 1, tail: 1 })
    expect(idlePose('happy', 2400, 1000).blink).toBe(true)
    expect(idlePose('low', 0, 0)).toMatchObject({
      bob: 1,
      tail: 0,
      face: 'low',
    })
    expect(idlePose('content', 0, 0).face).toBe('happy')
    expect(idlePose('weak', 0, 0).face).toBe('low')
    expect(idlePose('happy', 0, 1000, { squish: true }).bob).toBe(1)
    expect(idlePose('dead', 123456, 0)).toMatchObject({
      bob: 0,
      tail: 0,
      blink: false,
      lie: true,
    })
    expect(idlePose('joy', 180, 0).tail).toBe(1)
    expect(idlePose('nap', 0, 0).blink).toBe(false)
  })

  it('keeps the eyes open on still frames (t = 0), whatever the seed', () => {
    for (const seed of [0, 50, 3399, 3400, 100_000]) {
      expect(idlePose('happy', 0, seed).blink).toBe(false)
    }
    expect(idlePose('happy', 100, 0).blink).toBe(true)
    expect(idlePose('happy', 3400, 0).blink).toBe(true)
  })
})

describe('sprites', () => {
  it('match their pixel snapshots for every species × coat × mood', () => {
    const got: Record<string, string> = {}
    for (const id of PET_SPECIES_IDS) {
      for (const coat of SPECIES[id].coatIds) {
        for (const mood of MOODS) {
          const sprite = petSprite(id, coat, {
            ...idlePose(mood, 0, 1000),
            grey: greyModeFor(mood),
          })
          expect(sprite.width).toBe(32)
          expect(sprite.height).toBe(32)
          got[`${id}/${coat}/${mood}`] = hashBuffer(sprite).toString(16)
        }
      }
    }
    expect(got).toEqual(SPRITE_HASHES)
  })

  it('keep the sprite inside the frame with transparent corners', () => {
    for (const id of PET_SPECIES_IDS) {
      const s = petSprite(
        id,
        SPECIES[id].defaultCoat,
        idlePose('happy', 0, 1000)
      )
      expect(pixelAt(s, 0, 0)).toBeNull()
      expect(pixelAt(s, 31, 31)).toBeNull()
      expect(pixelAt(s, 16, 20)).not.toBeNull()
    }
  })

  it('memoizes by pose key', () => {
    const pose = idlePose('happy', 0, 1000)
    expect(petSprite('lion', 'default', pose)).toBe(
      petSprite('lion', 'default', { ...pose })
    )
    expect(petSprite('lion', 'default', { ...pose, flip: true })).not.toBe(
      petSprite('lion', 'default', pose)
    )
  })

  it('draw the pup with its mouth half shut on its way closed', () => {
    const hash = (
      species: 'dog' | 'cat',
      face: 'happy' | 'joy',
      closing = false
    ) =>
      hashBuffer(
        petSprite(species, SPECIES[species].defaultCoat, {
          ...idlePose(face, 0, 1000),
          mouthClosing: closing,
        })
      )
    const closing = hash('dog', 'happy', true)
    expect(closing).not.toBe(hash('dog', 'happy'))
    expect(closing).not.toBe(hash('dog', 'joy'))

    expect(hash('dog', 'joy', true)).toBe(hash('dog', 'joy'))
    expect(hash('cat', 'happy', true)).toBe(hash('cat', 'happy'))
  })
})
