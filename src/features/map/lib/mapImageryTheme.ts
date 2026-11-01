import { createContext } from 'react'
import getThemeFromColorScheme, { Theme } from '@/constants/theme'

const darkTheme = getThemeFromColorScheme('dark')

export const getMapImageryTheme = (appTheme: Theme): Theme => ({
  ...appTheme,
  colors: {
    ...darkTheme.colors,
    accent: appTheme.colors.accent,
    accentTranslucent: appTheme.colors.accentTranslucent,
    accentBackground: appTheme.colors.accentBackground,
    textAlt: '#C4C4C4',
    border: '#FFFFFF4D',
  },
})

export const MAP_IMAGERY_GLASS_TINT = '#141414A6'

export const MapImageryContext = createContext(false)
