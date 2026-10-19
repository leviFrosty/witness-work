import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Top and bottom padding for the pet sheets. iOS presents them as sheets that
 * inset themselves; Android shows them full screen, so they clear the status
 * bar and the navigation bar.
 */
export default function usePetSheetInsets() {
  const insets = useSafeAreaInsets()
  const android = Platform.OS === 'android'
  return {
    top: android ? insets.top + 12 : 24,
    bottom: android ? Math.max(insets.bottom, 20) : 8,
  }
}
