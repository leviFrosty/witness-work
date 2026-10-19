import { describe, expect, it, vi } from 'vitest'
import {
  type BuddyPet,
  buddyCardSchema,
  rosterSchema,
} from '@/features/buddies/lib/schemas'
import {
  type BuddySharing,
  buddySettings,
  initialBuddiesState,
  mergeSharing,
} from '@/features/buddies/lib/state'
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
    // Twenty characters, however many UTF-16 units they take.
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

    // Adopting changes the card's content, so it goes out again.
    mom.setPet(kitten)
    await mom.engine.publishCards()
    const adopted = mom.store.getState().publishedCardHashes[anna.inboxId]
    expect(adopted).not.toBe(before)
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toEqual(kitten)

    // Nothing changed, nothing new to publish.
    await mom.engine.publishCards()
    expect(mom.store.getState().publishedCardHashes[anna.inboxId]).toBe(adopted)

    // Change Pet and renaming republish too.
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

    // Released: the next card clears the buddy's copy.
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

    // Mom's iPad takes the choice from the roster, and its cards leave the
    // pet off too.
    const momsIpad = user('Mom', undefined, mom.seed)
    momsIpad.setPet(kitten)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().sharing.pet).toBe(false)
    await momsIpad.engine.publishCards({ edited: true })
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toBeUndefined()

    // Back on, and Anna's other device gets it from the card, not the roster.
    advance(1000)
    await mom.engine.setSharing({ pet: true })
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toEqual(kitten)
    const annasIpad = user('Anna', undefined, anna.seed)
    await annasIpad.engine.sync()
    expect(annasIpad.store.getState().buddies[0].pet).toEqual(kitten)
  })

  it('gives a buddy their own pet setting over All Buddies’, on every device, and a pause holds it back', async () => {
    const { advance, now, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const joe = user('Joe')
    mom.setPet(kitten)
    await pair(mom, anna)
    await pair(mom, joe)
    const sees = (buddy: typeof anna) => buddy.store.getState().buddies[0].pet
    expect(sees(anna)).toEqual(kitten)
    expect(sees(joe)).toEqual(kitten)

    // Anna alone: her card drops the pet; Joe's keeps it.
    advance(1000)
    const joeHash = mom.store.getState().publishedCardHashes[joe.inboxId]
    await mom.engine.setBuddySetting(anna.inboxId, 'pet', false)
    expect(
      buddySettings(
        mom.store.getState().sharing,
        mom.store.getState().buddies[0]
      ).sources.pet
    ).toBe('buddy')
    await anna.engine.sync()
    await joe.engine.sync()
    expect(sees(anna)).toBeUndefined()
    expect(sees(joe)).toEqual(kitten)
    // Only the card it changes goes out again.
    expect(mom.store.getState().publishedCardHashes[joe.inboxId]).toBe(joeHash)

    // Mom's iPad keeps it, so its cards don't bring the pet back.
    const momsIpad = user('Mom', undefined, mom.seed)
    momsIpad.setPet(kitten)
    await momsIpad.engine.sync()
    expect(
      momsIpad.store.getState().buddies.find((b) => b.inboxId === anna.inboxId)
        ?.overrides
    ).toEqual({ pet: false })
    await momsIpad.engine.publishCards({ edited: true })
    await anna.engine.sync()
    expect(sees(anna)).toBeUndefined()

    // Back to All Buddies, which stop sharing the pet, except with Joe.
    advance(1000)
    await mom.engine.setBuddyOverrides(anna.inboxId, () => undefined)
    await mom.engine.setSharing({ pet: false })
    await mom.engine.setBuddySetting(joe.inboxId, 'pet', true)
    await anna.engine.sync()
    await joe.engine.sync()
    expect(sees(anna)).toBeUndefined()
    expect(sees(joe)).toEqual(kitten)

    // A pause holds it back from everyone, their own settings or not.
    advance(1000)
    await mom.engine.setSharing({ pausedUntil: now() + 7 * 86_400_000 })
    await joe.engine.sync()
    expect(sees(joe)).toBeUndefined()
    expect(joe.store.getState().buddies[0].name).toBe('Mom')

    // It comes back with the next publish after the pause ends.
    advance(8 * 86_400_000)
    await mom.engine.publishCards()
    await joe.engine.sync()
    expect(sees(joe)).toEqual(kitten)
  })

  it('sends no pet to a buddy who sees it while there’s no companion', async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const before = mom.store.getState().publishedCardHashes[anna.inboxId]
    advance(1000)
    await mom.engine.setBuddySetting(anna.inboxId, 'pet', true)
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].pet).toBeUndefined()
    // The card is the same as before, so it isn't sent again.
    expect(mom.store.getState().publishedCardHashes[anna.inboxId]).toBe(before)
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
    // Written before pets, or by an older app.
    const older = rosterSchema.parse({
      ...roster,
      sharing: { photo: true, tenure: true, streak: true, updatedAt: 3 },
    })
    expect(older.sharing.pet).toBeUndefined()
    expect(older.sharing.petUpdatedAt).toBeUndefined()
    // A value it can't read costs only the choice, not the roster.
    expect(
      rosterSchema.parse({ ...roster, sharing: { ...sharing, pet: 'no' } })
        .sharing.pet
    ).toBeUndefined()
  })

  it('round-trips a buddy’s own pet setting in the roster, dropping an unreadable one alone', () => {
    const entry = {
      inboxId: 'A'.repeat(22),
      name: 'Anna',
      dhPub: 'B'.repeat(43),
      inviteSecret: 'C'.repeat(22),
      status: 'active',
      pairedAt: 0,
      colorIndex: 0,
      showOnCalendar: true,
    }
    const parse = (overrides: unknown) =>
      rosterSchema.parse({ ...roster, buddies: [{ ...entry, overrides }] })
        .buddies[0].overrides
    expect(parse({ pet: false, streak: false })).toEqual({
      pet: false,
      streak: false,
    })
    expect(parse({ pet: 'no', streak: false })).toEqual({
      pet: undefined,
      streak: false,
    })
  })

  it('merges on its own stamp, keeping it through an older app and withholding on a tie', () => {
    const local: BuddySharing = {
      ...initialBuddiesState.sharing,
      photo: true,
      tenure: true,
      streak: true,
      updatedAt: 10,
      badges: true,
      badgesUpdatedAt: 0,
      pet: false,
      petUpdatedAt: 5,
    }
    const remote = { photo: true, tenure: true, streak: true, updatedAt: 30 }
    // An older app's later roster, without the pet fields.
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
    // Badges keep their own stamp beside it.
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
})
