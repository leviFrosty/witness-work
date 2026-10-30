import { Platform } from 'react-native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'

/**
 * A window wide enough for two columns, in a browser. Forms dock their fields
 * above the keyboard near the thumb on a phone; a browser has no thumb to be
 * near, and a wide window leaves a gap between the title and fields, so they
 * start at the top instead.
 */
export default function useWideOnWeb() {
  const { isWide } = useAdaptiveLayout()
  return isWide && Platform.OS === 'web'
}
