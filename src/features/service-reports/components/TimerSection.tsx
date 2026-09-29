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
import { useStopWatch } from '@/features/service-reports/hooks/useStopWatch'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import HomeSectionMenu from '@/components/HomeSectionMenu'

export const TimerSection = () => {
  const { start, stop, reset, isRunning, time, ms } = useStopWatch()
  const navigation = useNavigation<RootStackNavigation>()
  const theme = useTheme()
  const minutes = Math.floor(ms / 60000) % 60
  const hours = Math.floor(ms / 3600000)
  const notEnoughTimeToSave = minutes < 5

  const handleSave = () => {
    reset()
    navigation.navigate('Add Time', {
      minutes,
      hours,
    })
  }

  const hasTime = ms >= 60000

  // The whole card long-presses for the section menu (hiding also lives in
  // Preferences → Home Screen); the buttons keep their own taps, which win for
  // touches that land on them. Not one accessibility element, so the buttons
  // stay individually reachable.
  return (
    <HomeSectionMenu
      section='timer'
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
          ms > 0 && {
            id: 'reset',
            title: i18n.t('timerResetAction'),
            systemImage: 'arrow.counterclockwise',
            onPress: reset,
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
              letterSpacing: 0.5,
            }}
          >
            {i18n.t('timer')}
          </Text>
        </View>
        <Text
          style={{
            fontSize: theme.fontSize('3xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {time}
        </Text>
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
            onPress={reset}
          >
            <IconButton icon={RotateCcwIcon} size={theme.fontSize('lg')} />
          </Button>

          <Button
            onPress={handleSave}
            variant='outline'
            style={{
              paddingVertical: 12,
              borderRadius: theme.numbers.borderRadiusSm,
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                textDecorationLine: 'underline',
                color: notEnoughTimeToSave
                  ? theme.colors.textAlt
                  : theme.colors.text,
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
