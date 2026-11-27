import { fromB64u, toB64u } from '@/lib/bytes'

const JSON_EXT = '.json'
const SEALED_EXT = '.sealed.json'
const PHOTO_PREFIX = 'witness-work-'
const PHOTO_EXT = '.jpg'
const SEALED_PHOTO_PREFIX = 'witness-work-note-s_'

export const SEALED_FORMAT = 1

export const SEALED_FILE_VERSION = Number.MAX_SAFE_INTEGER

export const isSealedSnapshotName = (name: string): boolean =>
  name.endsWith(SEALED_EXT)

export const sealedSnapshotName = (filename: string): string =>
  `${filename.slice(0, -JSON_EXT.length)}${SEALED_EXT}`

export const snapshotNameOf = (stored: string): string =>
  isSealedSnapshotName(stored)
    ? `${stored.slice(0, -SEALED_EXT.length)}${JSON_EXT}`
    : stored

export type SealedEnvelope = {
  format: number
  key: string
  blob: Uint8Array
}

export const sealedEnvelopeJson = (key: string, blob: Uint8Array): string =>
  JSON.stringify({
    version: SEALED_FILE_VERSION,
    sealed: SEALED_FORMAT,
    key,
    blob: toB64u(blob),
  })

export function parseSealedEnvelope(json: string): SealedEnvelope | null {
  try {
    const value = JSON.parse(json) as {
      sealed?: unknown
      key?: unknown
      blob?: unknown
    } | null
    if (
      typeof value?.sealed !== 'number' ||
      typeof value.key !== 'string' ||
      typeof value.blob !== 'string'
    )
      return null
    return {
      format: value.sealed,
      key: value.key,
      blob: fromB64u(value.blob),
    }
  } catch {
    return null
  }
}

export type SealingAdvert = { key: string | null }

const ADVERT_FIELD = '"sealing":'

export function withAdvert(json: string, advert: SealingAdvert): string {
  const field = `${ADVERT_FIELD}${JSON.stringify({ v: SEALED_FORMAT, key: advert.key })}`
  if (!json.startsWith('{')) return json
  const rest = json.slice(1).trimStart()
  return rest.startsWith('}') ? `{${field}${rest}` : `{${field},${rest}`
}

const ADVERT_PATTERN =
  /^\{"sealing":\{"v":(\d+),"key":(null|"[A-Za-z0-9_-]{1,64}")\}/

export function readAdvert(json: string): SealingAdvert | null {
  const match = ADVERT_PATTERN.exec(json.slice(0, 160))
  if (!match) return null
  return { key: match[2] === 'null' ? null : match[2].slice(1, -1) }
}

export const LOCKED_PLACEHOLDER = JSON.stringify({
  version: SEALED_FILE_VERSION,
  sealed: 'other-account',
})
export const NEWER_PLACEHOLDER = JSON.stringify({
  version: SEALED_FILE_VERSION,
})
export const UNREADABLE_PLACEHOLDER = ''

export const isLockedPlaceholder = (json: string): boolean =>
  json === LOCKED_PLACEHOLDER

export const photoMiddle = (filename: string): string | null =>
  filename.startsWith(PHOTO_PREFIX) && filename.endsWith(PHOTO_EXT)
    ? filename.slice(PHOTO_PREFIX.length, -PHOTO_EXT.length)
    : null

export const photoFilenameOf = (middle: string): string =>
  `${PHOTO_PREFIX}${middle}${PHOTO_EXT}`

export const isSealedPhotoName = (name: string): boolean =>
  name.startsWith(SEALED_PHOTO_PREFIX) && name.endsWith(PHOTO_EXT)

export const sealedPhotoNameFor = (sealedMiddle: string): string =>
  `${SEALED_PHOTO_PREFIX}${sealedMiddle}${PHOTO_EXT}`

export const sealedPhotoMiddle = (name: string): string =>
  name.slice(SEALED_PHOTO_PREFIX.length, -PHOTO_EXT.length)
