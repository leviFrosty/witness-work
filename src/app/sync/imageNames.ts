const IMG_PREFIX = 'witness-work-img-'

const NOTE_IMG_PREFIX = 'witness-work-note-'
const IMG_EXT = '.jpg'
const CONTACT_FILENAME_PREFIX = `${IMG_PREFIX}contact-`
const PROFILE_FILENAME = `${IMG_PREFIX}profile.jpg`

const CONTACT_MARKER_PREFIX = 'icloud://contact-'

export const MARKER_PROFILE = 'icloud://profile'

export function filenameForContact(id: string, revision?: string): string {
  return `${CONTACT_FILENAME_PREFIX}${id}${revision ? `--${revision}` : ''}${IMG_EXT}`
}

export function filenameForProfile(revision?: string): string {
  return revision
    ? `${IMG_PREFIX}profile--${revision}${IMG_EXT}`
    : PROFILE_FILENAME
}

export function markerForContact(id: string): string {
  return `${CONTACT_MARKER_PREFIX}${id}`
}

export function parseContactMarker(value: string): string | null {
  if (!value.startsWith(CONTACT_MARKER_PREFIX)) return null
  const id = value.slice(CONTACT_MARKER_PREFIX.length)
  if (id.length === 0) return null
  return id
}

export function filenameForNoteImage(id: string): string {
  return `${NOTE_IMG_PREFIX}${id}${IMG_EXT}`
}

export function noteImageIdFromFilename(name: string): string | null {
  if (!name.startsWith(NOTE_IMG_PREFIX) || !name.endsWith(IMG_EXT)) return null
  const id = name.slice(NOTE_IMG_PREFIX.length, -IMG_EXT.length)
  return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null
}

export function isProfileMarker(value: string): boolean {
  return value === MARKER_PROFILE
}

export function isValidImageFilename(name: string): boolean {
  const prefix = name.startsWith(IMG_PREFIX)
    ? IMG_PREFIX
    : name.startsWith(NOTE_IMG_PREFIX)
      ? NOTE_IMG_PREFIX
      : null
  if (!prefix) return false
  if (!name.endsWith(IMG_EXT)) return false
  if (name.includes('/')) return false
  if (name.includes('..')) return false
  const middle = name.slice(prefix.length, name.length - IMG_EXT.length)
  if (middle.length === 0) return false
  return true
}
