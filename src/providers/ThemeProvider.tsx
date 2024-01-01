import { PropsWithChildren } from 'react'
import { ThemeContext } from '../contexts/theme'
import getThemeFromColorScheme from '../constants/theme'
import { useColorScheme } from 'react-native'

interface Props {}

const ThemeProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const colorScheme = useColorScheme()
  const theme = getThemeFromColorScheme(colorScheme)

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export default ThemeProvider
