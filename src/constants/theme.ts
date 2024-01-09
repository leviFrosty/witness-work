import { ColorSchemeName } from 'react-native'
import { Colors, Theme, ThemeSizes } from '../types/theme'
import * as Device from 'expo-device'

export const lightModeColors = {
  text: '#373737',
  textAlt: '#9B9B9B',
  textInverse: '#FFFFFF',
  textInverseAlt: '#E2E2E2',
  accent: '#1BD15D',
  accentBackground: '#4BD27C',
  accentAlt: '#B7DDC5',
  background: '#E9E9E9',
  backgroundLightest: '#F0F0F0',
  border: '#E1E1E1',
  backgroundLighter: '#F8F8F8',
  card: '#FFFFFF',
  accent2: '#F19389',
  accent2Alt: '#FFF3F2',
  accent3: '#003D46',
  accent3Alt: '#9fb9d1',
  error: '#E30909',
  errorAlt: '#FA6868',
  warn: '#FCC014',
  warnAlt: '#FFEAB8',
  shadow: '#000000',
}

const darkModeColors: Colors = {
  text: '#E2E2E2',
  textAlt: '#7D7D7D',
  textInverse: '#141414',
  textInverseAlt: '#373737',
  accent: '#1BD15D',
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
  errorAlt: '#FA6868',
  warn: '#FCC014',
  warnAlt: '#FFEAB8',
  shadow: '#000000',
}

export const numbers = {
  borderRadiusSm: 5,
  borderRadiusMd: 10,
  borderRadiusLg: 15,
  shadowOpacity: 0.1,
}

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
