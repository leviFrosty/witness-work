import React from 'react'
import { Alert, View } from 'react-native'
import Text from './MyText'
import Card from './Card'
import IconButton from './IconButton'
import i18n from '../lib/locales'
import XView from './layout/XView'
import {
  faArrowRotateLeft,
  faPause,
  faPlay,
} from '@fortawesome/free-solid-svg-icons'
import { useStopWatch } from '../hooks/useStopWatch'
import useTheme from '../contexts/theme'
import Button from './Button'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import { usePreferences } from '../stores/preferences'

export const TimerSection = () => {
  const { start, stop, reset, isRunning, time, ms } = useStopWatch()
  const { mustHaveAtLeastFiveMinutesOnStopwatch, removeHint } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()
  const theme = useTheme()
  const minutes = Math.floor(ms / 60000) % 60
  const hours = Math.floor(ms / 3600000)
  const notEnoughTimeToSave = minutes < 5

  const handleSave = () => {
    if (notEnoughTimeToSave) {
      if (mustHaveAtLeastFiveMinutesOnStopwatch) {
        Alert.alert(
          i18n.t('notEnoughTime'),
          i18n.t('notEnoughTime_description')
        )
        removeHint('mustHaveAtLeastFiveMinutesOnStopwatch')
      }
      return
    }
    navigation.navigate('Add Time', {
      minutes,
      hours,
    })
    reset()
  }

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          marginLeft: 5,
        }}
      >
        {i18n.t('timer')}
      </Text>
      <Card>
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
            style={{
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: theme.numbers.borderRadiusSm,
              backgroundColor: isRunning
                ? theme.colors.error
                : theme.colors.accent,
              flex: 1,
              alignItems: 'center',
            }}
            onPress={isRunning ? stop : start}
          >
            <IconButton
              icon={isRunning ? faPause : faPlay}
              color={theme.colors.textInverse}
              size={theme.fontSize('lg')}
            />
          </Button>

          <Button
            variant='outline'
            style={{
              paddingVertical: 12,
              borderRadius: theme.numbers.borderRadiusSm,
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <IconButton
              icon={faArrowRotateLeft}
              onPress={reset}
              size={theme.fontSize('lg')}
            />
          </Button>

          <Button
            onPress={handleSave}
            variant='outline'
            disabled={
              !mustHaveAtLeastFiveMinutesOnStopwatch && notEnoughTimeToSave
            }
            style={{
              paddingVertical: 12,
              borderRadius: theme.numbers.borderRadiusSm,
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                textDecorationLine: notEnoughTimeToSave ? 'none' : 'underline',
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
    </View>
  )
}
