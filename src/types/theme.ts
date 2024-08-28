import { fonts, lightModeColors, numbers } from '../constants/theme'
export type ThemeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'

export type Colors = typeof lightModeColors
export type Fonts = typeof fonts

export type Theme = {
  numbers: typeof numbers
  colors: Colors
  /** Use with `fontFamily` to set Text font weight. */
  fonts: Fonts
  fontSize: (size?: ThemeSize) => number
}
