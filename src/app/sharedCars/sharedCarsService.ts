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

function profileFallback(): SharedCarProfile {
  const inboxId = useBuddies.getState().registeredInboxId

  if (!inboxId) throw new Error('Buddies has not started on this device')
  return { name: useProfile.getState().name, inboxId }
}

let profileProvider: SharedCarProfileProvider | null = null

export function setSharedCarProfileProvider(
  provider: SharedCarProfileProvider | null
) {
  profileProvider = provider
}

const reissueListeners = new Set<(reissue: ReissuedInvite) => void>()

export function onSharedCarInviteReissued(
  listener: (reissue: ReissuedInvite) => void
): () => void {
  reissueListeners.add(listener)
  return () => reissueListeners.delete(listener)
}

const joinConfirmedListeners = new Set<
  (joined: SharedCarJoinConfirmed) => void
>()

export function onSharedCarJoinConfirmed(
  listener: (joined: SharedCarJoinConfirmed) => void
): () => void {
  joinConfirmedListeners.add(listener)
  return () => joinConfirmedListeners.delete(listener)
}

function reportOutcome(outcome: SharedCarOutcome) {
  switch (outcome.type) {
    case 'shared':
      analytics.capture('shared_car_shared', { resumed: outcome.resumed })
      return
    case 'joined':
      analytics.capture('shared_car_joined', { people: outcome.people })
      return
    case 'ended':
      if (outcome.reason !== 'left_elsewhere')
        analytics.capture('shared_car_ended', { reason: outcome.reason })
      return
    case 'share_failed':
      analytics.capture('shared_car_share_failed', { reason: outcome.reason })
      return
    case 'sync_failed':
      analytics.capture('shared_car_sync_failed', { reason: outcome.reason })
      return
    case 'rekeyed':
      return
  }
}

export const sharedCarsFailureName = (error: unknown) =>
  isSpaceError(error) || error instanceof SharedCarsError
    ? error.code
    : error instanceof Error
      ? error.name
      : 'unknown'

const spacesClient = createSpacesClient({
  baseUrl: apis.spaces,

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

  now: Date.now,
  syncNow,
  stamp: syncTimestamp,
  refreshClock: () => refreshSyncClock({ force: true }),
  correctStamp: correctedSyncTimestamp,
  canSync: () =>
    useSharedCarsSession.getState().running &&
    accountSessions.snapshot() !== null &&
    !useUpdateRequired.getState().required,

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

export const syncSharedCars = () => sharedCarsEngine.sync()

export const leaveAllSharedCars = () => sharedCarsEngine.leaveAll()

export const syncSharedCar = (spaceId: string) =>
  sharedCarsEngine.syncCar(spaceId)
