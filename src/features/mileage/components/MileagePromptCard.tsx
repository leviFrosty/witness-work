import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'
import { Car as CarIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * One-time Home question: track mileage? Yes turns the feature on and asks for
 * the first car; No Thanks hides the card for good. Renders nothing once
 * answered (on any synced device).
 */
export default function MileagePromptCard() {
  const theme = useTheme()
  const toast = useToastController()
  const navigation = useNavigation<RootStackNavigation>()
  const { mileageTrackingEnabled, set } = usePreferences()
  if (mileageTrackingEnabled !== undefined) return null

  const answer = (enabled: boolean) => {
    set({ mileageTrackingEnabled: enabled })
    analytics.capture('mileage_prompt_answered', { enabled })
    if (enabled) {
      navigation.navigate('MileageVehicleForm', { source: 'home_prompt' })
      return
    }
    toast.show(i18n.t('mileage.promptDeclined'), {
      message: i18n.t('mileage.promptDeclined_description'),
      native: true,
    })
  }

  const buttonStyle = {
    flex: 1,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.numbers.borderRadiusMd,
  }

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <LucideIcon icon={CarIcon} size={22} color={theme.colors.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('mileage.promptTitle')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('mileage.promptDescription')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          accessibilityRole='button'
          onPress={() => answer(false)}
          style={{
            ...buttonStyle,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('mileage.promptNo')}
          </Text>
        </Button>
        <Button
          accessibilityRole='button'
          onPress={() => answer(true)}
          style={{ ...buttonStyle, backgroundColor: theme.colors.accent }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textInverse,
            }}
          >
            {i18n.t('mileage.promptYes')}
          </Text>
        </Button>
      </View>
    </Card>
  )
}
