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

const PUSH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const PUBLISH_DEBOUNCE_MS = 30 * 1000

const SUSPENDED_CHECK_MS = 60 * 1000

const logFailure = (error: unknown) =>
  logger.warn('[buddies] background', error)

let reconcilingLinkedPlans = false

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

const isLocalEdit = () => !isApplyingRemoteData() && !reconcilingLinkedPlans

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

function declineDeletedLinkedPlans(previous: DayPlan[], current: DayPlan[]) {
  for (const key of sharesLeftUnlinked(previous, current)) {
    const share = useBuddies.getState().incomingShares[key]

    if (share?.status !== 'going' || hasSharedEventEnded(share, Date.now()))
      continue

    void buddiesEngine.replyToShare(key, 'declined').catch(logFailure)
  }
}

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

function syncAfterPush(seq: number | undefined) {
  void buddiesEngine.sync({ minSeq: seq, automatic: true }).catch(logFailure)
}

const currentRecipients = () =>
  shareRecipientsKey(
    useServiceReport.getState().dayPlans,
    useConversations.getState().conversations
  )

export default function BuddiesRuntime() {
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const running = enabled && started
  useBuddiesAlertContext()

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

    const publishSharesChange = () => {
      const next = currentRecipients()
      if (next === recipients) {
        schedulePublish()
        return
      }
      recipients = next
      publishNow()
    }

    const scheduleHeldReplies = () => {
      if (replyTimer) clearTimeout(replyTimer)
      replyTimer = null
      const now = Date.now()

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

      onChange: (seq) =>
        void buddiesEngine
          .sync({ minSeq: seq, automatic: true })
          .catch(logFailure),

      verify: () => buddiesEngine.sync({ automatic: true }).catch(logFailure),
      onEvent: recordLiveEvent,
    })

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
    syncNow()
    checkPushRegistration()
    reportAlertOutcomes()
    if (AppState.currentState === 'active') startLive()

    const foreground = addForegroundListener(() => {
      buddiesEngine.expire()
      syncNow()
      checkPushRegistration()
      reportAlertOutcomes()
      startLive()
    })
    const background = addBackgroundListener(() => {
      live.stop()
      if (publishTimer) publishNow()

      void buddiesEngine.sendHeldReplies().catch(logFailure)
    })

    checkWhileSuspended(useBuddiesSession.getState().accountSuspended)
    const session = useBuddiesSession.subscribe((state, previous) => {
      if (state.accountSuspended !== previous.accountSuspended)
        checkWhileSuspended(state.accountSuspended)
      const refused = liveRefused(state)
      if (refused === liveRefused(previous)) return
      if (refused) live.stop()
      else if (AppState.currentState === 'active') startLive()
    })

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

        followTimer ??= setTimeout(() => {
          followTimer = null
          syncLinkedPlans(undefined, { updatesOnly: true })
        }, 0)
      } else declineDeletedLinkedPlans(previous.dayPlans, state.dayPlans)
      noteEdit()
      publishSharesChange()
    })

    let streak = JSON.stringify(currentBuddyStreak() ?? null)
    const timeEntries = useServiceReport.subscribe((state, previous) => {
      if (state.serviceReports === previous.serviceReports) return
      const next = JSON.stringify(currentBuddyStreak() ?? null)
      if (next === streak) return
      streak = next
      noteEdit()
      schedulePublish()
    })

    const profile = useProfile.subscribe((state, previous) => {
      if (state.name !== previous.name || state.avatar !== previous.avatar)
        noteEdit()

      if (state.name !== previous.name && isLocalEdit())
        buddiesEngine.setCardName(currentBuddyProfile().name)
      if (state.name !== previous.name) schedulePublish()
      if (state.avatar !== previous.avatar)
        void refreshAvatar().then(schedulePublish)
    })

    let pet = JSON.stringify(currentBuddyPet() ?? null)
    const petStore = usePet.subscribe((state, previous) => {
      if (state.pet === previous.pet) return
      const next = JSON.stringify(currentBuddyPet() ?? null)
      if (next === pet) return
      pet = next
      noteEdit()
      schedulePublish()
    })

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

      if (!state.showBadges && previous.showBadges)
        buddiesEngine.dropBadgeAnnouncements()
    })

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

      if (pushAlerts(state) !== pushAlerts(previous))
        void registerBuddiesPush().catch(logFailure)

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
