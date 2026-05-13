import React from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import {
  faArrowRotateLeft,
  faPause,
  faPlay,
} from '@fortawesome/free-solid-svg-icons'
import { useStopWatch } from '@/features/service-reports/hooks/useStopWatch'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import { usePreferences } from '@/stores/preferences'

export const TimerSection = () => {
  const { start, stop, reset, isRunning, time, ms } = useStopWatch()
  const navigation = useNavigation<RootStackNavigation>()
  const theme = useTheme()
  const { homeScreenElements, set } = usePreferences()
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

  const handleHide = () => {
    set({
      homeScreenElements: {
        ...homeScreenElements,
        timer: false,
      },
    })
  }

  return (
    <View style={{ gap: 10 }}>
      <XView style={{ justifyContent: 'space-between', marginHorizontal: 5 }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('timer')}
        </Text>
        <Button onPress={handleHide}>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('hide')}
          </Text>
        </Button>
      </XView>
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
              icon={isRunning ? faPause : faPlay}
              color={isRunning ? theme.colors.error : theme.colors.accent}
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
            onPress={reset}
          >
            <IconButton icon={faArrowRotateLeft} size={theme.fontSize('lg')} />
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
    </View>
  )
}
