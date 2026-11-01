import {
  Pause as PauseIcon,
  Play as PlayIcon,
  RotateCcw as RotateCcwIcon,
} from 'lucide-react-native'
import React from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import {
  computeElapsedMs,
  formatMs,
  MIN_MS_TO_SAVE,
  RESET_CONFIRM_MIN_MS,
  sessionStartMs,
  splitElapsed,
  useElapsedMs,
  useElapsedReached,
  useStopWatch,
} from '@/features/service-reports/hooks/useStopWatch'
import type { StopwatchState } from '../../../../modules/stopwatch-bridge'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import { tracking } from '@/lib/tracking'
import confirmDestructive from '@/lib/confirmDestructive'
import { formatSecondsSpoken } from '@/lib/minutes'
import useAppActive from '@/hooks/useAppActive'
import useShownInTab from '@/hooks/useShownInTab'

const TimerReadout = ({ state }: { state: StopwatchState }) => {
  const theme = useTheme()
  const shown = useShownInTab()
  const active = useAppActive()
  const ms = useElapsedMs(state, shown && active)

  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      accessibilityLabel={formatSecondsSpoken(ms / 1000)}
      style={{
        fontSize: theme.fontSize('3xl'),
        fontFamily: theme.fonts.bold,
      }}
    >
      {formatMs(ms)}
    </Text>
  )
}

export const TimerSection = () => {
  const { start, stop, reset, isRunning, hasStarted, state } = useStopWatch()
  const navigation = useNavigation<RootStackNavigation>()
  const theme = useTheme()
  const hasTime = useElapsedReached(state, MIN_MS_TO_SAVE)

  const handleSave = () => {
    const now = Date.now()
    const ms = computeElapsedMs(state, now)
    const sessionStartedAt = sessionStartMs(state, now)
    navigation.navigate('Add Time', {
      ...splitElapsed(ms),
      date:
        sessionStartedAt != null
          ? new Date(sessionStartedAt).toISOString()
          : undefined,
      fromTimer: true,
      timerSessionStart: sessionStartedAt ?? undefined,
    })
  }

  const handleReset = () => {
    if (computeElapsedMs(state, Date.now()) < RESET_CONFIRM_MIN_MS) {
      reset()
      return
    }
    confirmDestructive({
      title: i18n.t('resetTimer'),
      description: i18n.t('resetTimer_description'),
      confirmLabel: i18n.t('reset'),
      onConfirm: reset,
    })
  }

  return (
    <HomeSectionMenu
      accessible={false}
      actions={[
        [
          {
            id: isRunning ? 'pause' : 'start',
            title: i18n.t(isRunning ? 'timerPauseAction' : 'timerStartAction'),
            systemImage: isRunning ? 'pause' : 'play',
            onPress: isRunning ? stop : start,
          },
          hasTime && {
            id: 'save',
            title: i18n.t('timerSaveAction'),
            systemImage: 'square.and.arrow.down',
            onPress: handleSave,
          },
          hasStarted && {
            id: 'reset',
            title: i18n.t('timerResetAction'),
            systemImage: 'arrow.counterclockwise',
            onPress: handleReset,
          },
        ],
      ]}
    >
      <Card>
        <View accessible accessibilityRole='header'>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              textTransform: 'uppercase',
              letterSpacing: tracking(0.5),
            }}
          >
            {i18n.t('timer')}
          </Text>
        </View>
        <TimerReadout state={state} />
        <XView>
          <Button
            accessibilityRole='button'
            accessibilityLabel={i18n.t(isRunning ? 'timerPause' : 'timerStart')}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: theme.numbers.borderRadiusSm,
              borderColor: isRunning ? theme.colors.error : theme.colors.accent,
              borderWidth: 1,
              backgroundColor: isRunning
                ? theme.colors.errorTranslucent
                : theme.colors.accentTranslucent,
              flex: 1,
              alignItems: 'center',
            }}
            onPress={isRunning ? stop : start}
          >
            <IconButton
              icon={isRunning ? PauseIcon : PlayIcon}
              color={isRunning ? theme.colors.error : theme.colors.accent}
              size={theme.fontSize('lg')}
            />
          </Button>
          <Button
            accessibilityRole='button'
            accessibilityLabel={i18n.t('reset')}
            variant='outline'
            style={{
              paddingVertical: 12,
              borderRadius: theme.numbers.borderRadiusSm,
              flex: 1,
              justifyContent: 'center',
            }}
            onPress={handleReset}
          >
            <IconButton icon={RotateCcwIcon} size={theme.fontSize('lg')} />
          </Button>

          <Button
            onPress={handleSave}
            disabled={!hasTime}
            variant='outline'
            style={{
              paddingVertical: 12,
              borderRadius: theme.numbers.borderRadiusSm,
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                textDecorationLine: 'underline',
                color: hasTime ? theme.colors.text : theme.colors.textAlt,
              }}
            >
              {i18n.t('save')}
            </Text>
          </Button>
        </XView>
      </Card>
    </HomeSectionMenu>
  )
}
