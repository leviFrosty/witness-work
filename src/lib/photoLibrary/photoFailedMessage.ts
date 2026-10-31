import i18n from '@/lib/locales'
import { UnsupportedImageError } from '@/lib/files/webImages'

/** What to tell the User when picking a photo failed. */
export function photoFailedMessage(
  error: unknown,
  fallbackKey:
    | 'photoPicker_failed'
    | 'richText_photoFailed' = 'photoPicker_failed'
): string {
  if (error instanceof UnsupportedImageError)
    return i18n.t(
      error.reason === 'tooLarge'
        ? 'photoPicker_tooLarge'
        : 'photoPicker_unsupported'
    )
  return i18n.t(fallbackKey)
}
