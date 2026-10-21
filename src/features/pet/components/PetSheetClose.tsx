import { Platform } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X as XIcon } from 'lucide-react-native'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'

/**
 * A close button in the top corner of a pet sheet on Android, which shows the
 * sheets full screen with no grabber to pull down. iOS closes them by pulling
 * the sheet down, so it renders nothing there. Render it last, over the sheet.
 */
export default function PetSheetClose() {
  const theme = useTheme()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  if (Platform.OS !== 'android') return null

  return (
    <IconButton
      icon={XIcon}
      size={20}
      color={theme.colors.text}
      onPress={() => navigation.goBack()}
      style={{
        position: 'absolute',
        top: insets.top + 10,
        right: 14,
        padding: 6,
        // Stays readable over the pinned room once the sheet scrolls.
        borderRadius: 16,
        backgroundColor: theme.colors.sheet,
      }}
    />
  )
}
