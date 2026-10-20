import { Pause as PauseIcon, Play as PlayIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Section from '@/components/ui/inputs/Section'
import XView from '@/components/ui/layout/XView'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useStopWatch } from '@/features/service-reports/hooks/useStopWatch'

/**
 * Today's Plan: Start Timer right where the Plan is, then the running timer's
 * time with Pause. Saving and resetting stay with the timer on Home.
 */
export default function PlanDetailsTimer() {
  const theme = useTheme()
  const { start, stop, isRunning, time, hasStarted } =
    useStopWatch('plan_details')
  const label = i18n.t(
    isRunning
      ? 'timerPause'
      : hasStarted
        ? 'planDetails_timerResume'
        : 'timerStart'
  )
  const color = isRunning ? theme.colors.error : theme.colors.accent

  return (
    <Section>
      <InputRowContainer
        label={i18n.t('timer')}
        lastInSection
        controlWidth='auto'
      >
        <XView style={{ gap: 12 }}>
          {hasStarted ? (
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontVariant: ['tabular-nums'],
                color: isRunning ? theme.colors.text : theme.colors.textAlt,
              }}
            >
              {time}
            </Text>
          ) : null}
          <Button
            accessibilityRole='button'
            accessibilityLabel={label}
            onPress={isRunning ? stop : start}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: theme.numbers.borderRadiusSm,
              borderWidth: 1,
              borderColor: color,
              backgroundColor: isRunning
                ? theme.colors.errorTranslucent
                : theme.colors.accentTranslucent,
            }}
          >
            <LucideIcon
              icon={isRunning ? PauseIcon : PlayIcon}
              color={color}
              size={theme.fontSize('sm')}
            />
            <Text style={{ color, fontFamily: theme.fonts.semiBold }}>
              {label}
            </Text>
          </Button>
        </XView>
      </InputRowContainer>
    </Section>
  )
}
