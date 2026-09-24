import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createBuddiesEngine } from '@/features/buddies/lib/engine'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { createRelayClient } from '@/features/buddies/lib/relay'
import { BuddiesState, initialBuddiesState } from '@/features/buddies/lib/state'
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
  let state: BuddiesState = { ...initialBuddiesState, displayName: name }
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
  return { engine, store, inboxId: deriveIdentity(seed).inboxId }
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
})
