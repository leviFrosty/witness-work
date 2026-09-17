import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import useCustomer from '@/hooks/useCustomer'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import {
  applyAppIcon,
  determineHemisphere,
  resolvePluginIcon,
} from '@/features/settings/lib/appIcon'

// Wait for RevenueCat to avoid a false lapse on launch. Reapply on foreground
// to pick up seasonal changes and lapses; applyAppIcon skips unchanged icons.
export default function AppIconSync() {
  const { customer } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { customAppIcon } = usePreferences()
  const supporterStatusKnown = customer !== null

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!supporterStatusKnown) return

    let cancelled = false
    const apply = async () => {
      const target =
        isSupporter && customAppIcon
          ? resolvePluginIcon(customAppIcon, await determineHemisphere())
          : null
      if (cancelled) return
      try {
        await applyAppIcon(target)
      } catch {
        // The system "App Icon Updated" alert is the user-visible failure
        // mode anyway; swallow so a transient glitch doesn't crash boot.
      }
    }

    void apply()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void apply()
    })
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [supporterStatusKnown, isSupporter, customAppIcon])

  return null
}
