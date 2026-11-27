import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import {
  BACKUP_PLAINTEXT_VERSION,
  type BackupPlaintext,
  type BackupPlatform,
  openPlaintext,
  sealPlaintext,
} from '@/lib/serverAccount/backupCrypto'
import {
  openBytes,
  type Pause,
  type PhotoKeys,
  sealBytes,
} from '@/lib/syncTransport/server/photoCrypto'

const SNAPSHOT_CONTEXT = 'ww-account/v1/platform-sync'
const PHOTO_CONTEXT = 'ww-account/v1/platform-sync-photo'
const PHOTO_NAME_CONTEXT = 'ww-account/v1/platform-sync-photo-name'
const KEY_ID_CONTEXT = 'ww-account/v1/platform-sync-key-id'

const BLOB_VERSION = 1
const NONCE_LENGTH = 24
const TAG_LENGTH = 16

const NAME_BUCKETS = [64, 128]

export type SealKeys = {
  syncKey: Uint8Array
  photoKeys: PhotoKeys
}

export type SealKeyring = {
  current: SealKeys
  older: SealKeys[]
}

export const sealKeyId = (syncKey: Uint8Array): string =>
  toB64u(hmac(sha256, syncKey, utf8(KEY_ID_CONTEXT)).subarray(0, 16))

const snapshotAad = (filename: string) =>
  utf8(`${SNAPSHOT_CONTEXT}\n${filename}`)

export function sealSnapshot(
  syncKey: Uint8Array,
  filename: string,
  payload: unknown,
  meta: { deviceName: string; platform: BackupPlatform; createdAt: number },
  nonce: Uint8Array
): Uint8Array {
  const plaintext: BackupPlaintext = {
    v: BACKUP_PLAINTEXT_VERSION,
    ...meta,
    payload,
  }
  return sealPlaintext(syncKey, plaintext, snapshotAad(filename), nonce)
}

export const openSnapshot = (
  keyring: SealKeyring,
  filename: string,
  blob: Uint8Array
): BackupPlaintext =>
  openPlaintext(
    keyring.current.syncKey,
    blob,
    snapshotAad(filename),
    keyring.older.map((keys) => keys.syncKey)
  )

const photoAad = (filename: string) => utf8(`${PHOTO_CONTEXT}\n${filename}`)

export const sealPhotoBytes = (
  keys: PhotoKeys,
  filename: string,
  bytes: Uint8Array,
  nonce: Uint8Array,
  pause?: Pause
) => sealBytes(keys.photoKey, bytes, photoAad(filename), nonce, pause)

export const openPhotoBytes = (
  keys: PhotoKeys,
  filename: string,
  blob: Uint8Array,
  pause?: Pause
) => openBytes(keys.photoKey, blob, photoAad(filename), pause)

const nameAad = utf8(PHOTO_NAME_CONTEXT)

export function sealPhotoName(keys: PhotoKeys, middle: string): string | null {
  const text = utf8(middle)
  const bucket = NAME_BUCKETS.find((size) => text.length + 1 <= size)
  if (bucket === undefined || text.length > 255) return null
  const padded = new Uint8Array(bucket)
  padded[0] = text.length
  padded.set(text, 1)
  const nonce = hmac(
    sha256,
    keys.nameKey,
    utf8(`${PHOTO_NAME_CONTEXT}\n${middle}`)
  ).subarray(0, NONCE_LENGTH)
  const sealed = xchacha20poly1305(keys.photoKey, nonce, nameAad).encrypt(
    padded
  )
  return toB64u(concatBytes(new Uint8Array([BLOB_VERSION]), nonce, sealed))
}

export function openPhotoName(keys: PhotoKeys, sealed: string): string | null {
  try {
    const bytes = fromB64u(sealed)
    if (
      bytes.length < 1 + NONCE_LENGTH + TAG_LENGTH + 1 ||
      bytes[0] !== BLOB_VERSION
    )
      return null
    const padded = xchacha20poly1305(
      keys.photoKey,
      bytes.subarray(1, 1 + NONCE_LENGTH),
      nameAad
    ).decrypt(bytes.subarray(1 + NONCE_LENGTH))
    const length = padded[0]
    if (length + 1 > padded.length) return null
    const middle = fromUtf8(padded.subarray(1, 1 + length))
    return sealPhotoName(keys, middle) === sealed ? middle : null
  } catch {
    return null
  }
}
