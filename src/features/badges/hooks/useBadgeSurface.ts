import { lightModeColors } from '@/constants/theme'
import useTheme from '@/contexts/theme'

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
