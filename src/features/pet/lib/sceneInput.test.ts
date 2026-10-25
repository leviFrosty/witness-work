import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM, type PetRecord, type PetVisit } from '@/types/pet'
import { DEMO_SIGN_DATA } from '@/features/pet/art'
import type { PetLife } from '@/features/pet/lib/life'
import {
  cardLife,
  petSceneInput,
  sillOf,
  type PetSceneArgs,
} from '@/features/pet/lib/sceneInput'

const life = (patch: Partial<PetLife> = {}): PetLife => ({
  hearts: 5,
  dead: false,
  mood: 'happy',
  asleep: false,
  quietDays: 0,
  fullRunDays: 40,
  goldRunDays: 0,
  gold: false,
  goldStartedToday: false,
  rainbowToday: false,
  gift: null,
  ...patch,
})

const pet: PetRecord = {
  id: 'companion',
  species: 'dog',
  coat: 'gold',
  adoptedOn: '2026-01-01',
  wakes: [],
  keepsakes: [
    { kind: 'olive', on: '2026-02-01' },
    { kind: 'fig', on: '2026-03-01' },
    { kind: 'pebble', on: '2026-04-01' },
    { kind: 'feather', on: '2026-05-01' },
    { kind: 'lily', on: '2026-06-01' },
    { kind: 'olive', on: '2026-07-01' },
  ],
  updatedAt: 1,
}

const args = (patch: Partial<PetSceneArgs> = {}): PetSceneArgs => ({
  pet,
  life: cardLife(life()),
  room: DEFAULT_ROOM,
  window: { time: 'day', season: 'autumn', liveTime: true, liveSeason: true },
  lampLevel: 2,
  sign: DEMO_SIGN_DATA,
  pendingGift: null,
  keepsakes: pet.keepsakes,
  visits: [],
  roll: { paradise: false, star: false },
  ...patch,
})

describe('pet card life overrides', () => {
  it('passes the real life through without an override', () => {
    expect(cardLife(life({ gold: true }))).toMatchObject({
      hearts: 5,
      gold: true,
      mood: 'happy',
    })
  })

  it('fakes hearts, sleep and death', () => {
    expect(cardLife(life(), { hearts: 0.5 })).toMatchObject({
      hearts: 0.5,
      asleep: true,
      dead: false,
      mood: 'nap',
    })
    expect(cardLife(life(), { dead: true })).toMatchObject({
      hearts: 0,
      dead: true,
      asleep: false,
      mood: 'dead',
    })
    expect(cardLife(life(), { hearts: 2.5 })).toMatchObject({ mood: 'ok' })
  })

  it('drops gold below five hearts unless forced', () => {
    expect(cardLife(life({ gold: true }), { hearts: 4 }).gold).toBe(false)
    expect(
      cardLife(life(), { gold: true, goldStartedToday: true })
    ).toMatchObject({ gold: true, goldStartedToday: true })
  })
})

describe('pet scene input', () => {
  it('puts the newest five keepsakes on the sill', () => {
    expect(sillOf(pet.keepsakes)).toEqual([
      'fig',
      'pebble',
      'feather',
      'lily',
      'olive',
    ])
  })

  it('draws the pet, room, gift and visitors', () => {
    const visit = (inboxId: string, pet: PetVisit['pet']): PetVisit => ({
      inboxId,
      buddyName: inboxId,
      pet,
      startMinutes: 540,
      activity: { type: 'plan', planId: 'p' },
    })
    const { input, shown } = petSceneInput(
      args({
        pendingGift: { kind: 'lily', on: '2026-10-18' },
        visits: [
          visit('anna', { species: 'lamb', coat: 'default', name: 'Snow' }),
          visit('ben', { species: 'cat', coat: 'calico' }),
        ],
      })
    )
    expect(input.pet).toMatchObject({
      species: 'dog',
      coat: 'gold',
      mood: 'happy',
    })
    expect(input.room).toMatchObject({
      time: 'day',
      season: 'autumn',
      sign: 'month',
    })
    expect(input.moments?.gift).toBe('lily')
    expect(input.visitors).toEqual([
      { species: 'lamb', coat: 'default' },
      { species: 'cat', coat: 'calico' },
    ])
    expect(shown).toMatchObject({ gift: 'lily', visitor: true, rainbow: false })
    expect(petSceneInput(args()).shown.visitor).toBe(false)
  })

  it('hides the rainbow at night', () => {
    const rainbow = cardLife(life({ rainbowToday: true }))
    expect(petSceneInput(args({ life: rainbow })).shown.rainbow).toBe(true)
    expect(
      petSceneInput(
        args({
          life: rainbow,
          window: {
            time: 'night',
            season: 'autumn',
            liveTime: true,
            liveSeason: true,
          },
        })
      ).shown.rainbow
    ).toBe(false)
  })

  it('lets the dev override force moments, the window and the lamp', () => {
    const { input, shown } = petSceneInput(
      args({
        pendingGift: { kind: 'lily', on: '2026-10-18' },
        override: {
          window: { time: 'night', season: 'winter' },
          star: true,
          lampLevel: 5,
          gift: null,
          sill: ['feather'],
        },
      })
    )
    expect(input.room).toMatchObject({ time: 'night', season: 'winter' })
    expect(input.lampLevel).toBe(5)
    expect(shown).toMatchObject({ star: true, gift: null })
    expect(input.moments?.sill).toEqual(['feather'])
  })

  it('fakes the window over a room whose window is set, not Live', () => {
    const { input } = petSceneInput(
      args({
        room: {
          ...DEFAULT_ROOM,
          window: { time: 'dusk', season: 'autumn' },
        },
        override: { window: { time: 'night', season: 'winter' } },
      })
    )
    expect(input.room).toMatchObject({ time: 'night', season: 'winter' })
  })
})
