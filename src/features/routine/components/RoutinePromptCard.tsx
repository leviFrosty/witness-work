import { useState } from 'react'
import { View } from 'react-native'
import { BookOpenCheck as BookOpenCheckIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import RoutineSetupSheet from '@/features/routine/components/RoutineSetupSheet'

export default function RoutinePromptCard() {
  const theme = useTheme()
  const largeText = useAccessibilityTextSize()
  const [setupOpen, setSetupOpen] = useState(false)

  const notNow = () => {
    analytics.capture('routine_prompt_dismissed')
    usePreferences.getState().set({ routineEnabled: false })
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
        <LucideIcon
          icon={BookOpenCheckIcon}
          size={22}
          color={theme.colors.accent}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('routine.home.promptTitle')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('routine.home.promptDescription')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: largeText ? 'column' : 'row', gap: 10 }}>
        <Button
          accessibilityRole='button'
          onPress={notNow}
          testID='routine-prompt-not-now'
          style={{
            ...buttonStyle,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('routine.home.promptNotNow')}
          </Text>
        </Button>
        <Button
          accessibilityRole='button'
          onPress={() => setSetupOpen(true)}
          testID='routine-prompt-set-up'
          style={{ ...buttonStyle, backgroundColor: theme.colors.accent }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textInverse,
            }}
          >
            {i18n.t('routine.home.promptSetUp')}
          </Text>
        </Button>
      </View>
      <RoutineSetupSheet open={setupOpen} onClose={() => setSetupOpen(false)} />
    </Card>
  )
}
