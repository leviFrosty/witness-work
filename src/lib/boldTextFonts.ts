import type { Fonts } from '@/constants/theme'

export const EXTRA_BOLD_FONT = 'Inter_800ExtraBold'

export function boldTextFonts(fonts: Fonts, extraBoldLoaded: boolean): Fonts {
  return {
    regular: fonts.semiBold,
    medium: fonts.bold,
    semiBold: fonts.bold,
    bold: extraBoldLoaded ? EXTRA_BOLD_FONT : fonts.bold,
  }
}
