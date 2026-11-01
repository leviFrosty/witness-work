import { useEffect, useState } from 'react'
import { AccessibilityInfo, AppState, Platform } from 'react-native'
import { getFontWeightAdjustment } from '../../modules/font-weight-adjustment'

const androidBoldText = () => getFontWeightAdjustment() > 0

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
