import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function usePetSheetInsets() {
  const insets = useSafeAreaInsets()
  const android = Platform.OS === 'android'
  return {
    top: android ? insets.top + 12 : 24,
    bottom: android ? Math.max(insets.bottom, 20) : 8,
  }
}
