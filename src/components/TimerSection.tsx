import React from 'react'
import { View } from 'react-native'
import Text from './MyText'
import Card from './Card'
import IconButton from './IconButton'
import i18n from '../lib/locales'
import XView from './layout/XView'
import {
  faArrowRotateLeft,
  faFire,
  faFireFlameSimple,
  faPause,
  faPlay,
} from '@fortawesome/free-solid-svg-icons'
import { useStopWatch } from '../hooks/useStopWatch'
import useTheme from '../contexts/theme'

export const TimerSection = () => {
  const { start, stop, reset, isRunning, time } = useStopWatch()
  const theme = useTheme()

  return (
    <View style={{ gap: 10 }}>
      <XView>
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
            marginLeft: 5,
          }}
        >
          {i18n.t('timer')}
        </Text>
      </XView>
      <Card>
        <XView>
          <XView>
            <IconButton
              icon={isRunning ? faFire : faFireFlameSimple}
              color={isRunning ? theme.colors.error : theme.colors.textAlt}
              size={theme.fontSize('lg')}
            />
            <Text
              style={{
                fontSize: theme.fontSize('2xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {time}
            </Text>
          </XView>

          <IconButton
            icon={isRunning ? faPause : faPlay}
            onPress={isRunning ? stop : start}
          />
          <IconButton icon={faArrowRotateLeft} onPress={reset} />

          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('today')}
          </Text>
        </XView>
      </Card>
    </View>
  )
}
