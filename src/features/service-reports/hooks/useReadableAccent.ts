import { lightModeColors } from '@/constants/theme'
import useTheme from '@/contexts/theme'

const useReadableAccent = () => {
  const theme = useTheme()
  return theme.colors.background === lightModeColors.background
    ? '#0F7535'
    : theme.colors.accent
}

export default useReadableAccent
