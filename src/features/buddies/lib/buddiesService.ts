import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import { devicePlatform } from '@/lib/devicePlatform'
import apis from '@/constants/apis'
import { analytics } from '@/lib/analytics'
import { refreshSyncClock, syncNow } from '@/lib/syncClock'
import { accountSessions, serverAccount } from '@/lib/serverAccount'
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

/** How long reports of invitations not sent gather before the User is told. */
const NOT_SENT_ALERT_DELAY_MS = 500

/**
 * Invitations not sent, told once a burst: a sync that finds several buddies
 * gone reports each, and the User gets one alert per reason naming them all.
 */
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

/**
 * The Service Streak buddies see, from its first day, with the last day it
 * lasts unless more service is logged. None while streaks are hidden.
 */
export function currentBuddyStreak(
  now: Date = new Date()
): BuddyStreak | undefined {
  if (!usePreferences.getState().showStreaks) return undefined
  const streak = currentServiceStreak(now)
  const n = shownStreak(streak)
  return n > 0 ? { n, until: streakLastsThrough(streak, now) } : undefined
}

/**
 * The Pet Companion buddies can see (species, coat, and name), before the
 * engine drops it while the User doesn't share it. None until one is adopted.
 */
export function currentBuddyPet(): BuddyPet | undefined {
  const pet = usePet.getState().pet
  if (!pet) return undefined
  return {
    species: pet.species,
    coat: pet.coat,
    ...(pet.name ? { name: pet.name } : {}),
  }
}

const engine = createBuddiesEngine({
  relay: createRelayClient({
    baseUrl: apis.buddies,
    randomBytes,
    // Every relay call carries the account session (ADR 0027); its account
    // key is the root seed, read from the Keychain as the engine reads it.
    authorize: (run, { signal }) =>
      accountSessions.withSession(run, { signal }),
    // The relay refuses a signed call more than 5 minutes off its clock, so a
    // device clock that's wrong would otherwise fail every call for good.
    now: syncNow,
    recalibrate: () => refreshSyncClock({ force: true }),
    // Reinstated: the notice clears and the live signal comes back now, not
    // on the next sync.
    onAccountActive: () => useBuddiesSession.setState(accountActiveStatus),
  }),
  store: useBuddies,
  randomBytes,
  // Revs, expiries, and lastSyncAt stay on the device clock, as before: a
  // calibration mid-session must never make a newer rev look older.
  now: Date.now,
  getRootSeed: async () =>
    fromB64u(await BuddiesKeychain.getOrCreateRootSeed()),
  // The seed is the account key: its session ends first, and none opens for
  // it while it's deleted (ADR 0027).
  deleteRootSeed: async () => {
    const seed = await BuddiesKeychain.peekRootSeed()
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
  // One per completed pairing on each side; `role: inviter` counts pairings.
  onPaired: ({ role, buddyPlatform }) =>
    analytics.capture('buddy_paired', {
      role,
      buddy_platform: buddyPlatform ?? 'unknown',
    }),
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
})

/**
 * A buddy's Profile photo at full size, as the file it's kept in: downloaded
 * the first time it's opened. Null when the relay no longer has it.
 */
export async function loadBuddyPhoto(
  inboxId: string,
  photo: ProfilePhoto
): Promise<string | null> {
  const saved = await buddyPhotoFile(photo.blob)
  if (saved) return saved
  const bytes = await engine.fetchBuddyPhoto(inboxId, photo)
  return bytes ? saveBuddyPhoto(photo.blob, bytes) : null
}

// A buddy's photos download with their invitation, before any Plan of this
// User's refers to them; keep them until the invitation lapses.
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

/** Counts a send while its first try is on its way. */
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

/**
 * The app's single Buddies engine: Keychain seed + relay + local stores. Every
 * sync's outcome is recorded for the screens that show it.
 */
export const buddiesEngine: typeof engine = {
  ...engine,
  sync: (options?: BuddiesSyncOptions) =>
    // Waiting out the relay's back-off isn't a sync, and says nothing new.
    options?.automatic && engine.coolingDown()
      ? engine.sync(options)
      : trackSync(() => engine.sync(options), {
          update: (change) => useBuddiesSession.setState(change),
          lastSyncAt: () => useBuddies.getState().lastSyncAt,
          now: Date.now,
          failureReason: buddiesFailureReason,
          skipped: (outcome) => outcome === 'skipped',
          cancelled: (error) => isRelayError(error, 'cancelled'),
        }),
  replyToShare: sending(engine.replyToShare),
  deliverReplies: sending(engine.deliverReplies),
  sendHeldReplies: sending(engine.sendHeldReplies),
  askToJoin: sending(engine.askToJoin),
}

/**
 * Runs the relay check (see `runRelayCheck`) and keeps its report for Tools and
 * the verify harness. One at a time.
 */
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
