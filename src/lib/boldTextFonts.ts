import type { Fonts } from '@/constants/theme'

/** Inter's 800 face, loaded only once Bold Text is on (see useBoldTextFonts). */
export const EXTRA_BOLD_FONT = 'Inter_800ExtraBold'

/**
 * The app's faces one weight heavier, as iOS Bold Text does to the system font:
 * regular reads as semibold, medium and semibold as bold, bold as extra bold.
 * The system can't do this itself, since every face is its own custom font
 * family. Until the extra bold face has loaded, bold stays bold.
 */
export function boldTextFonts(fonts: Fonts, extraBoldLoaded: boolean): Fonts {
  return {
    regular: fonts.semiBold,
    medium: fonts.bold,
    semiBold: fonts.bold,
    bold: extraBoldLoaded ? EXTRA_BOLD_FONT : fonts.bold,
  }
}
