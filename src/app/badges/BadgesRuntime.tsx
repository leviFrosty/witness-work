import { useEffect, useRef } from 'react'
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

const EVALUATE_DEBOUNCE_MS = 1500

const localDay = () => new Date().toDateString()

const activeBuddies = (state: ReturnType<typeof useBuddies.getState>) =>
  state.buddies.filter((buddy) => buddy.status === 'active').length

const hydrated = () =>
  usePreferences.persist.hasHydrated() &&
  useServiceReport.persist.hasHydrated() &&
  useConversations.persist.hasHydrated() &&
  useBuddies.persist.hasHydrated()

const BadgesRuntime = () => {
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)

  const justOnboarded = useRef(false)

  useEffect(
    () =>
      usePreferences.subscribe((state, previous) => {
        if (
          state.onboardingComplete &&
          !previous.onboardingComplete &&
          usePreferences.persist.hasHydrated()
        )
          justOnboarded.current = true
      }),
    []
  )

  useEffect(() => {
    if (!onboardingComplete) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let idle: number | null = null
    let evaluatedDay: string | null = null

    let changedAt: number | null = null

    const evaluate = () => {
      timer = null
      if (!hydrated()) return
      const batchAt = changedAt ?? Date.now()
      idle = requestIdleCallback(() => {
        idle = null
        changedAt = null
        const afterOnboarding = justOnboarded.current
        justOnboarded.current = false
        try {
          evaluatedDay = localDay()
          runBadgeEvaluation({ action: actionBehind(batchAt), afterOnboarding })
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
          state.badgeLedger !== previous.badgeLedger ||
          (state.badgesBackfilledAt === null &&
            previous.badgesBackfilledAt !== null)
        )
          schedule()
      }),

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
