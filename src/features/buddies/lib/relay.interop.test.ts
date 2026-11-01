import { randomBytes as nodeRandomBytes } from 'node:crypto'
import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'
import {
  BADGE_REACTION_PUSH_KIND,
  BUDDY_PUSH_KINDS,
  createBuddiesEngine,
} from '@/features/buddies/lib/engine'
import { concatBytes, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { ed25519Sign, sha256 } from '@/features/buddies/lib/crypto'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import {
  createRelayClient,
  type LiveSocket,
  RelayError,
} from '@/features/buddies/lib/relay'
import type { BuddyStreak } from '@/features/buddies/lib/schemas'
import {
  BuddiesState,
  initialBuddiesState,
  OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import { ownerAuthFor } from '@/features/buddies/lib/testing/engineHarness'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { SharedBadge } from '@/types/badges'
import { fetchAccountInfo } from '@/lib/serverAccount/client'
import {
  interopEnabled,
  interopSessions,
} from '@/lib/serverAccount/testing/interopSessions'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const relayUrl = process.env.BUDDIES_RELAY_URL
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

function user(name: string, badges?: SharedBadge[]) {
  const seed = random(32)
  const sessions = interopSessions(random, seed)
  let shares: OutgoingShareSpec[] = []
  let streak: BuddyStreak | undefined

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
  const relay = createRelayClient({
    baseUrl: relayUrl!,
    randomBytes: random,
    authorize: (run, { signal }) =>
      sessions.withSession(run, { accountKey: seed, signal }),

    openSocket: (url, headers) =>
      new WebSocket(url, { headers } as never) as unknown as LiveSocket,
  })
  const engine = createBuddiesEngine({
    relay,
    store,
    randomBytes: random,
    now: () => Date.now() + ahead,
    getRootSeed: async () => seed,
    account: { forget: sessions.forget },
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
    seed,
    sessions,
    relay,
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

describe.skipIf(!interopEnabled)('buddies relay interop', () => {
  it('links the inbox to the account of its session', async () => {
    const ann = user('Ann')
    await ann.engine.sync()
    expect(ann.store.getState().accountLinkedInboxId).toBe(ann.inboxId)
    const info = await fetchAccountInfo({
      baseUrl: relayUrl!,
      authorize: (run) =>
        ann.sessions.withSession(run, { accountKey: ann.seed }),
    })
    expect(info).toMatchObject({ status: 'active', inboxIds: [ann.inboxId] })
    await ann.engine.deleteEverything()
  })

  it('links an inbox registered before sessions when an owner op says not_linked', async () => {
    const ann = user('Ann')

    const me = deriveIdentity(ann.seed)
    const payload = utf8(
      JSON.stringify({
        inboxId: me.inboxId,
        ownerPub: me.ownerPub,
        ts: Date.now(),
        nonce: toB64u(random(16)),
      })
    )
    const signature = ed25519Sign(
      concatBytes(utf8('ww-buddies/v1\ninbox/register\n'), payload),
      me.ownerSeed
    )
    const legacy = await fetch(`${relayUrl}/buddies/v1/inbox/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: toB64u(payload),
        signature: toB64u(signature),
      }),
    })
    expect(legacy.status).toBe(200)
    await expect(
      ann.relay.syncInbox(ownerAuthFor(ann.seed), 0)
    ).resolves.toMatchObject({ seq: 0 })
    const info = await fetchAccountInfo({
      baseUrl: relayUrl!,
      authorize: (run) =>
        ann.sessions.withSession(run, { accountKey: ann.seed }),
    })
    expect(info.inboxIds).toEqual([ann.inboxId])

    const ben = user('Ben')
    await expect(
      ben.relay.syncInbox(ownerAuthFor(ann.seed), 0)
    ).rejects.toEqual(new RelayError('forbidden', 403))
    await ann.engine.deleteEverything()
  })

  it('stores and reads a shared photo, and opens the live signal', async () => {
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    const data = random(2048)
    const token = random(32)
    const blobId = toB64u(sha256(data))
    await expect(
      mom.relay.putBlob(ownerAuthFor(mom.seed), {
        blobId,
        data,
        expiresAt: Date.now() + 86_400_000,
        readTokenHash: toB64u(sha256(token)),
      })
    ).resolves.toMatchObject({ ok: true })
    const read = await anna.relay.getBlob({
      inboxId: mom.inboxId,
      blobId,
      token: toB64u(token),
    })
    expect(toB64u(read)).toBe(toB64u(data))

    const socket = await mom.relay.openLive(ownerAuthFor(mom.seed))
    const hello = await new Promise<unknown>((resolve, reject) => {
      socket.onmessage = (event) => resolve(JSON.parse(String(event.data)))
      socket.onerror = () => reject(new Error('live socket refused'))
    })
    socket.close(1000)
    expect(hello).toMatchObject({ type: 'hello' })

    await mom.engine.deleteEverything()
    await anna.engine.deleteEverything()
  }, 30_000)

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
        d: moment().add(1, 'day').format('YYYY-MM-DD'),
        s: 600,
        m: 120,
        title: 'Cart witnessing',

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
