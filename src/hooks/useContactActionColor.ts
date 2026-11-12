import useTheme from '@/contexts/theme'
import { contrastRatio } from '@/lib/color'
import type { Contact } from '@/types/contact'

const MIN_ACTION_CONTRAST = 1.6
const ON_ACTION_DARK = '#141414'
const ON_ACTION_LIGHT = '#FFFFFF'

export const actionForeground = (action: string): string =>
  contrastRatio(ON_ACTION_DARK, action) >=
  contrastRatio(ON_ACTION_LIGHT, action)
    ? ON_ACTION_DARK
    : ON_ACTION_LIGHT

export const useContactActionColor = (
  contact:
    | Pick<Contact, 'heroBackground' | 'avatarBackground'>
    | undefined
    | null
): string => {
  const theme = useTheme()
  const custom = contact?.heroBackground ?? contact?.avatarBackground
  if (!custom) return theme.colors.accent
  return contrastRatio(custom, theme.colors.card) >= MIN_ACTION_CONTRAST
    ? custom
    : theme.colors.text
}
