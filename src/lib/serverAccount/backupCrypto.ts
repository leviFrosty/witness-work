import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { DevicePlatform } from '@/lib/devicePlatform'
import { gunzipSync, gzipSync } from 'fflate'
import { concatBytes, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import { sha256Native } from '@/lib/sha256'

/**
 * The end-to-end encrypted backup's blob (docs/accounts-protocol.md, "Backup";
 * ADR 0026 §4): `0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(backupKey, nonce,
 * gzip(plaintext), aad)`. The AAD names the account and the slot, so a blob
 * moved to another slot or account doesn't open. The server only ever sees the
 * blob, its size, and when it was uploaded.
 */

const BLOB_VERSION = 1
const NONCE_LENGTH = 24
const TAG_LENGTH = 16

/** The plaintext's own version; a newer one is from a newer app. */
export const BACKUP_PLAINTEXT_VERSION = 1

export type BackupPlatform = DevicePlatform

/** What a slot holds, once opened. `payload` is a `SyncPayload` to validate. */
export type BackupPlaintext = {
  v: number
  /** The writing device's name, shown on restore. Only inside the ciphertext. */
  deviceName: string
  platform: BackupPlatform
  /** Epoch ms, on the writing device's clock. */
  createdAt: number
  payload: unknown
}

export type BackupAddress = { accountId: string; slotId: string }

/** Why a blob didn't open. */
export type BackupOpenProblem =
  /** Not a version-1 blob, or too short to be one. */
  | 'format'
  /** Wrong key, another slot's or account's blob, or tampered with. */
  | 'decrypt'
  /** Opened, but isn't gzip of a JSON backup plaintext. */
  | 'contents'
  /** A plaintext from a newer app version. */
  | 'newer'

export class BackupOpenError extends Error {
  constructor(readonly problem: BackupOpenProblem) {
    super(`Backup blob unreadable: ${problem}`)
    this.name = 'BackupOpenError'
  }
}

/** `HKDF-SHA256(accountKey, "", "ww-account/v1/backup", 32)`. */
export function deriveBackupKey(accountKey: Uint8Array): Uint8Array {
  if (accountKey.length !== 32) throw new Error('Account key must be 32 bytes')
  return hkdf(
    sha256,
    accountKey,
    new Uint8Array(0),
    utf8('ww-account/v1/backup'),
    32
  )
}

export const backupAad = ({ accountId, slotId }: BackupAddress) =>
  utf8(`ww-account/v1/backup\n${accountId}\n${slotId}`)

/** A new slot id: 16 random bytes, b64u. */
export const newBackupSlotId = (randomBytes: (length: number) => Uint8Array) =>
  toB64u(randomBytes(16))

/** B64u SHA-256 of the blob, as `backup/put` signs it. */
export const backupBlobDigest = async (blob: Uint8Array) =>
  toB64u(await sha256Native(blob))

/** Encrypts `plaintext` for `address`. Callers supply the nonce. */
export function sealBackup(
  backupKey: Uint8Array,
  plaintext: BackupPlaintext,
  address: BackupAddress,
  nonce: Uint8Array
): Uint8Array {
  return sealPlaintext(backupKey, plaintext, backupAad(address), nonce)
}

/**
 * The blob format itself, under any key and AAD: Cloud Sync's slots use it with
 * their own (`syncCrypto.ts`).
 */
export function sealPlaintext(
  key: Uint8Array,
  plaintext: BackupPlaintext,
  aad: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')
  // mtime 0 keeps the gzip header free of when it was written.
  const compressed = gzipSync(utf8(JSON.stringify(plaintext)), { mtime: 0 })
  const ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(compressed)
  return concatBytes(new Uint8Array([BLOB_VERSION]), nonce, ciphertext)
}

/**
 * Decrypts and reads a slot's blob. Throws `BackupOpenError`; the payload
 * inside is still unvalidated.
 */
export function openBackup(
  backupKey: Uint8Array,
  blob: Uint8Array,
  address: BackupAddress
): BackupPlaintext {
  return openPlaintext(backupKey, blob, backupAad(address))
}

/** `openBackup` under any key and AAD (see `sealPlaintext`). */
export function openPlaintext(
  key: Uint8Array,
  blob: Uint8Array,
  aad: Uint8Array
): BackupPlaintext {
  if (blob.length < 1 + NONCE_LENGTH + TAG_LENGTH || blob[0] !== BLOB_VERSION)
    throw new BackupOpenError('format')
  let compressed: Uint8Array
  try {
    compressed = xchacha20poly1305(
      key,
      blob.subarray(1, 1 + NONCE_LENGTH),
      aad
    ).decrypt(blob.subarray(1 + NONCE_LENGTH))
  } catch {
    throw new BackupOpenError('decrypt')
  }
  let data: unknown
  try {
    data = JSON.parse(fromUtf8(gunzipSync(compressed)))
  } catch {
    throw new BackupOpenError('contents')
  }
  const plaintext = data as Partial<BackupPlaintext> | null
  if (typeof plaintext !== 'object' || plaintext === null)
    throw new BackupOpenError('contents')
  if (typeof plaintext.v === 'number' && plaintext.v > BACKUP_PLAINTEXT_VERSION)
    throw new BackupOpenError('newer')
  if (
    plaintext.v !== BACKUP_PLAINTEXT_VERSION ||
    typeof plaintext.payload !== 'object' ||
    plaintext.payload === null ||
    typeof plaintext.createdAt !== 'number'
  )
    throw new BackupOpenError('contents')
  return {
    v: plaintext.v,
    deviceName:
      typeof plaintext.deviceName === 'string'
        ? plaintext.deviceName.slice(0, 64)
        : '',
    platform:
      plaintext.platform === 'android' || plaintext.platform === 'web'
        ? plaintext.platform
        : 'ios',
    createdAt: plaintext.createdAt,
    payload: plaintext.payload,
  }
}
