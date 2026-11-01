import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

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
