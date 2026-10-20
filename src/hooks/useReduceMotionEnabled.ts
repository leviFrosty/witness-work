import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

/**
 * Whether the system Reduce Motion setting is on (iOS Accessibility → Motion,
 * Android "Remove animations"), kept current as it's toggled.
 *
 * Starts from Reanimated's launch-time read so the first frame is right, then
 * follows `AccessibilityInfo`, which reads the same setting on both platforms.
 * Reanimated's `useReducedMotion` alone never updates while the app runs, which
 * long-lived surfaces like the celebration providers need.
 */
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
