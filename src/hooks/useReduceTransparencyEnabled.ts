import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

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
