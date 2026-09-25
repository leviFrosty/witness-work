import { createContext } from 'react'
import getThemeFromColorScheme, { Theme } from '@/constants/theme'

const darkTheme = getThemeFromColorScheme('dark')

/**
 * Theme for overlays drawn on top of satellite/hybrid imagery. The imagery is
 * dark and busy regardless of the app theme, so — like Apple Maps — overlays
 * switch to the dark palette, with secondary text and borders lifted so they
 * stay legible through the translucent glass. The user's accent is kept.
 */
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

/** Darkens glass surfaces over imagery so text never sits on raw terrain. */
export const MAP_IMAGERY_GLASS_TINT = '#141414A6'

/** True for map overlays rendered over satellite/hybrid imagery. */
export const MapImageryContext = createContext(false)
