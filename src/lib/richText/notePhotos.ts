import { hasCapability } from '@/lib/platformCapabilities'

export const canAddNotePhotos = (allowImages: boolean): boolean =>
  allowImages && hasCapability('syncedPhotos')
