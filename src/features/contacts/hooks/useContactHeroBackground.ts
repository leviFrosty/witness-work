import { useColorScheme } from 'react-native'
import useTheme from '../../../contexts/theme'
import { mix } from '../../../lib/color'
import { Contact } from '../../../types/contact'

/**
 * Resolves the background color for a contact's hero / header chrome.
 *
 * Editable independently of the avatar disc, but inherits from it when not set
 * so the two stay visually paired by default. Resolution order:
 *
 * 1. `contact.heroBackground` — explicit per-contact hero override
 * 2. `contact.avatarBackground` — inherit the avatar's tint
 * 3. `theme.colors.accent` — same source the rest of the app uses
 *
 * Note: we deliberately fall back to `accent` rather than `accentBackground`.
 * `accentBackground` is overridden by the user-level `customAvatarBackground`
 * preference (in `ThemeProvider`) — that's a knob meant for the avatar disc
 * only, and using it here would tint the entire hero with the user's personal
 * avatar color, which is jarring (the disc itself only picks it up for image
 * fallback paths, so the colors wouldn't even agree visually).
 *
 * Both modes darken the identity so `textInverse` reads cleanly: light mode
 * darkens harder (white text) and dark mode darkens lightly (near-black text on
 * a still-mid-bright field).
 */
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
  return mix(identity, '#000000', isDark ? 0.25 : 0.5)
}

export default useContactHeroBackground
