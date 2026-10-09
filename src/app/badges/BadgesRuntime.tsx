import { useEffect } from 'react'
import { AppState } from 'react-native'
import {
  isRecordingBadges,
  runBadgeEvaluation,
} from '@/app/badges/runBadgeEvaluation'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { logger } from '@/lib/logger'
import { actionBehind } from '@/lib/userAction'
import { useConversations } from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'

/** Settles a burst of edits (an import, a sync) into one evaluation. */
const EVALUATE_DEBOUNCE_MS = 1500

const localDay = () => new Date().toDateString()

const activeBuddies = (state: ReturnType<typeof useBuddies.getState>) =>
  state.buddies.filter((buddy) => buddy.status === 'active').length

const hydrated = () =>
  usePreferences.persist.hasHydrated() &&
  useServiceReport.persist.hasHydrated() &&
  useConversations.persist.hasHydrated() &&
  useBuddies.persist.hasHydrated()

/**
 * Keeps the User's badges current: evaluates after their records change, when
 * the app comes to the foreground (a Plan's day may have arrived), and once on
 * launch. Each evaluation carries the User's action behind its batch of
 * changes, if any, so only what they just did is celebrated full screen (ADR
 * 0021). Renders nothing; waits until onboarding is done so nothing is
 * celebrated mid-setup.
 */
const BadgesRuntime = () => {
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)

  useEffect(() => {
    if (!onboardingComplete) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let idle: number | null = null
    let evaluatedDay: string | null = null
    // When this batch's first change came in, to find the action behind it.
    let changedAt: number | null = null

    const evaluate = () => {
      timer = null
      if (!hydrated()) return
      const batchAt = changedAt ?? Date.now()
      idle = requestIdleCallback(() => {
        idle = null
        changedAt = null
        try {
          evaluatedDay = localDay()
          runBadgeEvaluation({ action: actionBehind(batchAt) })
        } catch (error) {
          logger.error('[badges] evaluation failed', error)
        }
      })
    }
    const schedule = () => {
      if (changedAt === null) changedAt = Date.now()
      if (timer) clearTimeout(timer)
      timer = setTimeout(evaluate, EVALUATE_DEBOUNCE_MS)
    }

    schedule()
    const unsubscribes = [
      useServiceReport.subscribe((state, previous) => {
        if (
          state.serviceReports !== previous.serviceReports ||
          state.dayPlans !== previous.dayPlans ||
          state.recurringPlans !== previous.recurringPlans
        )
          schedule()
      }),
      useConversations.subscribe((state, previous) => {
        if (state.conversations !== previous.conversations) schedule()
      }),
      usePreferences.subscribe((state, previous) => {
        if (isRecordingBadges()) return
        if (
          state.submittedReportMonths !== previous.submittedReportMonths ||
          // Ledger months synced from another device.
          state.badgeLedger !== previous.badgeLedger ||
          (state.badgesBackfilledAt === null &&
            previous.badgesBackfilledAt !== null)
        )
          schedule()
      }),
      // Buddy Cards arrive often; only pairing and replies matter here.
      useBuddies.subscribe((state, previous) => {
        if (
          activeBuddies(state) !== activeBuddies(previous) ||
          state.shareReplies !== previous.shareReplies ||
          state.incomingShares !== previous.incomingShares
        )
          schedule()
      }),
      usePreferences.persist.onFinishHydration(schedule),
      useServiceReport.persist.onFinishHydration(schedule),
      useConversations.persist.onFinishHydration(schedule),
    ]
    // Data changes are caught above. Coming back on a new day can still bring
    // a Plan's day or a new month.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && evaluatedDay !== localDay()) schedule()
    })

    return () => {
      if (timer) clearTimeout(timer)
      if (idle !== null) cancelIdleCallback(idle)
      unsubscribes.forEach((unsubscribe) => unsubscribe())
      appState.remove()
    }
  }, [onboardingComplete])

  return null
}

export default BadgesRuntime
