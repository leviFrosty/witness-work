import { hasCapability } from '@/lib/platformCapabilities'

/**
 * Whether a note editor offers Add Photo: the note allows photos, and this
 * platform can sync them. A photo added on the web would never upload, so the
 * phones would show a note photo that's missing.
 */
export const canAddNotePhotos = (allowImages: boolean): boolean =>
  allowImages && hasCapability('syncedPhotos')
