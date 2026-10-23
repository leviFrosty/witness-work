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
  // `customAvatarBackground` is profile-shaped (it tints the User's avatar),
  // so it lives in the Profile store. The theme still consumes it because the
  // avatar background also drives `accentBackground` system-wide.
  const customAvatarBackground = useProfile((s) => s.customAvatarBackground)
  // The supporter mirror starts from the last known status, so a supporter's
  // accent doesn't flash to the default while RevenueCat loads. It's cosmetic,
  // so the cached hint is enough here.
  const isSupporter = useSupporter((s) => s.isSupporter)
  const { hasAccess: canCustomizeAccent } = evaluateFeatureAccess(
    'customAccentColor',
    { isSupporter }
  )
  const scheme = colorScheme === 'unspecified' ? undefined : colorScheme
  const resolvedScheme = theme ?? scheme
  // Every face is its own font family, so the system's bold text setting can't
  // embolden them; the theme swaps in heavier ones itself.
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
