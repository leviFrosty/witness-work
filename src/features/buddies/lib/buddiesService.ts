import { Platform } from 'react-native'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import { devicePlatform } from '@/lib/devicePlatform'
import * as DeviceSecrets from '../../../../modules/device-secrets'
import { deviceAccountKey, unfinishedKeyChange } from '@/lib/accountKey'
import { KeyChangeUnfinishedError } from '@/lib/accountKey/accountKey'
import { logger } from '@/lib/logger'
import apis from '@/constants/apis'
import { analytics } from '@/lib/analytics'
import { refreshSyncClock, syncNow } from '@/lib/syncClock'
import {
  accountSessions,
  fetchServerAccountInfo,
  serverAccount,
  webAccount,
} from '@/lib/serverAccount'
import { openTicketedSocket } from '@/lib/serverAccount/liveTicket'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePet } from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { shownStreak, streakLastsThrough } from '@/lib/serviceStreak'
import { alertSharesNotSent } from '@/features/buddies/lib/buddiesErrorAlert'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import {
  currentBuddyProfile,
  shrinkGuestAvatar,
} from '@/features/buddies/lib/buddyProfile'
import { fromB64u } from '@/features/buddies/lib/bytes'
import { createBuddiesTerritoriesLink } from '@/features/buddies/lib/territoriesLink'
import { dismissBuddyAlerts } from '@/features/buddies/lib/dismissBuddyAlerts'
import {
  type BuddiesSyncOptions,
  createBuddiesEngine,
} from '@/features/buddies/lib/engine'
import type {
  BuddyPet,
  BuddyStreak,
  ProfilePhoto,
} from '@/features/buddies/lib/schemas'
import {
  type BuddiesKeyChangeOutcome,
  createBuddiesKeyChange,
} from '@/features/buddies/lib/keyChange'
import { randomBytes } from '@/features/buddies/lib/random'
import { createRelayClient, isRelayError } from '@/features/buddies/lib/relay'
import { runRelayCheck } from '@/features/buddies/lib/relayCheck'
import {
  buildOutgoingShares,
  shareEndsAt,
  shareWithdrawnAt,
} from '@/features/buddies/lib/shares'
import {
  hasSharedPhoto,
  readSharedPhoto,
  saveSharedPhoto,
} from '@/features/buddies/lib/sharedPhotoFiles'
import {
  buddyPhotoFile,
  keepBuddyPhotos,
  readProfilePhoto,
  saveBuddyPhoto,
} from '@/features/buddies/lib/buddyPhotoFiles'
import { noteImagesArrived } from '@/lib/richText/noteImageRevision'
import { addNoteImageReferences } from '@/stores/noteImages'
import { localSharedPhotoId } from '@/features/buddies/lib/sharedNotes'
import {
  accountActiveStatus,
  trackSync,
} from '@/features/buddies/lib/syncStatus'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesDiagnostics } from '@/features/buddies/stores/buddiesDiagnostics'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'
import type { UnsentShareReason } from '@/features/buddies/lib/state'
import { createBuddiesCarsLink } from '@/features/buddies/lib/sharedCarsLink'
import { deviceInviteSecrets } from '@/lib/sharedSpaces/deviceInviteSecrets'
import { deviceSpaceKeyring } from '@/lib/sharedSpaces/deviceKeyring'
import useSharedCars from '@/stores/sharedCars'

const NOT_SENT_ALERT_DELAY_MS = 500

const sharesNotSent = (() => {
  const pending = new Map<UnsentShareReason, Set<string>>()
  const flush = () => {
    for (const [reason, names] of pending) {
      analytics.capture('buddies_share_not_sent', {
        reason,
        buddies: names.size,
      })
      alertSharesNotSent({ reason, names: [...names] })
    }
    pending.clear()
  }
  return {
    add: ({
      reason,
      names,
    }: {
      reason: UnsentShareReason
      names: string[]
    }) => {
      if (pending.size === 0) setTimeout(flush, NOT_SENT_ALERT_DELAY_MS)
      const gathered = pending.get(reason) ?? new Set<string>()
      for (const name of names) gathered.add(name)
      pending.set(reason, gathered)
    },
  }
})()

export function currentBuddyStreak(
  now: Date = new Date()
): BuddyStreak | undefined {
  if (!usePreferences.getState().showStreaks) return undefined
  const streak = currentServiceStreak(now)
  const n = shownStreak(streak)
  return n > 0 ? { n, until: streakLastsThrough(streak, now) } : undefined
}

let hatGrowthNow: () => number | undefined = () => undefined

export const setBuddyHatGrowthSource = (source: () => number | undefined) => {
  hatGrowthNow = source
}

export function currentBuddyPet(): BuddyPet | undefined {
  const { pet, room } = usePet.getState()
  if (!pet) return undefined
  const hat = room?.hat
  const growth = hat === 'fig' ? hatGrowthNow() : undefined
  return {
    species: pet.species,
    coat: pet.coat,
    ...(pet.name ? { name: pet.name } : {}),
    ...(hat && hat !== 'none' ? { hat } : {}),
    ...(growth === undefined ? {} : { hatGrowth: growth }),
    ...(room
      ? {
          room: {
            time: room.window.time,
            season: room.window.season,
            wallColor: room.wallColor,
            wallPattern: room.wallPattern,
            floor: room.floor,
            bed: room.bed,
            shelf: room.shelf,
            lamp: room.lamp,
            study: room.study ?? 'none',
          },
        }
      : {}),
  }
}

const carsLink = createBuddiesCarsLink(useSharedCars, {
  now: Date.now,
  forgetKeys: () => deviceSpaceKeyring.forgetAll(),
})

export const setBuddiesCarsHandler = carsLink.setHandler

const territoriesLink = createBuddiesTerritoriesLink()

export const setBuddiesTerritoriesHandler = territoriesLink.setHandler

const relay = createRelayClient({
  baseUrl: apis.buddies,
  randomBytes,

  authorize: (run, { signal }) => accountSessions.withSession(run, { signal }),

  now: syncNow,
  recalibrate: () => refreshSyncClock({ force: true }),

  onAccountActive: () => useBuddiesSession.setState(accountActiveStatus),

  ...(Platform.OS === 'web' && {
    openTicketedSocket: (url: string, inboxId: string) =>
      openTicketedSocket(
        { url, socket: 'buddies', id: inboxId },
        {
          baseUrl: apis.accounts,
          authorize: (run) => accountSessions.withSession(run),
        }
      ),
  }),
})

const engine = createBuddiesEngine({
  relay,
  store: useBuddies,
  randomBytes,

  now: Date.now,
  getRootSeed: async () => fromB64u(await deviceAccountKey.getOrCreate()),

  deleteRootSeed: async () => {
    if (webAccount) return webAccount.signOut()
    const seed = await deviceAccountKey.peek()
    await serverAccount.changeKey(() => BuddiesKeychain.deleteRootSeed(), {
      from: seed ? fromB64u(seed) : null,
    })
  },
  account: serverAccount,
  getPlans: () => {
    const { dayPlans, recurringPlans } = useServiceReport.getState()
    return { dayPlans, recurringPlans }
  },
  getProfile: currentBuddyProfile,
  getStreak: () => currentBuddyStreak(),
  getPet: currentBuddyPet,
  shrinkAvatar: shrinkGuestAvatar,
  getShares: () =>
    buildOutgoingShares({
      dayPlans: useServiceReport.getState().dayPlans,
      visits: useConversations.getState().conversations,
      contacts: useContacts.getState().contacts,
      now: Date.now(),
    }),
  withdrawnAt: (key) => {
    const { dayPlans, deletedDayPlans } = useServiceReport.getState()
    const { conversations, deletedConversations } = useConversations.getState()
    return shareWithdrawnAt(key, {
      dayPlans,
      deletedDayPlans,
      visits: conversations,
      deletedVisits: deletedConversations,
    })
  },
  shareEndsAt: (key) =>
    shareEndsAt(key, {
      dayPlans: useServiceReport.getState().dayPlans,
      visits: useConversations.getState().conversations,
    }),
  platform: devicePlatform(),

  onPaired: ({ role, buddyPlatform, reconnect }) =>
    analytics.capture('buddy_paired', {
      role,
      buddy_platform: buddyPlatform ?? 'unknown',
      reconnect: reconnect ?? false,
    }),

  paused: async () => {
    const record = await unfinishedKeyChange().catch(() => null)
    return (
      record !== null &&
      !(await keyChangeReset.capturedFor(fromB64u(record.oldKey)))
    )
  },
  showBadges: () => usePreferences.getState().showBadges,
  isEnabled: () => useBuddiesSession.getState().running,
  later: (run, ms) => {
    setTimeout(run, ms)
  },
  readSharedPhoto,
  hasSharedPhoto,
  saveSharedPhoto,
  onSharedPhotosSaved: noteImagesArrived,
  readProfilePhoto,
  keepBuddyPhotos,
  dismissAlerts: (seqs) => void dismissBuddyAlerts(seqs),
  onSharesNotSent: (notSent) => sharesNotSent.add(notSent),
  cars: carsLink.deps,
  territories: territoriesLink.deps,
  inviteSecrets: deviceInviteSecrets,
})

async function refuseWhileKeyChanges() {
  if (await unfinishedKeyChange()) throw new KeyChangeUnfinishedError()
}

const KEY_CHANGE_PROGRESS = 'buddies.key-change'

const keyChangeReset = createBuddiesKeyChange({
  relay,
  engine,
  progress: {
    read: () => DeviceSecrets.read(KEY_CHANGE_PROGRESS),
    write: (value) => DeviceSecrets.write(KEY_CHANGE_PROGRESS, value),
    remove: () => DeviceSecrets.remove(KEY_CHANGE_PROGRESS),
  },
  randomBytes,
  now: Date.now,
  onReconnectSent: () => analytics.capture('buddy_reconnect_sent'),
  onInvitesSkipped: (reason) =>
    analytics.capture('buddy_reconnect_skipped', { reason }),
  onReconnectNotSent: (reason) =>
    analytics.capture('buddy_reconnect_not_sent', { reason }),
})

let keyChangeWaiting = true

let keyChangeTimer: ReturnType<typeof setTimeout> | null = null

function noteKeyChange(outcome: BuddiesKeyChangeOutcome) {
  if (keyChangeTimer) clearTimeout(keyChangeTimer)
  keyChangeTimer = null
  keyChangeWaiting = !outcome.done
  if (!outcome.done)
    keyChangeTimer = setTimeout(
      carryOnBuddiesKeyChange,
      Math.max(0, outcome.retryAt - Date.now())
    )
}

export async function prepareBuddiesForKeyChange(
  change: Parameters<typeof keyChangeReset.prepare>[0]
) {
  const linked = await keyChangeReset.prepare(change)
  if (linked === 'otherAccount')
    logger.warn('[buddies] key change: the old inbox is another account’s')
}

export async function resetBuddiesForKeyChange(
  input: Parameters<typeof keyChangeReset.reset>[0]
) {
  keyChangeWaiting = true
  const outcome = await keyChangeReset.reset(input)
  noteKeyChange(outcome)
  return outcome
}

export function carryOnBuddiesKeyChange() {
  if (!keyChangeWaiting) return
  keyChangeReset
    .carryOn()
    .then(noteKeyChange)
    .catch((error: unknown) => {
      logger.warn('[buddies] key change reset', error)
    })
}

function ownerKeyRefused(inboxId: string) {
  engine
    .ownerKeyRefused(inboxId)
    .then(async (outcome) => {
      if (outcome === 'moved') await buddiesEngine.sync({ automatic: true })
      if (outcome !== 'retired') return

      const seed = await deviceAccountKey.peek()
      if (seed)
        await fetchServerAccountInfo(fromB64u(seed)).catch(() => undefined)
    })
    .catch((error: unknown) => {
      logger.warn('[buddies] refused owner key', error)
    })
}

export function dropRefusedInboxes() {
  for (const inboxId of BuddiesKeychain.refusedInboxes())
    ownerKeyRefused(inboxId)
}

export async function loadBuddyPhoto(
  inboxId: string,
  photo: ProfilePhoto
): Promise<string | null> {
  const saved = await buddyPhotoFile(photo.blob)
  if (saved) return saved
  const bytes = await engine.fetchBuddyPhoto(inboxId, photo)
  return bytes ? saveBuddyPhoto(photo.blob, bytes) : null
}

addNoteImageReferences(() => {
  const now = Date.now()
  return Object.values(useBuddies.getState().incomingShares)
    .filter((share) => share.expiresAt > now)
    .flatMap((share) =>
      (share.details.photos ?? []).map((photo) =>
        localSharedPhotoId(photo.blob)
      )
    )
})

function sending<Args extends unknown[]>(
  send: (...args: Args) => Promise<void>
) {
  return async (...args: Args) => {
    useBuddiesSession.setState((state) => ({ sending: state.sending + 1 }))
    try {
      await send(...args)
    } finally {
      useBuddiesSession.setState((state) => ({ sending: state.sending - 1 }))
    }
  }
}

export const buddiesEngine: typeof engine = {
  ...engine,
  sync: async (options?: BuddiesSyncOptions) => {
    const outcome = await (options?.automatic && engine.coolingDown()
      ? engine.sync(options)
      : trackSync(() => engine.sync(options), {
          update: (change) => useBuddiesSession.setState(change),
          lastSyncAt: () => useBuddies.getState().lastSyncAt,
          now: Date.now,
          failureReason: buddiesFailureReason,
          skipped: (outcome) => outcome === 'skipped',
          cancelled: (error) => isRelayError(error, 'cancelled'),
        }))

    if (outcome === 'synced') carryOnBuddiesKeyChange()
    return outcome
  },

  deleteEverything: async () => {
    await refuseWhileKeyChanges()
    await keyChangeReset.leaveNow()
    await engine.deleteEverything()
  },
  leaveThisDevice: async () => {
    await refuseWhileKeyChanges()
    await keyChangeReset.leaveNow()
    await engine.leaveThisDevice()
  },
  replyToShare: sending(engine.replyToShare),
  deliverReplies: sending(engine.deliverReplies),
  sendHeldReplies: sending(engine.sendHeldReplies),
  askToJoin: sending(engine.askToJoin),
}

export async function checkBuddiesRelay() {
  const setCheck = (
    relayCheck: Partial<
      ReturnType<typeof useBuddiesDiagnostics.getState>['relayCheck']
    >
  ) =>
    useBuddiesDiagnostics.setState((state) => ({
      relayCheck: { ...state.relayCheck, ...relayCheck },
    }))
  if (useBuddiesDiagnostics.getState().relayCheck.running) return null
  setCheck({ running: true })
  try {
    const report = await runRelayCheck({
      baseUrl: apis.buddies,
      probeInbox: engine.probeInbox,
      openLive: engine.openLive,
    })
    setCheck({ report })
    return report
  } finally {
    setCheck({ running: false })
  }
}
