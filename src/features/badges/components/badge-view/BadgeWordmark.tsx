import { Image } from 'expo-image'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const ICON_SIZE = 20

/**
 * The app icon and name, small, so a screenshot of a badge says where it's
 * from. Decorative for screen readers.
 */
export default function BadgeWordmark() {
  const theme = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
      }}
    >
      <Image
        source={require('@/assets/icon.png')}
        style={{
          width: ICON_SIZE,
          height: ICON_SIZE,
          borderRadius: ICON_SIZE * 0.23,
        }}
      />
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          letterSpacing: 0.2,
        }}
      >
        {i18n.t('witnessWork')}
      </Text>
    </View>
  )
}
