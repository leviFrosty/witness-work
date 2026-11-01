import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { contentHash } from '@/lib/contentHash'
import { mapRichTextImages } from '@/lib/richText/inspect'
import { parseRichTextDoc, RICH_TEXT_VERSION } from '@/lib/richText/parse'
import type { NoteFields, RichTextDoc } from '@/types/richText'
import { fromB64u, toB64u } from '@/features/buddies/lib/bytes'
import { openBytes, sealBytes, sha256 } from '@/features/buddies/lib/crypto'
import type { SharedPhoto, ShareDetails } from '@/features/buddies/lib/schemas'

export const SHARED_PHOTO_AAD = 'ww-buddies/v1/photo'

export const PROFILE_PHOTO_AAD = 'ww-buddies/v1/profile-photo'

const DAY_MS = 24 * 60 * 60 * 1000

export const SHARED_PHOTO_MAX_LIFETIME_MS = 89 * DAY_MS

export const SHARED_PHOTO_REFRESH_MS = 30 * DAY_MS

export const sharedPhotoExpiry = (until: number, now: number) =>
  Math.min(until, now + SHARED_PHOTO_MAX_LIFETIME_MS)

export const sharedPhotoCovers = (
  expiresAt: number,
  until: number,
  now: number
) =>
  expiresAt >= sharedPhotoExpiry(until, now) ||
  expiresAt - now > SHARED_PHOTO_REFRESH_MS

const MAX_DOC_BYTES = 256 * 1024

export function encodeSharedNoteDoc(doc: RichTextDoc): string {
  return toB64u(deflateSync(strToU8(JSON.stringify(doc)), { level: 9 }))
}

export function decodeSharedNoteDoc(
  text: string | undefined
): RichTextDoc | null {
  if (!text) return null
  try {
    const out = inflateSync(fromB64u(text), {
      out: new Uint8Array(MAX_DOC_BYTES),
    })

    if (out.length >= MAX_DOC_BYTES) return null
    return parseRichTextDoc(JSON.parse(strFromU8(out)))
  } catch {
    return null
  }
}

export type SealedPhoto = { sealed: Uint8Array; blobId: string }

export function sealSharedPhoto(
  bytes: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  aad = SHARED_PHOTO_AAD
): SealedPhoto {
  const sealed = sealBytes(key, bytes, aad, nonce)
  return { sealed, blobId: toB64u(sha256(sealed)) }
}

export function openSharedPhoto(
  sealed: Uint8Array,
  photo: Pick<SharedPhoto, 'blob' | 'key'>,
  aad = SHARED_PHOTO_AAD
): Uint8Array | null {
  if (toB64u(sha256(sealed)) !== photo.blob) return null
  try {
    return openBytes(fromB64u(photo.key), sealed, aad)
  } catch {
    return null
  }
}

export function localSharedPhotoId(blobId: string): string {
  return Array.from(fromB64u(blobId), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

export function sharedNoteFields(details: ShareDetails): NoteFields {
  const note = details.note
  const doc = decodeSharedNoteDoc(details.noteDoc)
  if (!doc) return { note }
  const photos = new Map(
    (details.photos ?? []).map((photo) => [photo.id, photo])
  )
  const local = mapRichTextImages(doc, (image) => {
    const photo = photos.get(image.id)
    return photo
      ? {
          ...image,
          id: localSharedPhotoId(photo.blob),
          width: photo.w,
          height: photo.h,
        }
      : null
  })
  return {
    note,
    noteDoc: {
      v: RICH_TEXT_VERSION,
      doc: local,
      textHash: contentHash(note ?? ''),
    },
  }
}
