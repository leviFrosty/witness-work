import { useEffect, useState } from 'react'
import { AccessibilityInfo, AppState, Platform } from 'react-native'
import { getFontWeightAdjustment } from '../../modules/font-weight-adjustment'

const androidBoldText = () => getFontWeightAdjustment() > 0

/**
 * Whether the system's bold text setting is on (iOS Bold Text, Android Bold
 * text), kept current as it's toggled. Android has no change event, but the
 * setting is changed in the Settings app, so it's read again whenever the app
 * comes back to the foreground.
 */
export default function useBoldTextEnabled() {
  const [enabled, setEnabled] = useState(() =>
    Platform.OS === 'android' ? androidBoldText() : false
  )

  useEffect(() => {
    if (Platform.OS === 'android') {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') setEnabled(androidBoldText())
      })
      return () => subscription.remove()
    }

    let mounted = true
    AccessibilityInfo.isBoldTextEnabled().then(
      (value) => {
        if (mounted) setEnabled(value)
      },
      () => {}
    )
    const subscription = AccessibilityInfo.addEventListener(
      'boldTextChanged',
      setEnabled
    )
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return enabled
}
