import { randomBytes as nodeRandomBytes } from 'node:crypto'
import {
  createBuddiesEngine,
  type BuddiesEngineDeps,
} from '@/features/buddies/lib/engine'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { createRelayClient } from '@/features/buddies/lib/relay'
import type { BuddyStreak } from '@/features/buddies/lib/schemas'
import {
  type BuddiesState,
  type BuddyProfile,
  initialBuddiesState,
  type OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import { createFakeRelay } from '@/features/buddies/lib/testing/fakeRelay'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

/**
 * Engines for tests: each `user` is a whole Buddies client with its own store
 * and seed, all talking to one in-memory relay on a shared clock.
 */

export const random = (length: number) =>
  new Uint8Array(nodeRandomBytes(length))

export type Plans = { dayPlans: DayPlan[]; recurringPlans: RecurringPlan[] }

export function memoryStore(initial: Partial<BuddiesState>) {
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

export function setup() {
  let clock = Date.parse('2026-09-23T15:00:00Z')
  const now = () => clock
  const fake = createFakeRelay(now)
  /** Ops that fail as if the device were offline. */
  const offlineOps = new Set<string>()
  /** Runs after the relay handled a request, before its response arrives. */
  let afterOp: ((op: string) => Promise<void>) | null = null
  const relay = createRelayClient({
    baseUrl: 'https://relay.test',
    randomBytes: random,
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const op = String(url).split('/buddies/v1/')[1]
      if (offlineOps.has(op)) throw new TypeError('Network request failed')
      const response = await fake.fetchImpl(url, init)
      await afterOp?.(op)
      return response
    }) as typeof fetch,
    now,
  })

  function user(
    name: string,
    plans: Plans = { dayPlans: [], recurringPlans: [] },
    seed: Uint8Array = random(32),
    extra: Pick<BuddiesEngineDeps, 'platform' | 'onPaired'> = {}
  ) {
    const store = memoryStore({})
    const profile: BuddyProfile = { name }
    let rootSeed: Uint8Array | null = seed
    let shares: OutgoingShareSpec[] = []
    let streak: BuddyStreak | undefined
    let showBadges = true
    let enabled = true
    /** Work the engine scheduled for later (`later`), run by the test. */
    const timers: { run: () => void; ms: number }[] = []
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
      getProfile: () => profile,
      getStreak: () => streak,
      getShares: () => shares,
      showBadges: () => showBadges,
      isEnabled: () => enabled,
      later: (run, ms) => {
        timers.push({ run, ms })
      },
      ...extra,
    })
    return {
      engine,
      store,
      profile,
      seed,
      inboxId: deriveIdentity(seed).inboxId,
      setShares: (next: OutgoingShareSpec[]) => {
        shares = next
      },
      setStreak: (next: BuddyStreak | undefined) => {
        streak = next
      },
      setShowBadges: (next: boolean) => {
        showBadges = next
      },
      setEnabled: (next: boolean) => {
        enabled = next
      },
      timers,
    }
  }

  return {
    fake,
    relay,
    offlineOps,
    setAfterOp: (hook: typeof afterOp) => {
      afterOp = hook
    },
    user,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

/** Invite → accept → confirm, then both sides sync so cards flow. */
export async function pair(
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
