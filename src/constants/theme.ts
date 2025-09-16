import { ColorSchemeName } from 'react-native'
import * as Device from 'expo-device'

export const lightModeColors = {
  text: '#373737',
  textAlt: '#9B9B9B',
  textInverse: '#FFFFFF',
  textInverseAlt: '#E2E2E2',
  accent: '#08cc50',
  accentTranslucent: '#1BD15D33',
  accentBackground: '#4BD27C',
  accentAlt: '#B7DDC5',
  background: '#E9E9E9',
  backgroundLightest: '#F0F0F0',
  border: '#dbdbdb',
  backgroundLighter: '#F8F8F8',
  card: '#FFFFFF',
  accent2: '#F19389',
  accent2Alt: '#FFF3F2',
  accent3: '#003D46',
  accent3Alt: '#9fb9d1',
  error: '#E30909',
  errorTranslucent: '#E3090933',
  errorAlt: '#FA6868',
  warn: '#d19b00',
  warnTranslucent: '#d19b0033',
  warnAlt: '#FFEAB8',
  shadow: '#000000',
  // Feature showcase colors
  purple: '#8B5CF6',
  purpleAlt: '#EDE9FE',
  teal: '#14B8A6',
  tealAlt: '#F0FDFA',
  orange: '#F97316',
  orangeAlt: '#FFF7ED',
  pink: '#EC4899',
  pinkAlt: '#FDF2F8',
  indigo: '#6366F1',
  indigoAlt: '#EEF2FF',
  cyan: '#06B6D4',
  cyanAlt: '#ECFEFF',
  lime: '#84CC16',
  limeAlt: '#F7FEE7',
  rose: '#F43F5E',
  roseAlt: '#FFF1F2',
}

const darkModeColors: Colors = {
  text: '#E2E2E2',
  textAlt: '#7D7D7D',
  textInverse: '#141414',
  textInverseAlt: '#373737',
  accent: '#1BD15D',
  accentTranslucent: '#1BD15D33',
  accentBackground: '#4BD27C',
  accentAlt: '#99BFA7',
  background: '#121212',
  backgroundLightest: '#0D0D0D',
  border: '#333333',
  backgroundLighter: '#1E1E1E',
  card: '#242424',
  accent2: '#F19389',
  accent2Alt: '#FFF3F2',
  accent3: '#159fb0',
  accent3Alt: '#003D46',
  error: '#F20A0A',
  errorTranslucent: '#F20A0A33',
  errorAlt: '#FA6868',
  warn: '#FCC014',
  warnTranslucent: '#FCC01433',
  warnAlt: '#FFEAB8',
  shadow: '#000000',
  // Feature showcase colors
  purple: '#A78BFA',
  purpleAlt: '#2D1B69',
  teal: '#5EEAD4',
  tealAlt: '#134E4A',
  orange: '#FB923C',
  orangeAlt: '#7C2D12',
  pink: '#F472B6',
  pinkAlt: '#831843',
  indigo: '#818CF8',
  indigoAlt: '#312E81',
  cyan: '#22D3EE',
  cyanAlt: '#164E63',
  lime: '#A3E635',
  limeAlt: '#365314',
  rose: '#FB7185',
  roseAlt: '#881337',
}

export const numbers = {
  borderRadiusSm: 5,
  borderRadiusMd: 10,
  borderRadiusLg: 15,
  borderRadiusXl: 25,
  shadowOpacity: 0.1,
}

/**
 * In reality, these are also used to set the font weight. Setting the font
 * weight directly does not work due to custom font being used.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
}

const fontSize = (size?: ThemeSizes) => {
  const defaultSize = 14
  const isTablet = Device.deviceType === Device.DeviceType.TABLET
  // Slightly increases default font size for readability on large devices
  const deviceTypeOffset = isTablet ? 2 : 0

  const sizeFromDefault = (offset: number) => {
    return defaultSize + deviceTypeOffset + offset
  }

  switch (size) {
    case 'xs':
      return sizeFromDefault(-4)
    case 'sm':
      return sizeFromDefault(-2)
    case 'md':
      return sizeFromDefault(0)
    case 'lg':
      return sizeFromDefault(2)
    case 'xl':
      return sizeFromDefault(6)
    case '2xl':
      return sizeFromDefault(10)
    case '3xl':
      return sizeFromDefault(14)
    case '4xl':
      return sizeFromDefault(18)
    default:
      return sizeFromDefault(0)
  }
}

const baseTheme = {
  numbers,
  fonts,
  fontSize,
}

const getThemeFromColorScheme = (colorScheme: ColorSchemeName): Theme => {
  if (colorScheme === 'light') {
    return {
      ...baseTheme,
      colors: lightModeColors,
    }
  }
  return {
    ...baseTheme,
    colors: darkModeColors,
  }
}

export default getThemeFromColorScheme

export type ThemeSizes =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'

export type Colors = typeof lightModeColors
export type Fonts = typeof fonts

export type Theme = {
  numbers: typeof numbers
  colors: Colors
  /** Use with `fontFamily` to set Text font weight. */
  fonts: Fonts
  fontSize: (size?: ThemeSizes) => number
}
