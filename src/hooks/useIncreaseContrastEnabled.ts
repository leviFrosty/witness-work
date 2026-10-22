import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Whether iOS Increase Contrast (Accessibility → Display & Text Size) is on,
 * kept current as it's toggled. Always false on Android, whose High contrast
 * text the system applies to every text view itself.
 */
export default function useIncreaseContrastEnabled() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isDarkerSystemColorsEnabled().then(
      (value) => {
        if (mounted) setEnabled(value)
      },
      () => {}
    )
    const subscription = AccessibilityInfo.addEventListener(
      'darkerSystemColorsChanged',
      setEnabled
    )
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return enabled
}
