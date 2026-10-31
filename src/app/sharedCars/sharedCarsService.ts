import { getRandomBytes, randomUUID } from 'expo-crypto'
import apis from '@/constants/apis'
import { analytics } from '@/lib/analytics'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import { logger } from '@/lib/logger'
import { accountSessions, peekAccountKey } from '@/lib/serverAccount'
import {
  createSpacesClient,
  isSpaceError,
  SpaceError,
} from '@/lib/sharedSpaces/client'
import { deviceSpaceKeyring } from '@/lib/sharedSpaces/deviceKeyring'
import {
  correctedSyncTimestamp,
  refreshSyncClock,
  syncNow,
  syncTimestamp,
} from '@/lib/syncClock'
import useMileage from '@/stores/mileage'
import { useProfile } from '@/stores/profile'
import useSharedCars from '@/stores/sharedCars'
import { useSharedCarsSession } from '@/stores/sharedCarsSession'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  createSharedCarsEngine,
  SharedCarsError,
  type ReissuedInvite,
  type SharedCarJoinConfirmed,
  type SharedCarOutcome,
} from '@/app/sharedCars/engine'
import type {
  SharedCarProfile,
  SharedCarProfileProvider,
} from '@/app/sharedCars/profile'
import {
  announceCarEnding,
  announceShareFailed,
} from '@/app/sharedCars/carEndings'

/**
 * The app's one Shared Cars engine (docs/shared-cars-protocol.md), wired to the
 * account session, this device's keyring, the User's own mileage store, and
 * their profile. `SharedCarsRuntime` decides when it runs.
 */

/**
 * Who the User is on their cars until `carInvitationsService` sets Buddies'
 * provider: their Profile name, and the inbox this device registered with the
 * Buddies relay.
 */
function profileFallback(): SharedCarProfile {
  const inboxId = useBuddies.getState().registeredInboxId
  // The engine runs only once Buddies has started, which registers it.
  if (!inboxId) throw new Error('Buddies has not started on this device')
  return { name: useProfile.getState().name, inboxId }
}

let profileProvider: SharedCarProfileProvider | null = null

/**
 * Sets what the User's member record says on every car (the Buddy Card's name
 * and, while shared, photo); null goes back to the Profile name. Each car's
 * next sync rewrites the record where it differs.
 */
export function setSharedCarProfileProvider(
  provider: SharedCarProfileProvider | null
) {
  profileProvider = provider
}

const reissueListeners = new Set<(reissue: ReissuedInvite) => void>()

/**
 * Called when a rekey closed an invitation this device sent and the engine
 * opened its replacement: send `car.cancel` for `previousInviteId` and a
 * `car.invite` with `invite`. Returns the unsubscribe.
 */
export function onSharedCarInviteReissued(
  listener: (reissue: ReissuedInvite) => void
): () => void {
  reissueListeners.add(listener)
  return () => reissueListeners.delete(listener)
}

const joinConfirmedListeners = new Set<
  (joined: SharedCarJoinConfirmed) => void
>()

/**
 * Called when a join whose answer was lost turns out, on a later sync, to have
 * landed: answer the invitation it used (`car.reply`, `joined`). Returns the
 * unsubscribe.
 */
export function onSharedCarJoinConfirmed(
  listener: (joined: SharedCarJoinConfirmed) => void
): () => void {
  joinConfirmedListeners.add(listener)
  return () => joinConfirmedListeners.delete(listener)
}

/** Key moments, as analytics events. Never ids, names, or content. */
function reportOutcome(outcome: SharedCarOutcome) {
  switch (outcome.type) {
    case 'shared':
      analytics.capture('shared_car_shared', { resumed: outcome.resumed })
      return
    case 'joined':
      analytics.capture('shared_car_joined', { people: outcome.people })
      return
    case 'ended':
      // Another of the User's devices already counted its own ending.
      if (outcome.reason !== 'left_elsewhere')
        analytics.capture('shared_car_ended', { reason: outcome.reason })
      return
    case 'share_failed':
      analytics.capture('shared_car_share_failed', { reason: outcome.reason })
      return
    case 'sync_failed':
      // Once a day per reason (analyticsFrequency): which failures reach
      // people, not how often a phone retries.
      analytics.capture('shared_car_sync_failed', { reason: outcome.reason })
      return
    case 'rekeyed':
      return
  }
}

/** A failure's code or name only: messages may one day carry more. */
export const sharedCarsFailureName = (error: unknown) =>
  isSpaceError(error) || error instanceof SharedCarsError
    ? error.code
    : error instanceof Error
      ? error.name
      : 'unknown'

const spacesClient = createSpacesClient({
  baseUrl: apis.spaces,
  // Every call carries the account session (ADR 0027), for the account key
  // already on this device; Shared Cars never makes one.
  authorize: async (run, { signal }) => {
    const accountKey = await peekAccountKey()
    if (!accountKey) throw new SpaceError('unauthorized', 401)
    return accountSessions.withSession(run, { accountKey, signal })
  },
})

export const sharedCarsEngine = createSharedCarsEngine({
  client: spacesClient,
  store: useSharedCars,
  personal: {
    snapshot: () => useMileage.getState(),
    mergeRecords: (records) => useMileage.getState().mergeRecords(records),
  },
  keyring: deviceSpaceKeyring,
  rootSeed: peekAccountKey,
  profile: () => (profileProvider ?? profileFallback)(),
  status: useSharedCarsSession,
  randomBytes: getRandomBytes,
  randomUUID,
  // Back-off waits and "last synced" stay on the device clock. Stamps,
  // expiries and the roster's times follow the synced clock, the server's
  // near enough: it refuses a stamp more than 24 hours ahead of its own, and
  // an invite expiring more than 7 days after it.
  now: Date.now,
  syncNow,
  stamp: syncTimestamp,
  refreshClock: () => refreshSyncClock({ force: true }),
  correctStamp: correctedSyncTimestamp,
  canSync: () =>
    useSharedCarsSession.getState().running &&
    accountSessions.snapshot() !== null &&
    !useUpdateRequired.getState().required,
  // Every Buddies sync reads the roster first.
  rosterReadAt: () => useBuddies.getState().lastSyncAt,
  onOutcome: reportOutcome,
  onCarEnded: announceCarEnding,
  onShareFailed: announceShareFailed,
  onInviteReissued: (reissue) => {
    for (const listener of reissueListeners) listener(reissue)
  },
  onJoinConfirmed: (joined) => {
    for (const listener of joinConfirmedListeners) listener(joined)
  },
  onError: (error, context) =>
    logger.warn(`[sharedCars] ${context}: ${sharedCarsFailureName(error)}`),
})

/** Syncs every Shared Car now (pull to refresh, a `car.*` Buddies event). */
export const syncSharedCars = () => sharedCarsEngine.sync()

/**
 * Leaves every Shared Car, each leaving a copy in the User's own cars, and
 * drops any share still seeding (Delete All Mileage Data). `notLeft` names the
 * cars whose leave the server hasn't heard yet.
 */
export const leaveAllSharedCars = () => sharedCarsEngine.leaveAll()

/** Syncs one Shared Car now. */
export const syncSharedCar = (spaceId: string) =>
  sharedCarsEngine.syncCar(spaceId)
