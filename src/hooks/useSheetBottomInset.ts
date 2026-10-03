import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Bottom padding for Tamagui sheets. Android draws edge-to-edge, so sheet
 * content otherwise sits under the system navigation bar. iOS sheets already
 * reserve room for the home indicator in their own padding.
 */
const useSheetBottomInset = () => {
  const insets = useSafeAreaInsets()
  return Platform.OS === 'android' ? insets.bottom : 0
}

export default useSheetBottomInset
