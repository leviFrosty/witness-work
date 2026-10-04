import { Platform, useWindowDimensions, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import {
  BRAND_MARK_CARD_PATH,
  BRAND_MARK_LINES_PATH,
  BRAND_MARK_PERSON_PATH,
  BRAND_MARK_SIZE,
  SPLASH_BACKGROUND_COLOR,
} from '@/constants/brandMark'

/**
 * Width, in points, at which the native splash draws the mark. iOS aspect-fits
 * the full-device `splash.png` (a 1284 × 2778 composition whose mark is 235 px
 * wide); Android 12+ centres the 160 dp mark from `splash-android.xml`.
 */
export const splashMarkWidth = (window: { width: number; height: number }) =>
  Platform.OS === 'android'
    ? 160
    : 235 * Math.min(window.width / 1284, window.height / 2778)

/**
 * A pixel match of the native splash screen, shown while the app finishes
 * booting. The system splash hides as soon as React renders its first view, so
 * anything else here (a spinner, a blank frame) flashes between the splash and
 * the first screen — most visibly on a fresh install, right before the
 * onboarding welcome animation picks up from this exact frame.
 */
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
