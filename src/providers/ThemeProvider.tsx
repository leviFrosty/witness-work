import { PropsWithChildren, useMemo } from 'react'
import { ThemeContext } from '@/contexts/theme'
import getThemeFromColorScheme from '@/constants/theme'
import { useColorScheme } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import { mix, withAlpha } from '@/lib/color'

interface Props {}

const ThemeProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const colorScheme = useColorScheme()
  const { colorScheme: theme, customAccentColor } = usePreferences()
  // `customAvatarBackground` is profile-shaped (it tints the User's avatar),
  // so it lives in the Profile store. The theme still consumes it because the
  // avatar background also drives `accentBackground` system-wide.
  const { customAvatarBackground } = useProfile()
  const { hasAccess: canCustomizeAccent } =
    useFeatureAccess('customAccentColor')
  const scheme = colorScheme === 'unspecified' ? undefined : colorScheme
  const resolvedScheme = theme ?? scheme
  const userSelectedTheme = getThemeFromColorScheme(resolvedScheme)

  const themeWithOverrides = useMemo(() => {
    if (!canCustomizeAccent) return userSelectedTheme
    if (!customAccentColor && !customAvatarBackground) return userSelectedTheme

    const isDark = resolvedScheme === 'dark'
    const colors = { ...userSelectedTheme.colors }

    if (customAccentColor) {
      // Mix toward white in light mode and toward a mid-gray in dark mode
      // so the muted "alt" variant reads as a soft background instead of a
      // washed-out highlight — matching how the stock green palette behaves.
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

    return { ...userSelectedTheme, colors }
  }, [
    userSelectedTheme,
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
