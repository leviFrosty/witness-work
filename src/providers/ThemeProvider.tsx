import { PropsWithChildren, useMemo } from 'react'
import { ThemeContext } from '@/contexts/theme'
import getThemeFromColorScheme from '@/constants/theme'
import { useColorScheme } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { useShallow } from 'zustand/react/shallow'
import { evaluateFeatureAccess } from '@/lib/featureAccess'
import { useSupporter } from '@/stores/supporterStatus'
import { mix, withAlpha } from '@/lib/color'
import useBoldTextFonts from '@/hooks/useBoldTextFonts'
import { increaseContrast } from '@/lib/increaseContrast'
import useIncreaseContrastEnabled from '@/hooks/useIncreaseContrastEnabled'

interface Props {}

const ThemeProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const colorScheme = useColorScheme()
  const { colorScheme: theme, customAccentColor } = usePreferences(
    useShallow((s) => ({
      colorScheme: s.colorScheme,
      customAccentColor: s.customAccentColor,
    }))
  )

  const customAvatarBackground = useProfile((s) => s.customAvatarBackground)

  const isSupporter = useSupporter((s) => s.isSupporter)
  const { hasAccess: canCustomizeAccent } = evaluateFeatureAccess(
    'customAccentColor',
    { isSupporter }
  )
  const scheme = colorScheme ?? undefined
  const resolvedScheme = theme ?? scheme

  const fonts = useBoldTextFonts()
  const userSelectedTheme = getThemeFromColorScheme(resolvedScheme)
  const highContrast = useIncreaseContrastEnabled()

  const themeWithOverrides = useMemo(() => {
    const theme = {
      ...userSelectedTheme,
      fonts,
      ...(highContrast
        ? { colors: increaseContrast(userSelectedTheme.colors) }
        : {}),
    }
    if (!canCustomizeAccent) return theme
    if (!customAccentColor && !customAvatarBackground) return theme

    const isDark = resolvedScheme === 'dark'
    const colors = { ...theme.colors }

    if (customAccentColor) {
      const altTarget = isDark ? '#444444' : '#FFFFFF'
      const altRatio = isDark ? 0.55 : 0.7
      colors.accent = customAccentColor
      colors.accentTranslucent = withAlpha(customAccentColor, 0x33)
      colors.accentAlt = mix(customAccentColor, altTarget, altRatio)
      colors.accentBackground = customAccentColor
    }

    if (customAvatarBackground) {
      colors.accentBackground = customAvatarBackground
    }

    return { ...theme, colors }
  }, [
    userSelectedTheme,
    fonts,
    highContrast,
    canCustomizeAccent,
    customAccentColor,
    customAvatarBackground,
    resolvedScheme,
  ])

  return (
    <ThemeContext.Provider value={themeWithOverrides}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider
