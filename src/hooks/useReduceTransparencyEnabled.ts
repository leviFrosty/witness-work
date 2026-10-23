import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Whether iOS Reduce Transparency (Accessibility → Display & Text Size) is on,
 * kept current as it's toggled. Always false on Android, which has no such
 * setting.
 */
export default function useReduceTransparencyEnabled() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceTransparencyEnabled().then(
      (value) => {
        if (mounted) setEnabled(value)
      },
      () => {}
    )
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setEnabled
    )
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return enabled
}
