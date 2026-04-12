import { PropsWithChildren } from 'react'
import { ThemeContext } from '../contexts/theme'
import getThemeFromColorScheme from '../constants/theme'
import { useColorScheme } from 'react-native'
import { usePreferences } from '../stores/preferences'

interface Props {}

const ThemeProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const colorScheme = useColorScheme()
  const { colorScheme: theme } = usePreferences()
  const scheme = colorScheme === 'unspecified' ? undefined : colorScheme
  const userSelectedTheme = getThemeFromColorScheme(theme ?? scheme)

  return (
    <ThemeContext.Provider value={userSelectedTheme}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider
