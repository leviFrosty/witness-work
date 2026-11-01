import { randomBytes as nodeRandomBytes } from 'node:crypto'
import {
  createBuddiesEngine,
  type BuddiesEngineDeps,
} from '@/features/buddies/lib/engine'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { createRelayClient, type OwnerAuth } from '@/features/buddies/lib/relay'
import type { BuddyPet, BuddyStreak } from '@/features/buddies/lib/schemas'
import {
  type BuddiesState,
  type BuddyProfile,
  initialBuddiesState,
  type OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import { createFakeRelay } from '@/features/buddies/lib/testing/fakeRelay'
import type { AttestedRequest } from '@/lib/attestation/appAttest'
import {
  createInviteSecretStore,
  memoryInviteSecretStorage,
} from '@/lib/sharedSpaces/deviceInviteSecrets'
import {
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'
import {
  AccountSessionError,
  type AttestationProblem,
  createAccountSessions,
} from '@/lib/serverAccount/session'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

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

export const RELAY_URL = 'https://relay.test'

export function testSessions({
  fetchImpl,
  now,
  accountKey,
  attestation = () => null,
}: {
  fetchImpl: typeof fetch
  now: () => number
  accountKey: () => Promise<Uint8Array>
  attestation?: () => AttestationProblem | null
}) {
  let stored: string | null = null
  return createAccountSessions({
    baseUrl: RELAY_URL,
    now,
    localNow: now,
    randomBytes: random,
    attestation: {
      assert: <T>(request: AttestedRequest<T>) => {
        const problem = attestation()
        if (problem)
          throw new AccountSessionError('attestation', { attestation: problem })
        return request.submit({ kind: 'devBypass', token: 'test' })
      },
    },
    store: {
      read: async () => stored,
      write: async (value) => {
        stored = value
      },
    },
    accountKey,
    fetchImpl,
  })
}

export function ownerAuthFor(seed: Uint8Array): OwnerAuth {
  const me = deriveIdentity(seed)
  return {
    inboxId: me.inboxId,
    ownerSeed: me.ownerSeed,
    ownerPub: me.ownerPub,
    link: {
      sign: (accountId) =>
        signInboxLink(
          deriveAccountSigningKey(seed),
          accountId,
          me.inboxId,
          me.ownerPub
        ),
    },
  }
}

export function setup({
  start = Date.parse('2026-09-23T15:00:00Z'),
}: { start?: number } = {}) {
  let clock = start
  const now = () => clock
  const fake = createFakeRelay(now)

  const offlineOps = new Set<string>()

  let afterOp: ((op: string) => Promise<void>) | null = null

  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const op: string | undefined = String(url).split('/buddies/v1/')[1]
    if (op === undefined) return fake.fetchImpl(url, init)
    if (offlineOps.has(op)) throw new TypeError('Network request failed')
    const response = await fake.fetchImpl(url, init)
    await afterOp?.(op)
    return response
  }) as typeof fetch

  function user(
    name: string,
    plans: Plans = { dayPlans: [], recurringPlans: [] },
    seed: Uint8Array = random(32),
    extra: Pick<
      BuddiesEngineDeps,
      | 'platform'
      | 'onPaired'
      | 'readSharedPhoto'
      | 'hasSharedPhoto'
      | 'saveSharedPhoto'
      | 'onSharedPhotosSaved'
      | 'readProfilePhoto'
      | 'keepBuddyPhotos'
      | 'withdrawnAt'
      | 'getShares'
      | 'shareEndsAt'
      | 'account'
      | 'onSharesNotSent'
      | 'cars'
      | 'inviteSecrets'
    > = {}
  ) {
    const store = memoryStore({})
    const profile: BuddyProfile = { name }
    let rootSeed: Uint8Array | null = seed
    const rootSeedNow = async () => (rootSeed ??= random(32))
    let attestation: AttestationProblem | null = null

    const sessions = testSessions({
      fetchImpl,
      now,
      accountKey: rootSeedNow,
      attestation: () => attestation,
    })
    const relay = createRelayClient({
      baseUrl: RELAY_URL,
      randomBytes: random,
      authorize: (run, { signal }) => sessions.withSession(run, { signal }),
      fetchImpl,
      now,
    })
    let shares: OutgoingShareSpec[] = []
    let streak: BuddyStreak | undefined
    let pet: BuddyPet | undefined
    let showBadges = true
    let enabled = true

    const timers: { run: () => void; ms: number }[] = []

    const dismissed: number[][] = []

    const inviteSecretStorage = memoryInviteSecretStorage()
    const inviteSecrets =
      extra.inviteSecrets ?? createInviteSecretStore(inviteSecretStorage)
    const engine = createBuddiesEngine({
      relay,
      store,
      randomBytes: random,
      now,
      getRootSeed: rootSeedNow,
      deleteRootSeed: async () => {
        await sessions.close()
        rootSeed = null
      },
      account: { forget: sessions.forget },
      getPlans: () => plans,
      getProfile: () => profile,
      getStreak: () => streak,
      getPet: () => pet,
      getShares: () => shares,
      showBadges: () => showBadges,
      isEnabled: () => enabled,
      later: (run, ms) => {
        timers.push({ run, ms })
      },
      dismissAlerts: (seqs) => {
        dismissed.push(seqs)
      },
      ...extra,
      inviteSecrets,
    })
    return {
      engine,
      store,
      profile,
      seed,
      inboxId: deriveIdentity(seed).inboxId,

      relay,
      sessions,

      setRootSeed: (next: Uint8Array) => {
        rootSeed = next
      },

      setAttestation: (problem: AttestationProblem | null) => {
        attestation = problem
      },
      setShares: (next: OutgoingShareSpec[]) => {
        shares = next
      },
      setStreak: (next: BuddyStreak | undefined) => {
        streak = next
      },
      setPet: (next: BuddyPet | undefined) => {
        pet = next
      },
      setShowBadges: (next: boolean) => {
        showBadges = next
      },
      setEnabled: (next: boolean) => {
        enabled = next
      },
      timers,
      dismissed,

      inviteSecrets,

      inviteSecretStorage,
    }
  }

  return {
    fake,
    fetchImpl,
    offlineOps,
    setAfterOp: (hook: typeof afterOp) => {
      afterOp = hook
    },
    user,
    now,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

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
