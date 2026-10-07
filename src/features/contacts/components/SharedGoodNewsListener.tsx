import { analytics } from '@/lib/analytics'
import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import useServiceReport from '@/stores/serviceReport'
import useAnimation from '@/hooks/useAnimation'
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import Haptics from '@/lib/haptics'
import { noteUserAction } from '@/lib/userAction'
import { usePreferences } from '@/stores/preferences'
import { CONFETTI_DELAY_MS } from '@/providers/AnimationViewProvider'
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import {
  isSharedGoodNewsUrl,
  navigationRef,
} from '@/features/contacts/lib/linking'
import { shouldForwardToSystem } from '@/features/contacts/lib/systemLinks'
import { TimeEntry } from '@/types/timeEntry'

/**
 * Handles widget → app deep links that the React Navigation linking config
 * cannot handle on its own:
 *
 * 1. `witnesswork://shared-good-news` — mirrors the in-app checkbox action from
 *    `PublisherCheckBoxCard`. Logs a 0h0m service report (if not already
 *    reported this month), routes to the Home tab so the confetti is visible,
 *    and plays the animation. It's the User's own action, so a badge or streak
 *    it earns can celebrate (ADR 0021). It waits for onboarding and for
 *    whatever is taking over the screen (the update reveal) to finish first.
 * 2. External URLs (`tel:`, `sms:`, `mailto:`, `http(s):`) — forwarded to the
 *    system handler via `Linking.openURL`. These come from the contacts widget
 *    quick-action buttons.
 *
 * Renders nothing. Must be mounted inside `AnimationViewProvider` so
 * `useAnimation()` can resolve.
 */
export default function SharedGoodNewsListener() {
  const { playConfetti } = useAnimation()
  const onboarded = usePreferences((s) => s.onboardingComplete)
  const takingOver = useIsTakingOver()
  const [pending, setPending] = useState(false)
  const [retry, setRetry] = useState(0)
  useTakeoverHold('shared-good-news', pending)

  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return

      // Forward external URL schemes (tel:, sms:, http(s):, mailto:) to the
      // system. They land here because iOS routes widget Link taps through
      // the host app once the app declares its own scheme. The app's own
      // links (contact shares, Buddies invites) stay in the app.
      if (shouldForwardToSystem(url)) {
        Linking.openURL(url).catch(() => {})
        return
      }

      if (isSharedGoodNewsUrl(url)) setPending(true)
    }

    // Cold start: widget tap launched the app.
    Linking.getInitialURL().then(handle)

    // Warm start: widget tap foregrounded an already-running app.
    const sub = Linking.addEventListener('url', ({ url }) => handle(url))
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!pending || !onboarded || takingOver) return
    // Home has to be on screen so the User actually sees the confetti.
    if (!navigationRef.isReady()) {
      const timer = setTimeout(() => setRetry((count) => count + 1), 300)
      return () => clearTimeout(timer)
    }
    setPending(false)
    navigationRef.navigate('Root', { screen: 'Home' } as never, { pop: true })

    const { serviceReports } = useServiceReport.getState()
    const alreadyReported = getMonthsReports(
      serviceReports,
      moment().month(),
      moment().year()
    ).some(isCountableEntry)
    if (alreadyReported) return

    const report: TimeEntry = {
      date: new Date(),
      hours: 0,
      minutes: 0,
      id: Crypto.randomUUID(),
    }
    noteUserAction('checkbox')
    useServiceReport.getState().addServiceReport(report)
    analytics.capture('time_entry_created', {
      source: 'widget',
      entry_mode: 'checkbox',
    })
    Haptics.heavy()
    setTimeout(() => Haptics.success(), CONFETTI_DELAY_MS + 100)
    playConfetti()
  }, [pending, onboarded, takingOver, retry, playConfetti])

  return null
}
