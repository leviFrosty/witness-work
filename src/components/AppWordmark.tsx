import { Image } from 'expo-image'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'

export default function AppWordmark({ size = 20 }: { size?: number }) {
  const theme = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.round(size * 0.35),
      }}
    >
      <Image
        source={require('@/assets/icon.png')}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.23,
        }}
      />
      <Text
        style={{
          fontSize: Math.round(size * 0.7),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          letterSpacing: tracking(0.2),
        }}
      >
        {i18n.t('witnessWork')}
      </Text>
    </View>
  )
}
