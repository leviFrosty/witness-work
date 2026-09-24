import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createBuddiesEngine } from '@/features/buddies/lib/engine'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { createRelayClient } from '@/features/buddies/lib/relay'
import {
  BuddiesState,
  initialBuddiesState,
  OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import { normalizeDateForStorage } from '@/lib/normalizeDate'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

/**
 * Opt-in contract check against a real relay, e.g.
 * `BUDDIES_RELAY_URL=http://localhost:8787 pnpm exec vitest run relay.interop`
 * with ww-api's `wrangler dev` running. Skipped by default.
 */
const relayUrl = process.env.BUDDIES_RELAY_URL
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

function user(name: string) {
  const seed = random(32)
  let shares: OutgoingShareSpec[] = []
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
    now: Date.now,
    getRootSeed: () => seed,
    getProfile: () => ({ name }),
    getShares: () => shares,
    deleteRootSeed: () => {},
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
  }
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

  it('shares a Plan, carries the answer back, and cancels it', async () => {
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    const spec = (recipients: string[]): OutgoingShareSpec => ({
      key: 'plan:cart',
      type: 'plan',
      recipients,
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
})
