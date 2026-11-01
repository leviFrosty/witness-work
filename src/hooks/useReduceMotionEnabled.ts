import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

export default function useReduceMotionEnabled() {
  const launchValue = useReducedMotion()
  const [enabled, setEnabled] = useState(launchValue)

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setEnabled(value)
    })
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setEnabled
    )
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return enabled
}
