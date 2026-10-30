import { isApplyingRemoteData } from '@/lib/remoteDataMutation'
import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import {
  addBackgroundListener,
  addForegroundListener,
} from '@/lib/appLifecycle'

import { useBuddiesAlertContext } from '@/app/buddies/buddiesAlertContext'
import { reportAlertOutcomes } from '@/app/buddies/buddiesAlertOutcomes'
import { joinBuddiesHere } from '@/app/buddies/joinBuddiesHere'
import {
  postBuddiesAlert,
  remoteMessageData,
} from '@/app/buddies/buddiesPushAlerts'
import { logger } from '@/lib/logger'
import { buddiesPushData } from '@/lib/notificationData'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePet } from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import useServiceReport from '@/stores/serviceReport'
import { useSupporter } from '@/stores/supporterStatus'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { syncBuddyNotifications } from '@/features/buddies/hooks/useBuddyNotifications'

import {
  buddiesEngine,
  currentBuddyPet,
  currentBuddyStreak,
  dropRefusedInboxes,
} from '@/features/buddies/lib/buddiesService'
import { startFallbackPoll, syncSoon } from '@/features/buddies/lib/autoSync'
import {
  currentBuddyProfile,
  refreshBuddyAvatarThumbnail,
} from '@/features/buddies/lib/buddyProfile'
import {
  forgetBuddiesInData,
  reconcileLinkedPlans,
  sharesJustAccepted,
  sharesLeftUnlinked,
} from '@/features/buddies/lib/linkedPlans'
import { createLiveInbox } from '@/features/buddies/lib/liveInbox'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { nextReplyAttempt } from '@/features/buddies/lib/replyDelivery'
import { shareRecipientsKey, sharedKeys } from '@/features/buddies/lib/shares'
import { hasSharedEventEnded } from '@/features/buddies/lib/shareTiming'
import { Buddy, incomingShareKey } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  recordLiveEvent,
  useBuddiesDiagnostics,
} from '@/features/buddies/stores/buddiesDiagnostics'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'
import { useBuddyTraySync } from '@/features/buddies/stores/buddyTraySync'
import {
  markSeen,
  useNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

/**
 * Push registration is checked at most this often; the engine only re-sends an
 * unchanged one once a day.
 */
const PUSH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const PUBLISH_DEBOUNCE_MS = 30 * 1000
/**
 * While the account is suspended and the app is open, it checks back after this
 * long, doubling after each refusal (see `startFallbackPoll`).
 */
const SUSPENDED_CHECK_MS = 60 * 1000

const logFailure = (error: unknown) =>
  logger.warn('[buddies] background', error)

/** `syncLinkedPlans` is changing Plans: following buddies, not the User's edit. */
let reconcilingLinkedPlans = false

/**
 * Adds, updates, and removes the Plans that follow buddies' invitations.
 * `answered` holds the invitations just answered "Going" here, the only ones
 * whose deleted Plan comes back. With `updatesOnly` it only brings linked Plans
 * up to the invitations this device has, adding and removing none: for Plans
 * that just arrived from another device, whose answers may not have yet.
 */
function syncLinkedPlans(
  answered?: ReadonlySet<string>,
  { updatesOnly = false } = {}
) {
  const report = useServiceReport.getState()
  const { add, update, remove } = reconcileLinkedPlans(
    report.dayPlans,
    Object.values(useBuddies.getState().incomingShares),
    {
      now: Date.now(),
      deletedPlanIds: new Set(report.deletedDayPlans.map((plan) => plan.id)),
      answered,
    }
  )
  reconcilingLinkedPlans = true
  try {
    // Only a Plan added for "Going" answered here is the User's own save.
    for (const plan of updatesOnly ? [] : add)
      report.addDayPlan(plan, {
        automatic: !(
          plan.buddyShare &&
          answered?.has(
            incomingShareKey(plan.buddyShare.from, plan.buddyShare.shareId)
          )
        ),
      })
    for (const plan of update) report.updateDayPlan(plan, { automatic: true })
    for (const id of updatesOnly ? [] : remove) report.deleteDayPlan(id)
  } finally {
    reconcilingLinkedPlans = false
  }
}

/** A store change the User made here, not one from another device or Buddies. */
const isLocalEdit = () => !isApplyingRemoteData() && !reconcilingLinkedPlans

/**
 * Shared Plans and Follow-ups that just arrived from another device: that
 * device sent them, so this one takes them as sent (`adoptShares`).
 */
function adoptArrivedShares(
  previous: { dayPlans: DayPlan[]; visits: Visit[] },
  current: { dayPlans: DayPlan[]; visits: Visit[] }
) {
  const before = sharedKeys(previous.dayPlans, previous.visits)
  const arrived = [...sharedKeys(current.dayPlans, current.visits)].filter(
    (key) => !before.has(key)
  )
  buddiesEngine.adoptShares(arrived)
}

/**
 * Deleting a Plan that follows a buddy's invitation means "Can't make it" —
 * otherwise the buddy's next change would bring it back. Removing a duplicate
 * while another Plan still follows the invitation doesn't. The caller skips
 * remote mutations (restores, imports, and Plans another device deleted): the
 * device where the user deleted the Plan answers for them.
 */
function declineDeletedLinkedPlans(previous: DayPlan[], current: DayPlan[]) {
  for (const key of sharesLeftUnlinked(previous, current)) {
    const share = useBuddies.getState().incomingShares[key]
    // Deleting a Plan that has happened is tidying history, not an answer.
    if (share?.status !== 'going' || hasSharedEventEnded(share, Date.now()))
      continue
    // Saved at once, so reconciling won't bring the Plan back; sent when online.
    void buddiesEngine.replyToShare(key, 'declined').catch(logFailure)
  }
}

/**
 * A buddy who is gone (removed, left, or delete-all) is taken off this User's
 * Plans and Follow-ups, so pairing again later never re-sends old invitations,
 * and Plans that followed their invitations become ordinary Plans.
 */
function forgetRemovedBuddies(previous: Buddy[], current: Buddy[]) {
  const remaining = new Set(current.map((buddy) => buddy.inboxId))
  const removed = new Set(
    previous.map((b) => b.inboxId).filter((id) => !remaining.has(id))
  )
  if (removed.size === 0) return
  const report = useServiceReport.getState()
  const visits = useConversations.getState()
  const changes = forgetBuddiesInData(
    report.dayPlans,
    visits.conversations,
    removed
  )
  for (const plan of changes.dayPlans)
    report.updateDayPlan(plan, { automatic: true })
  for (const visit of changes.visits) visits.updateConversation(visit)
}

/**
 * A Buddies push arrived while the app is open: pull the event it announced
 * (unless a sync already got past it), and report failures through
 * diagnostics.
 */
function syncAfterPush(seq: number | undefined) {
  void buddiesEngine.sync({ minSeq: seq, automatic: true }).catch(logFailure)
}

/** Who this User has invited to what; see `shareRecipientsKey`. */
const currentRecipients = () =>
  shareRecipientsKey(
    useServiceReport.getState().dayPlans,
    useConversations.getState().conversations
  )

/**
 * The background half of Buddies. Renders nothing; runs only once the User has
 * started using Buddies (an inbox exists), so everyone else pays no network or
 * battery cost. Pulls on launch, on every return to the app, and whenever the
 * relay's live signal says the inbox changed while the app is open (polling the
 * open notifications tray only while that signal is down). While the relay's
 * kill switch is on, the live signal stays off and only returns to the app
 * check back, every 15 minutes at most. While the account is suspended it stays
 * off too, and the app checks back minutes apart, so a reinstatement brings it
 * back without a relaunch. Publishes a Buddy Card and shared Plans after the
 * data behind them changes: at once when who's invited changes, so a buddy sees
 * an invitation as it's sent, otherwise debounced.
 */
export default function BuddiesRuntime() {
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const running = enabled && started
  useBuddiesAlertContext()

  // Buddies started on another of this User's devices starts here too, once
  // iCloud Sync has brought this device's Plans in (see `joinBuddiesHere`):
  // at launch, when sync turns on, first pulls, or Supporter access returns,
  // and, on iOS, where iCloud Keychain can bring the seed in while the app
  // runs, on returning to it.
  useEffect(() => {
    if (!enabled || started) return
    const join = () => void joinBuddiesHere().catch(logFailure)
    join()
    const foreground =
      Platform.OS === 'ios' ? addForegroundListener(join) : null
    const sync = usePreferences.subscribe((state, previous) => {
      if (
        (state.iCloudSyncEnabled && !previous.iCloudSyncEnabled) ||
        (state.lastiCloudPulledAt !== null &&
          previous.lastiCloudPulledAt === null)
      )
        join()
    })
    const supporter = useSupporter.subscribe((state, previous) => {
      if (state.isSupporter && !previous.isSupporter) join()
    })
    return () => {
      foreground?.remove()
      sync()
      supporter()
    }
  }, [enabled, started])

  // What the engine checks before making or sending badge news.
  useEffect(() => {
    useBuddiesSession.setState({ running })
    return () => useBuddiesSession.setState({ running: false })
  }, [running])

  useEffect(() => {
    if (!running) return
    let publishTimer: ReturnType<typeof setTimeout> | null = null
    let replyTimer: ReturnType<typeof setTimeout> | null = null
    let followTimer: ReturnType<typeof setTimeout> | null = null
    let stopTrayPoll: (() => void) | null = null
    let stopSuspendedCheck: (() => void) | null = null
    let lastPushCheck = 0
    let recipients = currentRecipients()
    /** A change behind the Buddy Card was made here (see `publishCards`). */
    let edited = false
    const noteEdit = () => {
      if (isLocalEdit()) edited = true
    }

    const publishNow = () => {
      if (publishTimer) clearTimeout(publishTimer)
      publishTimer = null
      void buddiesEngine.publishCards({ edited }).catch(logFailure)
      edited = false
      void buddiesEngine.publishShares().catch(logFailure)
      void buddiesEngine.deliverReplies().catch(logFailure)
    }
    const syncNow = () => void syncSoon().catch(logFailure)
    const checkPushRegistration = () => {
      if (Date.now() - lastPushCheck < PUSH_CHECK_INTERVAL_MS) return
      lastPushCheck = Date.now()
      void registerBuddiesPush().catch(logFailure)
    }
    const refreshWhileTrayOpen = (open: boolean) => {
      stopTrayPoll?.()
      stopTrayPoll = open
        ? startFallbackPoll(async () => {
            await syncBuddyNotifications('poll')
            return useBuddyTraySync.getState().failedAt === null
          })
        : null
    }
    /**
     * The live signal is off while suspended, so nothing else would notice a
     * reinstatement while the app stays open.
     */
    const checkWhileSuspended = (suspended: boolean) => {
      stopSuspendedCheck?.()
      stopSuspendedCheck = suspended
        ? startFallbackPoll(async () => {
            await buddiesEngine.sync({ automatic: true }).catch(logFailure)
            return !useBuddiesSession.getState().accountSuspended
          }, SUSPENDED_CHECK_MS)
        : null
    }

    const schedulePublish = () => {
      if (publishTimer) clearTimeout(publishTimer)
      publishTimer = setTimeout(publishNow, PUBLISH_DEBOUNCE_MS)
    }
    /** Plans or Follow-ups changed: invitations go now, edits can wait. */
    const publishSharesChange = () => {
      const next = currentRecipients()
      if (next === recipients) {
        schedulePublish()
        return
      }
      recipients = next
      publishNow()
    }
    /**
     * Sends each held answer when its wait ends (see `replyHoldMs`), and tries
     * one that failed once more (see `nextReplyAttempt`).
     */
    const scheduleHeldReplies = () => {
      if (replyTimer) clearTimeout(replyTimer)
      replyTimer = null
      const now = Date.now()
      // After that one retry, syncs and Try Again send it, not a loop here.
      const next = nextReplyAttempt(
        Object.values(useBuddies.getState().incomingShares),
        now
      )
      if (next === undefined) return
      replyTimer = setTimeout(() => {
        replyTimer = null
        void buddiesEngine.deliverReplies().catch(logFailure)
        scheduleHeldReplies()
      }, next - now)
    }
    const live = createLiveInbox({
      open: () => buddiesEngine.openLive(),
      syncedSeq: () => useBuddies.getState().syncSeq,
      // A sync already running that reaches `seq` covers this change too.
      onChange: (seq) =>
        void buddiesEngine
          .sync({ minSeq: seq, automatic: true })
          .catch(logFailure),
      // After a refused handshake: a sync's 401 refreshes the session's token
      // before the next connection sends it.
      verify: () => buddiesEngine.sync({ automatic: true }).catch(logFailure),
      onEvent: recordLiveEvent,
    })
    /**
     * Off while the relay's kill switch is on or the account is suspended: it
     * would only be refused.
     */
    const liveRefused = (state: {
      relayDisabled: boolean
      accountSuspended: boolean
    }) => state.relayDisabled || state.accountSuspended
    const startLive = () => {
      if (liveRefused(useBuddiesSession.getState())) return
      live.start()
    }
    useBuddiesDiagnostics.setState({
      controls: { reconnect: live.reconnect, ping: live.ping },
    })
    const refreshAvatar = () =>
      refreshBuddyAvatarThumbnail().catch((error) => {
        logFailure(error)
        return false
      })

    void refreshAvatar().then((changed) => {
      if (changed) schedulePublish()
    })
    dropRefusedInboxes()
    syncNow()
    checkPushRegistration()
    reportAlertOutcomes()
    if (AppState.currentState === 'active') startLive()
    // A real return from the background; Control Center and Face ID aren't.
    const foreground = addForegroundListener(() => {
      buddiesEngine.expire()
      dropRefusedInboxes()
      syncNow()
      checkPushRegistration()
      reportAlertOutcomes()
      startLive()
    })
    const background = addBackgroundListener(() => {
      live.stop()
      if (publishTimer) publishNow()
      // A held answer goes out now; the app may not run again for a while.
      void buddiesEngine.sendHeldReplies().catch(logFailure)
    })
    // The kill switch turned on or the account was suspended: stop the live
    // signal. Cleared again (a sync or another call worked): start it.
    checkWhileSuspended(useBuddiesSession.getState().accountSuspended)
    const session = useBuddiesSession.subscribe((state, previous) => {
      if (state.accountSuspended !== previous.accountSuspended)
        checkWhileSuspended(state.accountSuspended)
      const refused = liveRefused(state)
      if (refused === liveRefused(previous)) return
      if (refused) live.stop()
      else if (AppState.currentState === 'active') startLive()
    })
    // A new push token (restore, or the system rotating it) must reach the
    // relay, or pushes stop until the daily refresh. Every token read fires
    // this too, registering included, so only a different token registers.
    let lastToken: string | null = null
    const pushToken = Notifications.addPushTokenListener((token) => {
      const value = String(token.data)
      const rotated = lastToken !== null && value !== lastToken
      lastToken = value
      if (rotated) void registerBuddiesPush().catch(logFailure)
    })
    refreshWhileTrayOpen(useNotificationsTray.getState().open)
    const tray = useNotificationsTray.subscribe((state, previous) => {
      if (state.open !== previous.open) refreshWhileTrayOpen(state.open)
    })
    const plans = useServiceReport.subscribe((state, previous) => {
      if (
        state.dayPlans === previous.dayPlans &&
        state.recurringPlans === previous.recurringPlans
      )
        return
      if (isApplyingRemoteData()) {
        const visits = useConversations.getState().conversations
        adoptArrivedShares(
          { dayPlans: previous.dayPlans, visits },
          { dayPlans: state.dayPlans, visits }
        )
        // A linked Plan from another device may hold the organizer's details
        // from before a change this device has; once the sync has applied,
        // it gets this device's. One holding a newer change is kept.
        followTimer ??= setTimeout(() => {
          followTimer = null
          syncLinkedPlans(undefined, { updatesOnly: true })
        }, 0)
      } else declineDeletedLinkedPlans(previous.dayPlans, state.dayPlans)
      noteEdit()
      publishSharesChange()
    })
    // The streak travels in Buddy Cards too; time logged can move it.
    let streak = JSON.stringify(currentBuddyStreak() ?? null)
    const timeEntries = useServiceReport.subscribe((state, previous) => {
      if (state.serviceReports === previous.serviceReports) return
      const next = JSON.stringify(currentBuddyStreak() ?? null)
      if (next === streak) return
      streak = next
      noteEdit()
      schedulePublish()
    })
    // Name, photo, and Tenure travel in Buddy Cards too.
    const profile = useProfile.subscribe((state, previous) => {
      if (state.name !== previous.name || state.avatar !== previous.avatar)
        noteEdit()
      // Renamed here: every device of this account's cards take the new name.
      if (state.name !== previous.name && isLocalEdit())
        buddiesEngine.setCardName(currentBuddyProfile().name)
      if (state.name !== previous.name) schedulePublish()
      if (state.avatar !== previous.avatar)
        void refreshAvatar().then(schedulePublish)
    })
    // The Pet Companion too: adopting, Change Pet, renaming, or releasing it.
    // Wakes, keepsakes and earned room items restamp the record without
    // changing the card.
    let pet = JSON.stringify(currentBuddyPet() ?? null)
    const petStore = usePet.subscribe((state, previous) => {
      if (state.pet === previous.pet) return
      const next = JSON.stringify(currentBuddyPet() ?? null)
      if (next === pet) return
      pet = next
      noteEdit()
      schedulePublish()
    })
    // So do Tenure, the streak (counted by the role), and earned badges;
    // streaks or badges switched off withdraws them, and badges off this
    // device's badge alerts too.
    const preferences = usePreferences.subscribe((state, previous) => {
      if (
        state.role !== previous.role ||
        state.roleHistory !== previous.roleHistory ||
        state.tenureStartDate !== previous.tenureStartDate ||
        state.earnedBadges !== previous.earnedBadges ||
        state.showBadges !== previous.showBadges ||
        state.showStreaks !== previous.showStreaks ||
        state.dataProtectionMode !== previous.dataProtectionMode
      ) {
        noteEdit()
        schedulePublish()
      }
      if (state.showBadges !== previous.showBadges)
        void registerBuddiesPush().catch(logFailure)
      // Badges off: news not yet sent stays home, even if they come back on.
      if (!state.showBadges && previous.showBadges)
        buddiesEngine.dropBadgeAnnouncements()
    })
    // Follow-up invitations carry the Visit's date and topic and the
    // Contact's first name and address.
    const visits = useConversations.subscribe((state, previous) => {
      if (state.conversations === previous.conversations) return
      if (isApplyingRemoteData()) {
        const { dayPlans } = useServiceReport.getState()
        adoptArrivedShares(
          { dayPlans, visits: previous.conversations },
          { dayPlans, visits: state.conversations }
        )
      }
      publishSharesChange()
    })
    const contacts = useContacts.subscribe((state, previous) => {
      if (state.contacts !== previous.contacts) schedulePublish()
    })
    syncLinkedPlans()
    scheduleHeldReplies()
    /** Whose requests to join, and whether new badges, may alert this device. */
    const pushAlerts = (state: ReturnType<typeof useBuddies.getState>) =>
      JSON.stringify([
        state.joinRequestNotifications,
        state.alertOverrides,
        state.buddies
          .filter((buddy) => buddy.status === 'active')
          .map((buddy) => buddy.inboxId),
        state.badgeNotifications,
      ])
    const buddies = useBuddies.subscribe((state, previous) => {
      if (state.buddies !== previous.buddies)
        forgetRemovedBuddies(previous.buddies, state.buddies)
      // A new buddy's requests need their own push template, and a muted
      // buddy's template is dropped; so is the badge one with alerts off for
      // every buddy.
      if (pushAlerts(state) !== pushAlerts(previous))
        void registerBuddiesPush().catch(logFailure)
      // Entries that arrive already read (alerts off for them here), or that
      // were read on another of this User's devices, don't count toward the
      // bell.
      if (state.notifications !== previous.notifications) {
        const wasRead = new Map(
          previous.notifications.map((n) => [n.id, n.read])
        )
        const quiet = state.notifications
          .filter((n) => n.read && !wasRead.get(n.id))
          .map((n) => n.id)
        if (quiet.length > 0) markSeen(quiet)
      }
      if (state.incomingShares !== previous.incomingShares) {
        syncLinkedPlans(
          sharesJustAccepted(previous.incomingShares, state.incomingShares)
        )
        scheduleHeldReplies()
      }
    })
    const received = Notifications.addNotificationReceivedListener(
      (notification) => {
        // Pushes only: Android's own alert for one carries the same marker.
        const trigger = notification.request.trigger as {
          type?: string
        } | null
        if (trigger?.type !== 'push') return
        const push = buddiesPushData(notification)
        if (!push) return
        syncAfterPush(push.seq)
        void postBuddiesAlert(remoteMessageData(notification)).catch(logFailure)
      }
    )
    return () => {
      if (publishTimer) clearTimeout(publishTimer)
      if (followTimer) clearTimeout(followTimer)
      stopTrayPoll?.()
      stopSuspendedCheck?.()
      if (replyTimer) clearTimeout(replyTimer)
      live.stop()
      useBuddiesDiagnostics.setState({ controls: null })
      foreground.remove()
      background.remove()
      session()
      pushToken.remove()
      tray()
      plans()
      timeEntries()
      profile()
      petStore()
      preferences()
      visits()
      contacts()
      buddies()
      received.remove()
    }
  }, [running])

  return null
}
