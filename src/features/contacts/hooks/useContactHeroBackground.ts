import { useColorScheme } from 'react-native'
import useTheme from '@/contexts/theme'
import { mix } from '@/lib/color'
import { Contact } from '@/types/contact'

export const useContactHeroBackground = (
  contact:
    | Pick<Contact, 'heroBackground' | 'avatarBackground'>
    | undefined
    | null
): string => {
  const theme = useTheme()
  const colorScheme = useColorScheme()

  const identity =
    contact?.heroBackground ?? contact?.avatarBackground ?? theme.colors.accent
  const isDark = colorScheme === 'dark'
  return mix(identity, '#000000', isDark ? 0.1 : 0.2)
}

export default useContactHeroBackground
