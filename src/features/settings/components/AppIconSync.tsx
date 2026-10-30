import { useEffect } from 'react'
import { AppState } from 'react-native'
import useCustomer from '@/hooks/useCustomer'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import {
  applyAppIcon,
  determineHemisphere,
  resolvePluginIcon,
} from '@/features/settings/lib/appIcon'
import { hasCapability } from '@/lib/platformCapabilities'

// Wait for RevenueCat to avoid a false lapse on launch. Reapply on foreground
// to pick up seasonal changes and lapses; applyAppIcon skips unchanged icons.
export default function AppIconSync() {
  const { customer } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const customAppIcon = usePreferences((s) => s.customAppIcon)
  const supporterStatusKnown = customer !== null

  useEffect(() => {
    if (!hasCapability('alternateAppIcons')) return
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
