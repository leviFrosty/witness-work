import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { toast } from '@/stores/toasts'
import { Car as CarIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

import { usePreferences } from '@/stores/preferences'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import type { RootStackNavigation } from '@/types/rootStack'
import { useShallow } from 'zustand/react/shallow'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'

export default function MileagePromptCard() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  const largeText = useAccessibilityTextSize()
  const { mileageTrackingEnabled, set } = usePreferences(
    useShallow((s) => ({
      mileageTrackingEnabled: s.mileageTrackingEnabled,
      set: s.set,
    }))
  )
  if (mileageTrackingEnabled !== undefined) return null

  const answer = (enabled: boolean) => {
    set({ mileageTrackingEnabled: enabled })

    if (enabled) {
      navigation.navigate('MileageVehicleForm', { source: 'home_prompt' })
      return
    }
    toast.info(i18n.t('mileage.promptDeclined'), {
      message: i18n.t('mileage.promptDeclined_description'),
    })
  }

  const buttonStyle = {
    flex: largeText ? undefined : 1,
    minHeight: MIN_TOUCH_TARGET,
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
      <View style={{ flexDirection: largeText ? 'column' : 'row', gap: 10 }}>
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
