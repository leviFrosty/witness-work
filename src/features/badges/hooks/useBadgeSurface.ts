import { lightModeColors } from '@/constants/theme'
import useTheme from '@/contexts/theme'

/**
 * The full-screen badge moments' backdrop: a clean light page in light mode,
 * near-black in dark, with the medallion art's matching scheme.
 */
export default function useBadgeSurface() {
  const theme = useTheme()
  const scheme: 'light' | 'dark' =
    theme.colors.background === lightModeColors.background ? 'light' : 'dark'
  return {
    scheme,
    surface:
      scheme === 'light'
        ? theme.colors.backgroundLighter
        : theme.colors.background,
  }
}
