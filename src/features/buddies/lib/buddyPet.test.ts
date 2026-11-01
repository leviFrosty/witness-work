import { describe, expect, it, vi } from 'vitest'
import {
  type BuddyPet,
  buddyCardSchema,
  rosterSchema,
} from '@/features/buddies/lib/schemas'
import { type BuddySharing, mergeSharing } from '@/features/buddies/lib/state'
import { pair, setup } from '@/features/buddies/lib/testing/engineHarness'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const card = {
  v: 1,
  name: 'Mom',
  updatedAt: 0,
  level: 'daysTimes',
  days: [{ d: '2026-10-18', p: [{ s: 540, m: 120 }] }],
}

const kitten: BuddyPet = { species: 'cat', coat: 'grey', name: 'Pip' }

describe('the pet on a Buddy Card', () => {
  it('parses a card with or without a pet', () => {
    expect(buddyCardSchema.parse(card).pet).toBeUndefined()
    expect(buddyCardSchema.parse({ ...card, pet: kitten }).pet).toEqual(kitten)
    expect(
      buddyCardSchema.parse({
        ...card,
        pet: { species: 'lamb', coat: 'default' },
      }).pet
    ).toEqual({ species: 'lamb', coat: 'default' })
  })

  it('drops a pet it can’t read without dropping the card', () => {
    for (const pet of [
      { species: 'dragon', coat: 'red' },
      { species: 'cat' },
      { species: 'cat', coat: 'x'.repeat(25) },
      { species: 'cat', coat: '' },
      'kitten',
      42,
    ]) {
      const parsed = buddyCardSchema.parse({ ...card, pet })
      expect(parsed.pet).toBeUndefined()
      expect(parsed.days).toEqual(card.days)
      expect(parsed.name).toBe('Mom')
    }
  })

  it('keeps the pet when only its name is unreadable', () => {
    for (const name of ['x'.repeat(21), '   ', 7]) {
      expect(
        buddyCardSchema.parse({
          ...card,
          pet: { species: 'dog', coat: 'gold', name },
        }).pet
      ).toEqual({ species: 'dog', coat: 'gold' })
    }

    const emoji = '🐱'.repeat(20)
    expect(
      buddyCardSchema.parse({
        ...card,
        pet: { species: 'cat', coat: 'grey', name: emoji },
      }).pet?.name
    ).toBe(emoji)
  })

  it('shares the pet in Buddy Cards, republishing when it changes', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    expect(anna.store.getState().buddies[0].pet).toBeUndefined()
    const before = mom.store.getState().publishedCardHashes[anna.inboxId]

    mom.setPet(kitten)
    await mom.engine.publishCards()
    const adopted = mom.store.getState().publishedCardHashes[anna.inboxId]
    expect(adopted).not.toBe(before)
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toEqual(kitten)

    await mom.engine.publishCards()
    expect(mom.store.getState().publishedCardHashes[anna.inboxId]).toBe(adopted)

    mom.setPet({ species: 'cat', coat: 'calico', name: 'Pip' })
    await mom.engine.publishCards()
    const recoated = mom.store.getState().publishedCardHashes[anna.inboxId]
    expect(recoated).not.toBe(adopted)
    mom.setPet({ species: 'cat', coat: 'calico', name: 'Pippin' })
    await mom.engine.publishCards()
    expect(mom.store.getState().publishedCardHashes[anna.inboxId]).not.toBe(
      recoated
    )
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toEqual({
      species: 'cat',
      coat: 'calico',
      name: 'Pippin',
    })

    mom.setPet(undefined)
    await mom.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toBeUndefined()
  })

  it('keeps the card when the pet on it can’t be read', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    mom.setPet({ species: 'dragon', coat: 'red' } as unknown as BuddyPet)
    mom.profile.tenure = { kind: 'pioneer', since: '2019-09' }
    await pair(mom, anna)
    expect(anna.store.getState().buddies[0]).toMatchObject({
      name: 'Mom',
      tenure: { kind: 'pioneer', since: '2019-09' },
    })
    expect(anna.store.getState().buddies[0].pet).toBeUndefined()
    expect(anna.store.getState().cards[mom.inboxId]).toBeDefined()
  })

  it('holds the pet back on every device once sharing it is off', async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    mom.setPet(kitten)
    await pair(mom, anna)
    expect(anna.store.getState().buddies[0].pet).toEqual(kitten)

    advance(1000)
    await mom.engine.setSharing({ pet: false })
    expect(mom.store.getState().sharing).toMatchObject({
      pet: false,
      petUpdatedAt: expect.any(Number),
    })
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toBeUndefined()

    const momsIpad = user('Mom', undefined, mom.seed)
    momsIpad.setPet(kitten)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().sharing.pet).toBe(false)
    await momsIpad.engine.publishCards({ edited: true })
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toBeUndefined()

    advance(1000)
    await mom.engine.setSharing({ pet: true })
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toEqual(kitten)
    const annasIpad = user('Anna', undefined, anna.seed)
    await annasIpad.engine.sync()
    expect(annasIpad.store.getState().buddies[0].pet).toEqual(kitten)
  })

  it('follows a buddy’s own setting, and stays home while sharing is paused', async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const joe = user('Joe')
    mom.setPet(kitten)
    await pair(mom, anna)
    await pair(mom, joe)

    advance(1000)
    await mom.engine.setBuddySetting(anna.inboxId, 'pet', false)
    await anna.engine.sync()
    await joe.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toBeUndefined()
    expect(joe.store.getState().buddies[0].pet).toEqual(kitten)

    advance(1000)
    await mom.engine.setSharing({ pausedUntil: Number.MAX_SAFE_INTEGER })
    await joe.engine.sync()
    expect(joe.store.getState().buddies[0].pet).toBeUndefined()
  })
})

describe('the pet sharing choice', () => {
  const roster = {
    v: 1,
    buddies: [],
    outgoingInvites: [],
    incomingClaims: [],
  }

  it('round-trips through the roster, and reads as absent from older ones', () => {
    const sharing = {
      photo: true,
      tenure: true,
      streak: true,
      updatedAt: 3,
      badges: true,
      badgesUpdatedAt: 0,
      pet: false,
      petUpdatedAt: 7,
    }
    const parsed = rosterSchema.parse({ ...roster, sharing })
    expect(parsed.sharing).toEqual(sharing)
    expect(
      rosterSchema.parse(JSON.parse(JSON.stringify(parsed))).sharing
    ).toEqual(sharing)

    const older = rosterSchema.parse({
      ...roster,
      sharing: { photo: true, tenure: true, streak: true, updatedAt: 3 },
    })
    expect(older.sharing.pet).toBeUndefined()
    expect(older.sharing.petUpdatedAt).toBeUndefined()

    expect(
      rosterSchema.parse({ ...roster, sharing: { ...sharing, pet: 'no' } })
        .sharing.pet
    ).toBeUndefined()
  })

  it('merges on its own stamp, keeping it through an older app and withholding on a tie', () => {
    const local: BuddySharing = {
      photo: true,
      tenure: true,
      streak: true,
      updatedAt: 10,
      badges: true,
      badgesUpdatedAt: 0,
      pet: false,
      petUpdatedAt: 5,
      plans: true,
      planTimes: 'exact',
      pausedUntil: 0,
      plansUpdatedAt: 0,
      showOnCalendar: true,
      calendarUpdatedAt: 0,
      petVisits: true,
      petVisitsUpdatedAt: 0,
    }
    const remote = { photo: true, tenure: true, streak: true, updatedAt: 30 }

    expect(mergeSharing(local, remote)).toMatchObject({
      pet: false,
      petUpdatedAt: 5,
      updatedAt: 30,
    })
    expect(
      mergeSharing(local, { ...remote, pet: true, petUpdatedAt: 4 })
    ).toMatchObject({ pet: false, petUpdatedAt: 5 })
    expect(
      mergeSharing(local, { ...remote, pet: true, petUpdatedAt: 6 })
    ).toMatchObject({ pet: true, petUpdatedAt: 6 })
    expect(
      mergeSharing(
        { ...local, pet: true },
        { ...remote, pet: false, petUpdatedAt: 5 }
      )
    ).toMatchObject({ pet: false, petUpdatedAt: 5 })

    expect(
      mergeSharing(local, {
        ...remote,
        badges: false,
        badgesUpdatedAt: 9,
        pet: true,
        petUpdatedAt: 9,
      })
    ).toMatchObject({
      badges: false,
      badgesUpdatedAt: 9,
      pet: true,
      petUpdatedAt: 9,
    })
  })

  it("merges whether buddies' pets visit the same way, on its own stamp", () => {
    const local: BuddySharing = {
      photo: true,
      tenure: true,
      streak: true,
      updatedAt: 10,
      badges: true,
      badgesUpdatedAt: 0,
      pet: true,
      petUpdatedAt: 0,
      plans: true,
      planTimes: 'exact',
      pausedUntil: 0,
      plansUpdatedAt: 0,
      showOnCalendar: true,
      calendarUpdatedAt: 0,
      petVisits: false,
      petVisitsUpdatedAt: 5,
    }
    const remote = { photo: true, tenure: true, streak: true, updatedAt: 30 }

    expect(mergeSharing(local, remote)).toMatchObject({
      petVisits: false,
      petVisitsUpdatedAt: 5,
    })
    expect(
      mergeSharing(local, { ...remote, petVisits: true, petVisitsUpdatedAt: 4 })
    ).toMatchObject({ petVisits: false, petVisitsUpdatedAt: 5 })
    expect(
      mergeSharing(local, { ...remote, petVisits: true, petVisitsUpdatedAt: 6 })
    ).toMatchObject({ petVisits: true, petVisitsUpdatedAt: 6 })

    expect(
      mergeSharing(
        { ...local, petVisits: true },
        { ...remote, petVisits: false, petVisitsUpdatedAt: 5 }
      )
    ).toMatchObject({ petVisits: false, petVisitsUpdatedAt: 5 })
  })
})
