import { Pause as PauseIcon, Play as PlayIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Section from '@/components/ui/inputs/Section'
import XView from '@/components/ui/layout/XView'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAppActive from '@/hooks/useAppActive'
import i18n from '@/lib/locales'
import { formatSecondsSpoken } from '@/lib/minutes'
import {
  formatMs,
  useElapsedMs,
  useStopWatch,
} from '@/features/service-reports/hooks/useStopWatch'

export default function PlanDetailsTimer() {
  const theme = useTheme()
  const { start, stop, isRunning, hasStarted, state } =
    useStopWatch('plan_details')
  const ms = useElapsedMs(state, useAppActive())
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
              accessibilityLabel={formatSecondsSpoken(ms / 1000)}
              style={{
                fontFamily: theme.fonts.semiBold,
                fontVariant: ['tabular-nums'],
                color: isRunning ? theme.colors.text : theme.colors.textAlt,
              }}
            >
              {formatMs(ms)}
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
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: 16,
              borderRadius: 999,
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
