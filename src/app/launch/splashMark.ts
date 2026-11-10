import { Platform } from 'react-native'

export type LaunchSplashProps = {
  indicator?: boolean
}

export const splashMarkWidth = (window: { width: number; height: number }) =>
  Platform.select({
    android: 160,
    default: 235 * Math.min(window.width / 1284, window.height / 2778),
  })
