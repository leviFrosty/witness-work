import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { contentHash } from '@/lib/contentHash'
import { mapRichTextImages } from '@/lib/richText/inspect'
import { parseRichTextDoc, RICH_TEXT_VERSION } from '@/lib/richText/parse'
import type { NoteFields, RichTextDoc } from '@/types/richText'
import { fromB64u, toB64u } from '@/features/buddies/lib/bytes'
import { openBytes, sealBytes, sha256 } from '@/features/buddies/lib/crypto'
import type { SharedPhoto, ShareDetails } from '@/features/buddies/lib/schemas'

/*
 * A shared Plan's note with its formatting and photos (docs/buddies-protocol.md,
 * "Shared note photos"). `note` stays plain text; `noteDoc` is the deflated doc;
 * each photo is a blob the sender sealed with its own random key and uploaded
 * once, readable by anyone holding the event's key and read token.
 */

/** Binds a photo's ciphertext to its use. */
export const SHARED_PHOTO_AAD = 'ww-buddies/v1/photo'

const DAY_MS = 24 * 60 * 60 * 1000
/** The relay keeps a photo at most 90 days; a day less allows for clock skew. */
export const SHARED_PHOTO_MAX_LIFETIME_MS = 89 * DAY_MS
/**
 * An upload with less than this left is uploaded again (a new blob) when its
 * Plan needs the photo for longer, e.g. a Plan more than two months out.
 */
export const SHARED_PHOTO_REFRESH_MS = 30 * DAY_MS

/** When a photo needed until `until` should expire on the relay. */
export const sharedPhotoExpiry = (until: number, now: number) =>
  Math.min(until, now + SHARED_PHOTO_MAX_LIFETIME_MS)

/**
 * Whether an upload expiring at `expiresAt` will do for a photo needed until
 * `until`: it lasts long enough, or has long enough left to wait before being
 * uploaded again.
 */
export const sharedPhotoCovers = (
  expiresAt: number,
  until: number,
  now: number
) =>
  expiresAt >= sharedPhotoExpiry(until, now) ||
  expiresAt - now > SHARED_PHOTO_REFRESH_MS
/** A shared doc this big once inflated isn't one this app wrote. */
const MAX_DOC_BYTES = 256 * 1024

export function encodeSharedNoteDoc(doc: RichTextDoc): string {
  return toB64u(deflateSync(strToU8(JSON.stringify(doc)), { level: 9 }))
}

/** The shared doc, checked like any other; null when it doesn't read. */
export function decodeSharedNoteDoc(
  text: string | undefined
): RichTextDoc | null {
  if (!text) return null
  try {
    const out = inflateSync(fromB64u(text), {
      out: new Uint8Array(MAX_DOC_BYTES),
    })
    // fflate stops at the buffer's end without saying so.
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
  nonce: Uint8Array
): SealedPhoto {
  const sealed = sealBytes(key, bytes, SHARED_PHOTO_AAD, nonce)
  return { sealed, blobId: toB64u(sha256(sealed)) }
}

/**
 * The photo's JPEG bytes, or null when the blob isn't the one the event named
 * (its hash) or doesn't open with its key.
 */
export function openSharedPhoto(
  sealed: Uint8Array,
  photo: Pick<SharedPhoto, 'blob' | 'key'>
): Uint8Array | null {
  if (toB64u(sha256(sealed)) !== photo.blob) return null
  try {
    return openBytes(fromB64u(photo.key), sealed, SHARED_PHOTO_AAD)
  } catch {
    return null
  }
}

/**
 * Where a buddy's shared photo is kept on this device: an id from its blob, so
 * every share of the same photo reuses one file.
 */
export function localSharedPhotoId(blobId: string): string {
  return Array.from(fromB64u(blobId), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

/**
 * A share's note as note fields, with its photos pointing at their local files
 * (whether downloaded yet or not). Photos the share has no blob for are left
 * out.
 */
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
