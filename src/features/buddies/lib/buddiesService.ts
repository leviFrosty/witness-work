import { Platform } from 'react-native'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import apis from '@/constants/apis'
import { analytics } from '@/lib/analytics'
import { refreshSyncClock, syncNow } from '@/lib/syncClock'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { shownStreak, streakLastsThrough } from '@/lib/serviceStreak'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { currentBuddyProfile } from '@/features/buddies/lib/buddyProfile'
import { fromB64u } from '@/features/buddies/lib/bytes'
import {
  type BuddiesSyncOptions,
  createBuddiesEngine,
} from '@/features/buddies/lib/engine'
import type { BuddyStreak } from '@/features/buddies/lib/schemas'
import { randomBytes } from '@/features/buddies/lib/random'
import { createRelayClient, isRelayError } from '@/features/buddies/lib/relay'
import { runRelayCheck } from '@/features/buddies/lib/relayCheck'
import { buildOutgoingShares } from '@/features/buddies/lib/shares'
import { trackSync } from '@/features/buddies/lib/syncStatus'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesDiagnostics } from '@/features/buddies/stores/buddiesDiagnostics'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

/**
 * The Service Streak buddies see, once it's long enough to show, with the last
 * day it lasts unless more service is logged.
 */
export function currentBuddyStreak(
  now: Date = new Date()
): BuddyStreak | undefined {
  const streak = currentServiceStreak(now)
  const n = shownStreak(streak)
  return n > 0 ? { n, until: streakLastsThrough(streak, now) } : undefined
}

const engine = createBuddiesEngine({
  relay: createRelayClient({
    baseUrl: apis.buddies,
    randomBytes,
    // The relay refuses a signed call more than 5 minutes off its clock, so a
    // device clock that's wrong would otherwise fail every call for good.
    now: syncNow,
    recalibrate: () => refreshSyncClock({ force: true }),
  }),
  store: useBuddies,
  randomBytes,
  // Revs, expiries, and lastSyncAt stay on the device clock, as before: a
  // calibration mid-session must never make a newer rev look older.
  now: Date.now,
  getRootSeed: async () =>
    fromB64u(await BuddiesKeychain.getOrCreateRootSeed()),
  deleteRootSeed: () => BuddiesKeychain.deleteRootSeed(),
  getPlans: () => {
    const { dayPlans, recurringPlans } = useServiceReport.getState()
    return { dayPlans, recurringPlans }
  },
  getProfile: currentBuddyProfile,
  getStreak: () => currentBuddyStreak(),
  getShares: () =>
    buildOutgoingShares({
      dayPlans: useServiceReport.getState().dayPlans,
      visits: useConversations.getState().conversations,
      contacts: useContacts.getState().contacts,
      now: Date.now(),
    }),
  platform: Platform.OS === 'android' ? 'android' : 'ios',
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
