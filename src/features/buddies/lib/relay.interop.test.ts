import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  BADGE_REACTION_PUSH_KIND,
  BUDDY_PUSH_KINDS,
  createBuddiesEngine,
} from '@/features/buddies/lib/engine'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { createRelayClient } from '@/features/buddies/lib/relay'
import type { BuddyStreak } from '@/features/buddies/lib/schemas'
import {
  BuddiesState,
  initialBuddiesState,
  OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { SharedBadge } from '@/types/badges'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

/**
 * Opt-in contract check against a real relay, e.g.
 * `BUDDIES_RELAY_URL=http://localhost:8787 pnpm exec vitest run relay.interop`
 * with ww-api's `wrangler dev` running. Skipped by default.
 */
const relayUrl = process.env.BUDDIES_RELAY_URL
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

function user(name: string, badges?: SharedBadge[]) {
  const seed = random(32)
  let shares: OutgoingShareSpec[] = []
  let streak: BuddyStreak | undefined
  /**
   * The engine's clock ahead of the relay's, e.g. past the relay's 60 s alert
   * spacing without waiting. Requests are still signed with the real time.
   */
  let ahead = 0
  let state: BuddiesState = { ...initialBuddiesState }
  const store = {
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
  const engine = createBuddiesEngine({
    relay: createRelayClient({ baseUrl: relayUrl!, randomBytes: random }),
    store,
    randomBytes: random,
    now: () => Date.now() + ahead,
    getRootSeed: async () => seed,
    getProfile: () => ({ name, badges }),
    getShares: () => shares,
    getStreak: () => streak,
    deleteRootSeed: async () => {},
    getPlans: () => ({
      dayPlans: [
        {
          id: 'plan',
          date: normalizeDateForStorage(new Date(Date.now() + 86_400_000)),
          minutes: 120,
          startTimeInMinutes: 540,
        },
      ],
      recurringPlans: [],
    }),
  })
  return {
    engine,
    store,
    inboxId: deriveIdentity(seed).inboxId,
    setShares: (next: OutgoingShareSpec[]) => {
      shares = next
    },
    setStreak: (next: BuddyStreak | undefined) => {
      streak = next
    },
    advance: (ms: number) => {
      ahead += ms
    },
  }
}

/** Every fixed kind, a join kind per buddy (five at most), and both badge kinds. */
function allTemplates(engine: ReturnType<typeof user>['engine']) {
  const template = { title: 't', body: 'b' }
  return Object.fromEntries(
    [
      ...BUDDY_PUSH_KINDS,
      ...['a', 'b', 'c', 'd', 'e'].map(
        (tag) => `join.request.${tag.repeat(12)}`
      ),
      ...engine.badgePushKinds(),
    ].map((kind) => [kind, template])
  )
}

async function pair(inviter: ReturnType<typeof user>, invitee: typeof inviter) {
  const link = await inviter.engine.createInvite()
  await invitee.engine.acceptInvite(link)
  await inviter.engine.sync()
  const [claim] = inviter.store.getState().incomingClaims
  await inviter.engine.confirmClaim(claim.inviteId)
  await invitee.engine.sync()
}

describe.skipIf(!relayUrl)('buddies relay interop', () => {
  it('pairs, exchanges cards, and ends the connection', async () => {
    const mom = user('Mom')
    const anna = user('Anna')

    const link = await mom.engine.createInvite()
    await expect(anna.engine.previewInvite(link)).resolves.toMatchObject({
      name: 'Mom',
    })
    await anna.engine.acceptInvite(link)
    await mom.engine.sync()
    const [claim] = mom.store.getState().incomingClaims
    expect(claim?.name).toBe('Anna')

    await mom.engine.confirmClaim(claim.inviteId)
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0]?.status).toBe('active')
    expect(anna.store.getState().cards[mom.inboxId]?.days).toHaveLength(1)

    await mom.engine.sync()
    expect(mom.store.getState().cards[anna.inboxId]?.days).toHaveLength(1)

    await anna.engine.removeBuddy(mom.inboxId)
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toEqual([])

    await mom.engine.deleteEverything()
    await anna.engine.deleteEverything()
  }, 30_000)

  it('carries the streak in Buddy Cards until it is switched off', async () => {
    const mom = user('Mom')
    const anna = user('Anna')
    mom.setStreak({ n: 12, until: '2099-01-01' })
    await pair(mom, anna)
    await mom.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0]?.streak).toEqual({
      n: 12,
      until: '2099-01-01',
    })

    await mom.engine.setSharing({ streak: false })
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0]?.streak).toBeUndefined()

    await mom.engine.deleteEverything()
    await anna.engine.deleteEverything()
  }, 30_000)

  it('shares a Plan, carries the answer back, and cancels it', async () => {
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    const spec = (recipients: string[]): OutgoingShareSpec => ({
      key: 'plan:cart',
      type: 'plan',
      recipients,
      endsAt: Date.now() + 2 * 86_400_000,
      expiresAt: Date.now() + 3 * 86_400_000,
      details: {
        d: '2026-09-26',
        s: 600,
        m: 120,
        title: 'Cart witnessing',
        // Past the 8 KB event cap until the client shortens it.
        note: '\u0001'.repeat(2000),
      },
    })
    mom.setShares([spec([anna.inboxId])])
    await mom.engine.publishShares()
    await anna.engine.sync()
    const [key] = Object.keys(anna.store.getState().incomingShares)
    expect(anna.store.getState().incomingShares[key]).toMatchObject({
      status: 'pending',
      details: { title: 'Cart witnessing' },
    })

    await anna.engine.replyToShare(key, 'going')
    await mom.engine.sync()
    const shareId = mom.engine.shareIdForKey('plan:cart')
    expect(mom.store.getState().shareReplies[shareId]).toMatchObject({
      [anna.inboxId]: { status: 'going' },
    })

    mom.setShares([])
    await mom.engine.publishShares()
    await anna.engine.sync()
    expect(anna.store.getState().incomingShares[key]?.status).toBe('cancelled')

    await mom.engine.deleteEverything()
    await anna.engine.deleteEverything()
  }, 30_000)

  it('carries badges on the card and announces a new one', async () => {
    const mom = user('Mom', [{ c: 'monthsShared', l: 2 }])
    const anna = user('Anna')
    await pair(mom, anna)
    const templates = allTemplates(anna.engine)
    expect(Object.keys(templates)).toHaveLength(16)
    await expect(
      anna.engine.registerPush({
        apnsToken: 'ab'.repeat(32),
        apnsEnvironment: 'sandbox',
        templates,
      })
    ).resolves.toBe('registered')
    expect(anna.store.getState().buddies[0]?.badges).toEqual([
      { c: 'monthsShared', l: 2 },
    ])

    // Mom's pairing confirmation alerted Anna just now; a badge alert waits
    // out the relay's 60 s spacing, so step past it.
    mom.advance(65_000)
    await mom.engine.announceBadges(['returnVisits.1'])
    expect(mom.store.getState().badgeAnnouncements).toEqual([])
    await anna.engine.sync()
    expect(
      anna.store.getState().notifications.find((n) => n.kind === 'badge')
    ).toMatchObject({ badges: [{ c: 'returnVisits', l: 1 }] })

    await mom.engine.deleteEverything()
    await anna.engine.deleteEverything()
  }, 30_000)

  it('carries a reaction to a badge, and a change to it', async () => {
    const mom = user('Mom', [{ c: 'monthsShared', l: 2 }])
    const anna = user('Anna')
    await pair(mom, anna)
    await expect(
      mom.engine.registerPush({
        apnsToken: 'cd'.repeat(32),
        apnsEnvironment: 'sandbox',
        templates: allTemplates(mom.engine),
      })
    ).resolves.toBe('registered')

    await anna.engine.reactToBadge(
      mom.inboxId,
      { c: 'monthsShared', l: 2 },
      'party'
    )
    const sent = anna.store.getState().sentBadgeReactions[mom.inboxId]
    expect(sent?.['monthsShared.2']).toMatchObject({ e: 'party' })
    expect(sent?.['monthsShared.2'].sentRev).toBe(sent?.['monthsShared.2'].rev)
    await mom.engine.sync()
    expect(mom.store.getState().badgeReactions['monthsShared.2']).toMatchObject(
      { [anna.inboxId]: { e: 'party' } }
    )
    expect(
      mom.store
        .getState()
        .notifications.filter((n) => n.kind === 'badgeReaction')
    ).toMatchObject([
      { reaction: 'party', badges: [{ c: 'monthsShared', l: 2 }] },
    ])

    await anna.engine.reactToBadge(
      mom.inboxId,
      { c: 'monthsShared', l: 2 },
      'raisedHands'
    )
    await mom.engine.sync()
    expect(
      mom.store.getState().badgeReactions['monthsShared.2'][anna.inboxId].e
    ).toBe('raisedHands')
    expect(
      mom.store
        .getState()
        .notifications.filter((n) => n.kind === 'badgeReaction')
    ).toMatchObject([{ reaction: 'raisedHands' }])
    expect(BADGE_REACTION_PUSH_KIND).toBe('badge.reaction')

    await mom.engine.deleteEverything()
    await anna.engine.deleteEverything()
  }, 30_000)
})
