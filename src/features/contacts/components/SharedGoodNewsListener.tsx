import { useEffect } from 'react'
import * as Linking from 'expo-linking'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import useServiceReport from '@/stores/serviceReport'
import useAnimation from '@/hooks/useAnimation'
import Haptics from '@/lib/haptics'
import { CONFETTI_DELAY_MS } from '@/providers/AnimationViewProvider'
import { getMonthsReports } from '@/lib/serviceReport'
import { isSharedGoodNewsUrl, navigationRef } from '@/lib/linking'
import { isContactShareLink } from '@/features/contacts/lib/contactShareLink'
import { ServiceReport } from '@/types/serviceReport'

/**
 * Schemes that the host app must hand off to the system instead of trying to
 * handle itself. iOS routes widget `Link(destination:)` taps through the host
 * app first when the host declares any custom URL scheme — so without this
 * forwarder, tapping the call/text/directions buttons on the contacts widget
 * just opens WitnessWork.
 */
const FORWARDED_SCHEMES = ['tel:', 'sms:', 'mailto:', 'http:', 'https:']

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
      // the host app once the app declares its own scheme. Skip contact-share
      // universal links — those are in-app URLs handled by
      // ContactImportListener; forwarding them bounces the user to Safari.
      if (
        FORWARDED_SCHEMES.some((s) => url.startsWith(s)) &&
        !isContactShareLink(url)
      ) {
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
      const alreadyReported =
        getMonthsReports(serviceReports, moment().month(), moment().year())
          .length > 0
      if (alreadyReported) return

      const report: ServiceReport = {
        date: new Date(),
        hours: 0,
        minutes: 0,
        id: Crypto.randomUUID(),
      }
      useServiceReport.getState().addServiceReport(report)
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
