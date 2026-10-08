import { analytics } from '@/lib/analytics'
import { useEffect } from 'react'
import * as Linking from 'expo-linking'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import useServiceReport from '@/stores/serviceReport'
import useAnimation from '@/hooks/useAnimation'
import Haptics from '@/lib/haptics'
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
 *    and plays the animation.
 * 2. External URLs (`tel:`, `sms:`, `mailto:`, `http(s):`) — forwarded to the
 *    system handler via `Linking.openURL`. These come from the contacts widget
 *    quick-action buttons.
 *
 * Renders nothing. Must be mounted inside `AnimationViewProvider` so
 * `useAnimation()` can resolve.
 */
export default function SharedGoodNewsListener() {
  const { playConfetti } = useAnimation()

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

      if (!isSharedGoodNewsUrl(url)) return

      // Make sure the Home tab is visible so the user actually sees the
      // confetti when the app comes to the foreground from the widget tap.
      if (navigationRef.isReady()) {
        navigationRef.navigate('Root', { screen: 'Home' } as never)
      }

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
      useServiceReport.getState().addServiceReport(report)
      analytics.capture('time_entry_created', {
        source: 'widget',
        entry_mode: 'checkbox',
      })
      Haptics.heavy()
      setTimeout(() => Haptics.success(), CONFETTI_DELAY_MS + 100)
      playConfetti()
    }

    // Cold start: widget tap launched the app.
    Linking.getInitialURL().then(handle)

    // Warm start: widget tap foregrounded an already-running app.
    const sub = Linking.addEventListener('url', ({ url }) => handle(url))
    return () => sub.remove()
  }, [playConfetti])

  return null
}
