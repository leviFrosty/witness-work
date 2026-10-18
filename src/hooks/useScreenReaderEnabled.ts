import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/** Whether VoiceOver or TalkBack is running, kept current as it's toggled. */
export default function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (mounted) setEnabled(value)
    })
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setEnabled
    )
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return enabled
}
