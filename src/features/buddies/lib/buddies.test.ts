import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { fromB64u, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { open, seal } from '@/features/buddies/lib/crypto'
import {
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
} from '@/features/buddies/lib/keys'
import {
  buildInviteLink,
  parseInviteSecret,
} from '@/features/buddies/lib/inviteLink'
import { buildBuddyCardDays } from '@/features/buddies/lib/card'
import { createRelayClient, RelayError } from '@/features/buddies/lib/relay'
import {
  BuddyInviteError,
  BuddyRemovalPendingError,
  createBuddiesEngine,
} from '@/features/buddies/lib/engine'
import {
  BuddiesState,
  incomingShareKey,
  initialBuddiesState,
  INVITE_TTL_MS,
  OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import {
  buildOutgoingShares,
  followUpShareDetails,
  planShareKey,
} from '@/features/buddies/lib/shares'
import {
  effectiveShareStatus,
  reconcileLinkedPlans,
} from '@/features/buddies/lib/linkedPlans'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import { createFakeRelay } from '@/features/buddies/lib/testing/fakeRelay'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies } from '@/lib/recurrence'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

type Plans = { dayPlans: DayPlan[]; recurringPlans: RecurringPlan[] }

function memoryStore(initial: Partial<BuddiesState>) {
  let state: BuddiesState = { ...initialBuddiesState, ...initial }
  return {
    getState: () => state,
    setState: (
      partial:
        | Partial<BuddiesState>
        | ((current: BuddiesState) => Partial<BuddiesState>)
    ) => {
      state = {
        ...state,
        ...(typeof partial === 'function' ? partial(state) : partial),
      }
    },
  }
}

function setup() {
  let clock = Date.parse('2026-09-23T15:00:00Z')
  const now = () => clock
  const fake = createFakeRelay(now)
  /** Ops that fail as if the device were offline. */
  const offlineOps = new Set<string>()
  const relay = createRelayClient({
    baseUrl: 'https://relay.test',
    randomBytes: random,
    fetchImpl: ((url: string, init?: RequestInit) => {
      if (offlineOps.has(String(url).split('/buddies/v1/')[1]))
        return Promise.reject(new TypeError('Network request failed'))
      return fake.fetchImpl(url, init)
    }) as typeof fetch,
    now,
  })

  function user(
    name: string,
    plans: Plans = { dayPlans: [], recurringPlans: [] },
    seed: Uint8Array = random(32)
  ) {
    const store = memoryStore({ displayName: name })
    let rootSeed: Uint8Array | null = seed
    let shares: OutgoingShareSpec[] = []
    const engine = createBuddiesEngine({
      relay,
      store,
      randomBytes: random,
      now,
      getRootSeed: () => (rootSeed ??= random(32)),
      deleteRootSeed: () => {
        rootSeed = null
      },
      getPlans: () => plans,
      getShares: () => shares,
    })
    return {
      engine,
      store,
      seed,
      inboxId: deriveIdentity(seed).inboxId,
      setShares: (next: OutgoingShareSpec[]) => {
        shares = next
      },
    }
  }

  return {
    fake,
    offlineOps,
    user,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

/** Invite → accept → confirm, then both sides sync so cards flow. */
async function pair(
  inviter: ReturnType<ReturnType<typeof setup>['user']>,
  invitee: ReturnType<ReturnType<typeof setup>['user']>
) {
  const link = await inviter.engine.createInvite()
  await invitee.engine.acceptInvite(link)
  await inviter.engine.sync()
  const [claim] = inviter.store.getState().incomingClaims
  await inviter.engine.confirmClaim(claim.inviteId)
  await invitee.engine.sync()
  await inviter.engine.sync()
  return link
}

const dayPlan = (date: string, minutes: number, start?: number): DayPlan => ({
  id: `day-${date}`,
  date: normalizeDateForStorage(date),
  minutes,
  ...(start === undefined ? {} : { startTimeInMinutes: start }),
})

const weeklyPlan = (startDate: string, minutes: number): RecurringPlan => ({
  id: 'weekly',
  startDate: normalizeDateForStorage(startDate),
  minutes,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
})

describe('buddies primitives', () => {
  it('round-trips base64url at every padding length', () => {
    for (let length = 0; length < 40; length++) {
      const bytes = random(length)
      expect(fromB64u(toB64u(bytes))).toEqual(bytes)
    }
    expect(() => fromB64u('ab+c')).toThrow()
  })

  it('derives the same pair secret from both sides and distinct directions', () => {
    const alice = deriveIdentity(random(32))
    const bob = deriveIdentity(random(32))
    const secret = random(16)
    const fromAlice = derivePairSecret(
      alice.dhPrivate,
      fromB64u(bob.dhPub),
      secret,
      alice.inboxId,
      bob.inboxId
    )
    const fromBob = derivePairSecret(
      bob.dhPrivate,
      fromB64u(alice.dhPub),
      secret,
      bob.inboxId,
      alice.inboxId
    )
    expect(fromAlice).toEqual(fromBob)
    const toAlice = deriveDirection(fromAlice, alice.inboxId)
    const toBob = deriveDirection(fromAlice, bob.inboxId)
    expect(toAlice.slotId).not.toBe(toBob.slotId)
    expect(toAlice.contentKey).not.toEqual(toBob.contentKey)
    expect(toAlice.slotId).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('rejects sealed blobs opened with the wrong context or tampered', () => {
    const key = random(32)
    const blob = seal(key, utf8('hello'), 'ctx|a', random(12))
    expect(open(key, blob, 'ctx|a')).toEqual(utf8('hello'))
    expect(() => open(key, blob, 'ctx|b')).toThrow()
    const bytes = fromB64u(blob)
    bytes[bytes.length - 1] ^= 1
    expect(() => open(key, toB64u(bytes), 'ctx|a')).toThrow()
  })

  it('keeps the invite secret in the fragment and finds links in pasted text', () => {
    const secret = random(16)
    const link = buildInviteLink(secret)
    expect(link).toMatch(/^https:\/\/ww-proxy\.leviwilkerson\.com\/b#1/)
    expect(new URL(link).pathname).toBe('/b')
    expect(parseInviteSecret(`Join me! ${link} see you`)).toEqual(secret)
    expect(parseInviteSecret('https://evil.example/b#1' + toB64u(secret))).toBe(
      null
    )
    expect(parseInviteSecret(link + 'x')).toBe(null)
    expect(deriveInvite(secret).inviteId).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
})

describe('buildBuddyCardDays', () => {
  const today = new Date(2026, 8, 23, 11)

  it('shares only start times and minutes from today forward', () => {
    const days = buildBuddyCardDays(
      [dayPlan('2026-09-22', 60), dayPlan('2026-09-25', 120, 540)],
      [],
      today
    )
    expect(days).toEqual([{ d: '2026-09-25', p: [{ s: 540, m: 120 }] }])
  })

  it('lets a Day Plan replace the recurring instance on its day', () => {
    const days = buildBuddyCardDays(
      [dayPlan('2026-09-30', 90)],
      [weeklyPlan('2026-09-23', 180)],
      today,
      15
    )
    expect(days.map((day) => day.d)).toEqual([
      '2026-09-23',
      '2026-09-30',
      '2026-10-07',
    ])
    expect(days[1].p).toEqual([{ m: 90 }])
    expect(days[0].p).toEqual([{ m: 180 }])
  })
})

describe('buddies relay client', () => {
  it('signs over the exact payload bytes', async () => {
    const { fake } = setup()
    const me = deriveIdentity(random(32))
    const client = createRelayClient({
      baseUrl: 'https://relay.test',
      randomBytes: random,
      fetchImpl: fake.fetchImpl as typeof fetch,
    })
    await client.registerInbox(me)
    await expect(client.syncInbox(me, 0)).resolves.toMatchObject({ seq: 0 })

    const impostor = deriveIdentity(random(32))
    await expect(
      client.syncInbox({ ...impostor, inboxId: me.inboxId }, 0)
    ).rejects.toEqual(new RelayError('bad_signature', 401))
  })
})

describe('buddies pairing', () => {
  it('pairs through invite, claim, and one-tap confirmation', async () => {
    const { fake, user } = setup()
    const mom = user('Mom', {
      dayPlans: [dayPlan('2026-09-26', 180, 540)],
      recurringPlans: [],
    })
    const anna = user('Anna', {
      dayPlans: [dayPlan('2026-09-27', 120)],
      recurringPlans: [],
    })

    const link = await mom.engine.createInvite()
    await expect(anna.engine.previewInvite(link)).resolves.toMatchObject({
      name: 'Mom',
    })
    await anna.engine.acceptInvite(link)
    expect(anna.store.getState().buddies[0]).toMatchObject({
      name: 'Mom',
      status: 'awaitingConfirm',
    })
    expect(fake.pushes).toContainEqual({
      inboxId: mom.inboxId,
      kind: 'invite.claimed',
    })

    // Nothing flows before the inviter confirms.
    await anna.engine.sync()
    expect(anna.store.getState().cards).toEqual({})

    await mom.engine.sync()
    const [claim] = mom.store.getState().incomingClaims
    expect(claim).toMatchObject({ name: 'Anna', inboxId: anna.inboxId })
    await mom.engine.confirmClaim(claim.inviteId)
    expect(fake.pushes).toContainEqual({
      inboxId: anna.inboxId,
      kind: 'pair.confirmed',
    })
    expect(mom.store.getState().outgoingInvites).toEqual([])
    expect(fake.invites.size).toBe(0)

    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].status).toBe('active')
    expect(anna.store.getState().cards[mom.inboxId].days).toEqual([
      { d: '2026-09-26', p: [{ s: 540, m: 180 }] },
    ])

    await mom.engine.sync()
    expect(mom.store.getState().cards[anna.inboxId].days).toEqual([
      { d: '2026-09-27', p: [{ m: 120 }] },
    ])
  })

  it('treats an invite as single-use and rejects your own link', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const stranger = user('Stranger')

    const link = await mom.engine.createInvite()
    await expect(mom.engine.previewInvite(link)).rejects.toEqual(
      new BuddyInviteError('own')
    )
    await anna.engine.acceptInvite(link)
    await expect(stranger.engine.acceptInvite(link)).rejects.toEqual(
      new BuddyInviteError('unavailable')
    )
  })

  it('republishes a card only when its content changes', async () => {
    const { fake, user } = setup()
    const plans: Plans = { dayPlans: [], recurringPlans: [] }
    const mom = user('Mom', plans)
    const anna = user('Anna')
    await pair(mom, anna)
    const cardSeq = () =>
      fake.inboxes.get(anna.inboxId)!.cards.values().next().value?.seq

    const before = cardSeq()
    await mom.engine.publishCards()
    expect(cardSeq()).toBe(before)

    plans.dayPlans = [dayPlan('2026-09-28', 60)]
    await mom.engine.publishCards()
    expect(cardSeq()).toBeGreaterThan(before!)
  })

  it('ends the connection for both people when either removes the other', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    await anna.engine.removeBuddy(mom.inboxId)
    expect(anna.store.getState().buddies).toEqual([])
    const pushesBefore = fake.pushes.length

    await mom.engine.sync()
    expect(mom.store.getState().buddies).toEqual([])
    expect(mom.store.getState().cards).toEqual({})
    expect(fake.pushes.length).toBe(pushesBefore)
  })

  it('lets an unconfirmed request lapse when the inviter rejects it', async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')

    const link = await mom.engine.createInvite()
    await anna.engine.acceptInvite(link)
    await mom.engine.sync()
    await mom.engine.rejectClaim(
      mom.store.getState().incomingClaims[0].inviteId
    )
    expect(mom.store.getState().outgoingInvites).toEqual([])

    advance(INVITE_TTL_MS + 1)
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
  })

  it('caps active buddies plus pending invites at five', async () => {
    const { user } = setup()
    const mom = user('Mom')
    for (let index = 0; index < 3; index++) await mom.engine.createInvite()
    await expect(mom.engine.createInvite()).rejects.toThrow()
    expect(mom.store.getState().outgoingInvites).toHaveLength(3)
  })

  it('restores buddies on a second device from the encrypted roster', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    const momsIpad = user('', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, status: 'active' },
    ])
    expect(momsIpad.store.getState().displayName).toBe('Mom')
  })

  it('keeps devices that already have buddies in step through the roster', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const joe = user('Joe', {
      dayPlans: [dayPlan('2026-09-29', 60)],
      recurringPlans: [],
    })
    const sue = user('Sue')
    await pair(mom, anna)
    const momsIpad = user('Mom', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toHaveLength(1)

    // Mom's phone pairs with Joe after the iPad already has state.
    await pair(mom, joe)
    await joe.engine.publishCards()
    await momsIpad.engine.sync()
    expect(
      momsIpad.store
        .getState()
        .buddies.map((b) => b.inboxId)
        .sort()
    ).toEqual([anna.inboxId, joe.inboxId].sort())
    expect(momsIpad.store.getState().cards[joe.inboxId].days).toEqual([
      { d: '2026-09-29', p: [{ m: 60 }] },
    ])

    // Both devices write the roster without seeing each other's change: the
    // phone pairs with Sue while the stale iPad creates an invite.
    await pair(mom, sue)
    await momsIpad.engine.createInvite()
    await mom.engine.sync()
    await momsIpad.engine.sync()
    for (const device of [mom, momsIpad]) {
      expect(
        device.store
          .getState()
          .buddies.map((b) => b.inboxId)
          .sort()
      ).toEqual([anna.inboxId, joe.inboxId, sue.inboxId].sort())
      expect(device.store.getState().outgoingInvites).toHaveLength(1)
    }

    // Removals and cancellations on one device aren't undone by the other.
    await mom.engine.removeBuddy(anna.inboxId)
    await mom.engine.cancelInvite(
      mom.store.getState().outgoingInvites[0].inviteId
    )
    await momsIpad.engine.sync()
    await mom.engine.sync()
    for (const device of [mom, momsIpad]) {
      expect(
        device.store.getState().buddies.map((b) => b.inboxId)
      ).not.toContain(anna.inboxId)
      expect(device.store.getState().outgoingInvites).toEqual([])
    }
    expect(fake.inboxes.get(mom.inboxId)!.slots.size).toBe(2)
  })

  it('fetches cards a device synced past before it learned of the buddy', async () => {
    const { offlineOps, user } = setup()
    const mom = user('Mom')
    const joe = user('Joe', {
      dayPlans: [dayPlan('2026-09-29', 60)],
      recurringPlans: [],
    })
    const momsIpad = user('Mom', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()

    offlineOps.add('roster/put')
    await pair(mom, joe)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toEqual([])

    offlineOps.clear()
    await mom.engine.createInvite()
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().cards[joe.inboxId].days).toEqual([
      { d: '2026-09-29', p: [{ m: 60 }] },
    ])
  })

  it('keeps retrying a removal the relay did not finish', async () => {
    const { fake, offlineOps, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const annasSlotsInMomsInbox = () =>
      fake.inboxes.get(mom.inboxId)!.slots.size

    offlineOps.add('slot/leave')
    await expect(anna.engine.removeBuddy(mom.inboxId)).rejects.toEqual(
      new BuddyRemovalPendingError('buddy')
    )
    expect(anna.store.getState().buddies).toEqual([])
    expect(annasSlotsInMomsInbox()).toBe(1)

    await anna.engine.sync()
    expect(annasSlotsInMomsInbox()).toBe(1)

    offlineOps.clear()
    await anna.engine.sync()
    expect(annasSlotsInMomsInbox()).toBe(0)
    expect(anna.store.getState().pendingRemovals).toEqual([])
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toEqual([])
  })

  it('wipes nothing until every buddy has been left', async () => {
    const { fake, offlineOps, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    offlineOps.add('slot/leave')
    await expect(mom.engine.deleteEverything()).rejects.toEqual(
      new BuddyRemovalPendingError('everything')
    )
    expect(fake.inboxes.has(mom.inboxId)).toBe(true)
    expect(fake.inboxes.get(anna.inboxId)!.slots.size).toBe(1)

    offlineOps.clear()
    await mom.engine.deleteEverything()
    expect(fake.inboxes.has(mom.inboxId)).toBe(false)
    expect(fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
  })

  it('re-registers a wiped inbox and resumes existing pairings', async () => {
    const { fake, user } = setup()
    const plans: Plans = { dayPlans: [], recurringPlans: [] }
    const mom = user('Mom')
    const anna = user('Anna', plans)
    await pair(mom, anna)

    // The relay's inactivity wipe.
    fake.inboxes.delete(mom.inboxId)
    await mom.engine.sync()
    expect(mom.store.getState()).toMatchObject({
      registeredInboxId: mom.inboxId,
      slotsNeedRestore: false,
    })
    expect(mom.store.getState().buddies).toHaveLength(1)

    plans.dayPlans = [dayPlan('2026-09-30', 45)]
    await anna.engine.publishCards()
    await mom.engine.sync()
    expect(mom.store.getState().cards[anna.inboxId].days).toEqual([
      { d: '2026-09-30', p: [{ m: 45 }] },
    ])
  })

  it('deletes everything and leaves each buddy', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    await mom.engine.deleteEverything()
    expect(fake.inboxes.has(mom.inboxId)).toBe(false)
    expect(mom.store.getState()).toMatchObject({
      buddies: [],
      registeredInboxId: null,
    })
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
  })
})

describe('shared Plans and Follow-ups', () => {
  const HOUR = 60 * 60 * 1000
  const saturday = {
    d: '2026-09-26',
    s: 600,
    m: 120,
    title: 'Cart witnessing',
    location: { name: "McDonald's", address: '1 Main St' },
    note: 'Bring the cart https://example.com/cart',
  }
  const planSpec = (
    recipients: string[],
    details = saturday
  ): OutgoingShareSpec => ({
    key: planShareKey('sat'),
    type: 'plan',
    details,
    recipients,
    expiresAt: Date.parse('2026-09-28T00:00:00Z'),
  })

  async function trio() {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna')
    const mom = env.user('Mom')
    await pair(levi, anna)
    await pair(levi, mom)
    return { ...env, levi, anna, mom }
  }

  it('invites buddies, and replies come back to the sender', async () => {
    const { fake, levi, anna, mom } = await trio()
    levi.setShares([planSpec([anna.inboxId, mom.inboxId])])
    await levi.engine.publishShares()
    expect(fake.pushes).toContainEqual({
      inboxId: anna.inboxId,
      kind: 'plan.invite',
    })

    await anna.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const key = incomingShareKey(levi.inboxId, shareId)
    expect(anna.store.getState().incomingShares[key]).toMatchObject({
      type: 'plan',
      status: 'pending',
      details: saturday,
    })
    expect(anna.store.getState().notifications[0]).toMatchObject({
      kind: 'shareInvite',
      name: 'Levi',
      shareKey: key,
      read: false,
    })

    await anna.engine.replyToShare(key, 'going')
    expect(anna.store.getState().incomingShares[key].status).toBe('going')
    await levi.engine.sync()
    expect(levi.store.getState().shareReplies[shareId]).toMatchObject({
      [anna.inboxId]: { status: 'going' },
    })
    expect(levi.store.getState().notifications[0]).toMatchObject({
      kind: 'shareReply',
      reply: 'going',
      name: 'Anna',
    })
  })

  it('sends nothing for an unchanged share and updates only on change', async () => {
    const { fake, levi, anna, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const key = Object.keys(anna.store.getState().incomingShares)[0]
    await anna.engine.replyToShare(key, 'going')

    const pushesBefore = fake.pushes.length
    advance(60_000)
    await levi.engine.publishShares()
    expect(fake.pushes.length).toBe(pushesBefore)

    advance(60_000)
    levi.setShares([planSpec([anna.inboxId], { ...saturday, s: 660 })])
    await levi.engine.publishShares()
    expect(fake.pushes.at(-1)).toEqual({
      inboxId: anna.inboxId,
      kind: 'plan.update',
    })
    await anna.engine.sync()
    const share = anna.store.getState().incomingShares[key]
    expect(share.details.s).toBe(660)
    // Their answer stands; the change is flagged in the queue.
    expect(share.status).toBe('going')
    const entries = anna.store
      .getState()
      .notifications.filter((n) => n.shareKey === key)
    expect(entries.map((n) => n.kind)).toEqual(['shareUpdate'])
  })

  it('cancels for dropped buddies and deleted Plans', async () => {
    const { fake, levi, anna, mom, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId, mom.inboxId])])
    await levi.engine.publishShares()

    advance(60_000)
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    expect(fake.pushes.at(-1)).toEqual({
      inboxId: mom.inboxId,
      kind: 'plan.cancel',
    })
    await mom.engine.sync()
    const [momShare] = Object.values(mom.store.getState().incomingShares)
    expect(momShare.status).toBe('cancelled')
    expect(mom.store.getState().notifications.map((n) => n.kind)).toEqual([
      'shareCancel',
      'paired',
    ])

    advance(60_000)
    levi.setShares([])
    await levi.engine.publishShares()
    expect(levi.store.getState().outgoingShares).toEqual({})
    await anna.engine.sync()
    const [annaShare] = Object.values(anna.store.getState().incomingShares)
    expect(annaShare.status).toBe('cancelled')
  })

  it('wipes invitations once they lapse and when the buddy is removed', async () => {
    const { levi, anna } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    expect(Object.keys(anna.store.getState().incomingShares)).toHaveLength(1)

    await anna.engine.removeBuddy(levi.inboxId)
    expect(anna.store.getState().incomingShares).toEqual({})
    expect(
      anna.store.getState().notifications.some((n) => n.from === levi.inboxId)
    ).toBe(false)

    const again = await trio()
    again.levi.setShares([planSpec([again.anna.inboxId])])
    await again.levi.engine.publishShares()
    await again.anna.engine.sync()
    again.advance(5 * 24 * HOUR)
    await again.anna.engine.sync()
    expect(again.anna.store.getState().incomingShares).toEqual({})
    expect(
      again.anna.store.getState().notifications.some((n) => n.shareKey)
    ).toBe(false)
  })

  it('wipes lapsed invitations offline, without a sync', async () => {
    const { levi, anna, offlineOps, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()

    offlineOps.add('inbox/sync')
    advance(5 * 24 * HOUR)
    await expect(anna.engine.sync()).rejects.toThrow()
    expect(anna.store.getState().incomingShares).toEqual({})
    expect(anna.store.getState().notifications.some((n) => n.shareKey)).toBe(
      false
    )
  })

  it('keeps an answer given offline and sends it once back online', async () => {
    const { levi, anna, offlineOps, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const key = Object.keys(anna.store.getState().incomingShares)[0]
    await anna.engine.replyToShare(key, 'going')

    offlineOps.add('event/put')
    advance(60_000)
    await anna.engine.replyToShare(key, 'declined')
    expect(anna.store.getState().incomingShares[key]).toMatchObject({
      status: 'declined',
      unsentReplyRev: expect.any(Number),
    })

    offlineOps.clear()
    await anna.engine.sync()
    expect(
      anna.store.getState().incomingShares[key].unsentReplyRev
    ).toBeUndefined()
    await levi.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    expect(levi.store.getState().shareReplies[shareId]).toMatchObject({
      [anna.inboxId]: { status: 'declined' },
    })
  })

  it('queues claims until they are answered', async () => {
    const { user } = setup()
    const levi = user('Levi')
    const anna = user('Anna')
    const link = await levi.engine.createInvite()
    await anna.engine.acceptInvite(link)
    await levi.engine.sync()
    expect(levi.store.getState().notifications[0]).toMatchObject({
      kind: 'claim',
      name: 'Anna',
    })
    const [claim] = levi.store.getState().incomingClaims
    await levi.engine.confirmClaim(claim.inviteId)
    expect(levi.store.getState().notifications).toEqual([])
    await anna.engine.sync()
    expect(anna.store.getState().notifications[0]).toMatchObject({
      kind: 'paired',
      name: 'Levi',
    })
    anna.engine.markNotificationsRead()
    expect(anna.store.getState().notifications[0].read).toBe(true)
  })
})

describe('buildOutgoingShares', () => {
  const now = Date.parse('2026-09-23T15:00:00Z')
  const contact = {
    id: 'c1',
    name: 'Maria  Lopez',
    phone: '555-0100',
    address: { line1: '12 Oak St', city: 'Springfield', zip: '12345' },
    coordinate: { latitude: 1, longitude: 2 },
    createdAt: new Date(now),
  } as Contact

  it('shares only minimal householder details for a Follow-up', () => {
    const details = followUpShareDetails(
      {
        date: new Date(2026, 8, 26, 10, 30),
        notifyMe: false,
        topic: 'x'.repeat(100),
        buddies: ['b'],
      },
      contact
    )
    expect(details).toEqual({
      d: '2026-09-26',
      s: 630,
      firstName: 'Maria',
      location: {
        address: '12 Oak St, Springfield',
        latitude: 1,
        longitude: 2,
      },
      topic: 'x'.repeat(80),
    })
  })

  it('skips past, dismissed, linked, and uninvited items', () => {
    const visit = (id: string, followUp: Partial<Visit['followUp']>): Visit =>
      ({
        id,
        contact: { id: 'c1' },
        date: new Date(now),
        isBibleStudy: false,
        followUp: {
          date: new Date(now + 24 * 60 * 60 * 1000),
          notifyMe: false,
          ...followUp,
        },
      }) as Visit
    const specs = buildOutgoingShares({
      now,
      contacts: [contact],
      dayPlans: [
        { ...dayPlan('2026-09-26', 60), id: 'shared', buddies: ['b'] },
        { ...dayPlan('2026-09-20', 60), id: 'past', buddies: ['b'] },
        { ...dayPlan('2026-09-26', 60), id: 'solo' },
        {
          ...dayPlan('2026-09-26', 60),
          id: 'linked',
          buddies: ['b'],
          buddyShare: { from: 'x', shareId: 'y' },
        },
      ],
      visits: [
        visit('v1', { buddies: ['b'] }),
        visit('v2', { buddies: ['b'], dismissed: true }),
        visit('v3', {}),
      ],
    })
    expect(specs.map((spec) => spec.key)).toEqual([
      'plan:shared',
      'followUp:v1',
    ])
  })
})

describe('reconcileLinkedPlans', () => {
  const share = (status: 'pending' | 'going' | 'declined' | 'cancelled') => ({
    from: 'levi',
    shareId: 'share-1',
    type: 'plan' as const,
    rev: 1,
    details: { d: '2026-09-26', s: 600, m: 90, title: 'Cart' },
    expiresAt: 0,
    receivedAt: 0,
    status,
  })

  it('adds, follows, and removes the Plan a "Going" answer creates', () => {
    const added = reconcileLinkedPlans([], [share('going')], () => 'new')
    expect(added.add).toEqual([
      expect.objectContaining({
        id: 'new',
        minutes: 90,
        startTimeInMinutes: 600,
        title: 'Cart',
        buddyShare: { from: 'levi', shareId: 'share-1' },
      }),
    ])
    const plan = added.add[0]
    expect(reconcileLinkedPlans([plan], [share('going')], () => 'x')).toEqual({
      add: [],
      update: [],
      remove: [],
    })
    const moved = {
      ...share('going'),
      details: { ...share('going').details, m: 120 },
    }
    expect(
      reconcileLinkedPlans([plan], [moved], () => 'x').update[0]
    ).toMatchObject({ id: 'new', minutes: 120 })
    expect(
      reconcileLinkedPlans([plan], [share('cancelled')], () => 'x').remove
    ).toEqual(['new'])
    expect(reconcileLinkedPlans([], [share('pending')], () => 'x').add).toEqual(
      []
    )
    expect(effectiveShareStatus(share('pending'), [plan])).toBe('going')
  })
})
