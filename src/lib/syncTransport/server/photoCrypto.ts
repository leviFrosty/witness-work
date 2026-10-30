import { xchacha20, xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { poly1305 } from '@noble/ciphers/_poly1305.js'
import { equalBytes } from '@noble/ciphers/utils.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'

/**
 * Cloud Sync's photos (docs/cloud-sync-photos.md, "Photos"; ADR 0040 §6): each
 * photo file is one blob under the account, `0x01 ‖ nonce[24] ‖
 * XChaCha20-Poly1305(photoKey, nonce, bytes, aad)`, stored under a keyed name
 * (the HMAC of the engine's filename) so the server can't tell photos apart or
 * link a contact's revisions. A sealed meta carries the filename, so a device
 * can list the account's photos without downloading them. The AADs name the
 * account and the photo: a blob or meta moved to another doesn't open.
 *
 * The bytes are the photo file as saved, never gzipped (JPEG doesn't compress).
 * Sealing and opening run in chunks with a pause between them, so a 25 MiB
 * photo never holds the JS thread for long.
 */

const BLOB_VERSION = 1
const NONCE_LENGTH = 24
const TAG_LENGTH = 16
const META_VERSION = 1
/** Every meta's JSON is padded to this many bytes, so all are one length. */
const META_JSON_BYTES = 256

/** The size of a file's sealed blob: what it counts against storage. */
export const sealedPhotoBytes = (fileBytes: number) =>
  1 + NONCE_LENGTH + fileBytes + TAG_LENGTH

/** The server takes a blob of up to 25 MiB; this is the file inside one. */
export const MAX_PHOTO_FILE_BYTES = 25 * 1024 * 1024 - sealedPhotoBytes(0)

/** A photo's name (and its digest): 32 bytes, b64u. */
export const SYNC_PHOTO_NAME_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** Bytes between pauses: a multiple of ChaCha's 64-byte block. */
const CHUNK_BYTES = 128 * 1024

export type PhotoKeys = { photoKey: Uint8Array; nameKey: Uint8Array }

export type PhotoAddress = { accountId: string; name: string }

/** Why a photo blob didn't open. */
export type PhotoOpenProblem =
  /** Not a version-1 blob, or too short to be one. */
  | 'format'
  /** Wrong key, another photo's or account's blob, or tampered with. */
  | 'decrypt'

export class PhotoOpenError extends Error {
  constructor(readonly problem: PhotoOpenProblem) {
    super(`Photo blob unreadable: ${problem}`)
    this.name = 'PhotoOpenError'
  }
}

/** Lets the JS thread run between chunks; a no-op in tests. */
export type Pause = () => Promise<void>
const noPause: Pause = async () => {}

const derive = (accountKey: Uint8Array, info: string) =>
  hkdf(sha256, accountKey, new Uint8Array(0), utf8(info), 32)

/**
 * `HKDF-SHA256(accountKey, "", "ww-account/v1/sync-photo", 32)` and `…
 * "ww-account/v1/sync-photo-name"`.
 */
export function derivePhotoKeys(accountKey: Uint8Array): PhotoKeys {
  if (accountKey.length !== 32) throw new Error('Account key must be 32 bytes')
  return {
    photoKey: derive(accountKey, 'ww-account/v1/sync-photo'),
    nameKey: derive(accountKey, 'ww-account/v1/sync-photo-name'),
  }
}

/** `b64u(HMAC-SHA256(nameKey, UTF-8(filename)))`: what the server knows. */
export const photoName = (nameKey: Uint8Array, filename: string) =>
  toB64u(hmac(sha256, nameKey, utf8(filename)))

export const photoAad = ({ accountId, name }: PhotoAddress) =>
  utf8(`ww-account/v1/sync-photo\n${accountId}\n${name}`)

export const photoMetaAad = ({ accountId, name }: PhotoAddress) =>
  utf8(`ww-account/v1/sync-photo-meta\n${accountId}\n${name}`)

const le64 = (value: number) => {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setUint32(0, value >>> 0, true)
  new DataView(out.buffer).setUint32(4, Math.floor(value / 2 ** 32), true)
  return out
}

const padding = (length: number) => new Uint8Array((16 - (length % 16)) % 16)

/**
 * XChaCha20-Poly1305 (RFC 8439's construction over XChaCha20) in chunks: the
 * same bytes as noble's one-shot `xchacha20poly1305`, with `pause` between
 * chunks. Returns the ciphertext and its tag; opening checks the tag before it
 * returns anything.
 */
async function chunkedAead(
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  input: Uint8Array,
  direction: 'seal' | 'open',
  pause: Pause
): Promise<{ output: Uint8Array; tag: Uint8Array }> {
  const macKey = xchacha20(key, nonce, new Uint8Array(32), undefined, 0)
  const mac = poly1305.create(macKey)
  mac.update(aad).update(padding(aad.length))
  const output = new Uint8Array(input.length)
  for (let offset = 0; offset < input.length; offset += CHUNK_BYTES) {
    const chunk = input.subarray(offset, offset + CHUNK_BYTES)
    const out = output.subarray(offset, offset + chunk.length)
    if (direction === 'open') mac.update(chunk)
    xchacha20(key, nonce, chunk, out, 1 + offset / 64)
    if (direction === 'seal') mac.update(out)
    await pause()
  }
  mac
    .update(padding(input.length))
    .update(le64(aad.length))
    .update(le64(input.length))
  return { output, tag: mac.digest() }
}

/** Encrypts a photo file for its name. Callers supply the nonce. */
export async function sealPhoto(
  photoKey: Uint8Array,
  bytes: Uint8Array,
  address: PhotoAddress,
  nonce: Uint8Array,
  pause: Pause = noPause
): Promise<Uint8Array> {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')
  const { output, tag } = await chunkedAead(
    photoKey,
    nonce,
    photoAad(address),
    bytes,
    'seal',
    pause
  )
  return concatBytes(new Uint8Array([BLOB_VERSION]), nonce, output, tag)
}

/** Decrypts a photo blob. Throws `PhotoOpenError`. */
export async function openPhoto(
  photoKey: Uint8Array,
  blob: Uint8Array,
  address: PhotoAddress,
  pause: Pause = noPause
): Promise<Uint8Array> {
  if (blob.length < 1 + NONCE_LENGTH + TAG_LENGTH || blob[0] !== BLOB_VERSION)
    throw new PhotoOpenError('format')
  const nonce = blob.subarray(1, 1 + NONCE_LENGTH)
  const ciphertext = blob.subarray(1 + NONCE_LENGTH, blob.length - TAG_LENGTH)
  const { output, tag } = await chunkedAead(
    photoKey,
    nonce,
    photoAad(address),
    ciphertext,
    'open',
    pause
  )
  if (!equalBytes(tag, blob.subarray(blob.length - TAG_LENGTH)))
    throw new PhotoOpenError('decrypt')
  return output
}

/** The filename, sealed for the listing: `x-ww-photo-meta`. */
export function sealPhotoMeta(
  photoKey: Uint8Array,
  filename: string,
  address: PhotoAddress,
  nonce: Uint8Array
): string {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')
  const text = JSON.stringify({ v: META_VERSION, filename })
  const spaces = Math.max(0, META_JSON_BYTES - utf8(text).length)
  const json = utf8(text + ' '.repeat(spaces))
  const sealed = xchacha20poly1305(
    photoKey,
    nonce,
    photoMetaAad(address)
  ).encrypt(json)
  return toB64u(concatBytes(new Uint8Array([BLOB_VERSION]), nonce, sealed))
}

/**
 * The filename a listed photo's meta holds, or null when it doesn't open
 * (another key's, moved, damaged, or from a newer version). With `nameKey`,
 * also null when the filename doesn't hash to the name it's listed under, and
 * with `isValid`, when it isn't a photo filename.
 */
export function openPhotoMeta(
  photoKey: Uint8Array,
  meta: string,
  address: PhotoAddress,
  nameKey?: Uint8Array,
  isValid?: (filename: string) => boolean
): string | null {
  try {
    const sealed = fromB64u(meta)
    if (
      sealed.length < 1 + NONCE_LENGTH + TAG_LENGTH ||
      sealed[0] !== BLOB_VERSION
    )
      return null
    const json = xchacha20poly1305(
      photoKey,
      sealed.subarray(1, 1 + NONCE_LENGTH),
      photoMetaAad(address)
    ).decrypt(sealed.subarray(1 + NONCE_LENGTH))
    const parsed = JSON.parse(fromUtf8(json)) as {
      v?: unknown
      filename?: unknown
    } | null
    if (parsed?.v !== META_VERSION || typeof parsed.filename !== 'string')
      return null
    if (nameKey && photoName(nameKey, parsed.filename) !== address.name)
      return null
    if (isValid && !isValid(parsed.filename)) return null
    return parsed.filename
  } catch {
    return null
  }
}
