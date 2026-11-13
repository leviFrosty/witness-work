import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { analytics } from '@/lib/analytics'
import { appVariant } from '@/lib/appVariant'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import { logger } from '@/lib/logger'
import { accountSessions, peekAccountKey } from '@/lib/serverAccount'
import {
  createSpacesClient,
  isSpaceError,
  SpaceError,
} from '@/lib/sharedSpaces/client'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import { deviceSpaceKeyring } from '@/lib/sharedSpaces/deviceKeyring'
import { refreshSyncClock, syncNow, syncTimestamp } from '@/lib/syncClock'
import { territoryPrivacyOn } from '@/lib/territoryPrivacy'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import { useTerritoriesSession } from '@/stores/territoriesSession'
import i18n from '@/lib/locales'
import {
  buddiesEngine,
  setBuddiesTerritoriesHandler,
} from '@/features/buddies/lib/buddiesService'
import {
  buddyDisplayName,
  currentBuddyAvatar,
  shrinkGuestAvatar,
} from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  configureTerritoryViews,
  useTerritories,
} from '@/features/territories/stores/territories'
import { createCarProfile } from '@/app/sharedCars/carProfile'
import {
  createTerritoryEngine,
  TerritorySharingError,
  type TerritoryEnded,
  type TerritoryOutcome,
} from '@/app/territories/engine'
import { createTerritoryInvitations } from '@/app/territories/territoryInvitations'
import { createTerritoryProfile } from '@/app/territories/territoryProfile'

function reportOutcome(outcome: TerritoryOutcome) {
  switch (outcome.type) {
    case 'shared':
      analytics.capture('territory_shared', {
        scope: outcome.scope,
        people: outcome.people,
      })
      return
    case 'link_created':
      analytics.capture('territory_link_created', {
        streets: outcome.streets,
        days: outcome.days,
      })
      return
    case 'link_lifetime_changed':
      analytics.capture('territory_link_lifetime_changed', {
        days: outcome.days,
      })
      return
    case 'link_ended':
      analytics.capture('territory_link_ended')
      return
    case 'handoff':
      analytics.capture('territory_handoff', { action: outcome.action })
      return
    case 'sync_failed':
      analytics.capture('territory_sync_failed', { reason: outcome.reason })
      return
    case 'joined':
    case 'ended':
      return
  }
}

export const territoriesFailureName = (error: unknown) =>
  isSpaceError(error) || error instanceof TerritorySharingError
    ? error.code
    : error instanceof Error
      ? error.name
      : 'unknown'

function announceEnded({ title, reason }: TerritoryEnded) {
  if (reason === 'gone')
    toast.info(i18n.t('territories.share.ended_toast', { title }))
}

const spacesClient = createSpacesClient({
  baseUrl: apis.spaces,

  authorize: async (run, { signal }) => {
    const accountKey = await peekAccountKey()
    if (!accountKey) throw new SpaceError('unauthorized', 401)
    return accountSessions.withSession(run, { accountKey, signal })
  },
})

const profile = createTerritoryProfile({
  buddies: createCarProfile({
    cardName: () => buddiesEngine.ownCardName(),
    inboxId: () => useBuddies.getState().registeredInboxId,
    sharesPhoto: () => useBuddies.getState().sharing.photo,
    avatar: currentBuddyAvatar,
    shrink: shrinkGuestAvatar,
  }),
  buddiesStarted: () => useBuddies.getState().registeredInboxId !== null,
  accountKey: peekAccountKey,
  name: () => buddiesEngine.ownCardName(),
})

export async function prepareTerritoryAccount() {
  if (await peekAccountKey()) return
  await accountSessions.ensure()
}

export const territoryPrivacy = () =>
  territoryPrivacyOn(usePreferences.getState())

export const territoriesEngine = createTerritoryEngine({
  client: spacesClient,
  store: useTerritories,
  keyring: deviceSpaceKeyring,
  rootSeed: peekAccountKey,
  profile,
  privacy: territoryPrivacy,
  variant: appVariant,
  randomBytes: getRandomBytes,
  now: Date.now,
  syncNow,
  stamp: syncTimestamp,
  refreshClock: () => refreshSyncClock({ force: true }),
  canSync: () =>
    useTerritoriesSession.getState().running &&
    accountSessions.snapshot() !== null &&
    !useUpdateRequired.getState().required,
  onOutcome: reportOutcome,
  onEnded: announceEnded,
  onRefused: ({ title }) =>
    toast.error(i18n.t('territories.share.notShared_toast', { title })),
  onInviteReissued: (reissue) => territoryInvitations.handleReissue(reissue),
  onError: (error, context) =>
    logger.warn(`[territories] ${context}: ${territoriesFailureName(error)}`),
})

export const territoryInvitations = createTerritoryInvitations({
  engine: territoriesEngine,
  buddies: buddiesEngine,
  buddiesStore: useBuddies,
  store: useTerritories,
  running: () => useTerritoriesSession.getState().running,
  now: Date.now,
  onEvent: ({ name, ...properties }) => analytics.capture(name, properties),
  onError: (error, context) =>
    logger.warn(`[territories] ${context}: ${territoriesFailureName(error)}`),
})

setBuddiesTerritoriesHandler(territoryInvitations.buddiesHandler)

configureTerritoryViews({
  privacy: territoryPrivacy,
  buddyByTag: (spaceId, tag) => {
    const buddy = useBuddies
      .getState()
      .buddies.find(
        (b) => b.status === 'active' && memberTag(spaceId, b.inboxId) === tag
      )
    return buddy
      ? { inboxId: buddy.inboxId, name: buddyDisplayName(buddy) }
      : undefined
  },
})
