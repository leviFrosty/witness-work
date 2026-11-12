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

  const custom = contact?.heroBackground ?? contact?.avatarBackground
  return custom
    ? mix(custom, '#000000', 0.2)
    : mix(theme.colors.accent, '#000000', 0.3)
}

export default useContactHeroBackground
