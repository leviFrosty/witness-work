import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import apis from '@/constants/apis'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { shownStreak, streakLastsThrough } from '@/lib/serviceStreak'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { currentBuddyProfile } from '@/features/buddies/lib/buddyProfile'
import { fromB64u } from '@/features/buddies/lib/bytes'
import { createBuddiesEngine } from '@/features/buddies/lib/engine'
import type { BuddyStreak } from '@/features/buddies/lib/schemas'
import { randomBytes } from '@/features/buddies/lib/random'
import { createRelayClient } from '@/features/buddies/lib/relay'
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
  relay: createRelayClient({ baseUrl: apis.buddies, randomBytes }),
  store: useBuddies,
  randomBytes,
  now: Date.now,
  getRootSeed: () => fromB64u(BuddiesKeychain.getOrCreateRootSeed()),
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
  sync: () =>
    trackSync(engine.sync, {
      update: (change) => useBuddiesSession.setState(change),
      lastSyncAt: () => useBuddies.getState().lastSyncAt,
      now: Date.now,
      failureReason: buddiesFailureReason,
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
