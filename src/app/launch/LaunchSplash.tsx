import { Platform, useWindowDimensions, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import {
  BRAND_MARK_CARD_PATH,
  BRAND_MARK_LINES_PATH,
  BRAND_MARK_PERSON_PATH,
  BRAND_MARK_SIZE,
  SPLASH_BACKGROUND_COLOR,
} from '@/constants/brandMark'

export const splashMarkWidth = (window: { width: number; height: number }) =>
  Platform.OS === 'android'
    ? 160
    : 235 * Math.min(window.width / 1284, window.height / 2778)

const LaunchSplash = () => {
  const window = useWindowDimensions()
  const width = splashMarkWidth(window)
  const height = (width / BRAND_MARK_SIZE.width) * BRAND_MARK_SIZE.height

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SPLASH_BACKGROUND_COLOR,
      }}
    >
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${BRAND_MARK_SIZE.width} ${BRAND_MARK_SIZE.height}`}
      >
        <Path d={BRAND_MARK_CARD_PATH} fill='#FFFFFF' fillRule='evenodd' />
        <Path d={BRAND_MARK_PERSON_PATH} fill='#FFFFFF' />
        <Path d={BRAND_MARK_LINES_PATH} fill='#FFFFFF' />
      </Svg>
    </View>
  )
}

export default LaunchSplash
