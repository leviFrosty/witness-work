import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { DevicePlatform } from '@/lib/devicePlatform'
import { gunzipSync, gzipSync } from 'fflate'
import { concatBytes, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import { sha256Native } from '@/lib/sha256'

const BLOB_VERSION = 1
const NONCE_LENGTH = 24
const TAG_LENGTH = 16

export const BACKUP_PLAINTEXT_VERSION = 1

export type BackupPlatform = DevicePlatform

export type BackupPlaintext = {
  v: number

  deviceName: string
  platform: BackupPlatform

  createdAt: number
  payload: unknown
}

export type BackupAddress = { accountId: string; slotId: string }

export type BackupOpenProblem = 'format' | 'decrypt' | 'contents' | 'newer'

export class BackupOpenError extends Error {
  constructor(readonly problem: BackupOpenProblem) {
    super(`Backup blob unreadable: ${problem}`)
    this.name = 'BackupOpenError'
  }
}

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

export const newBackupSlotId = (randomBytes: (length: number) => Uint8Array) =>
  toB64u(randomBytes(16))

export const backupBlobDigest = async (blob: Uint8Array) =>
  toB64u(await sha256Native(blob))

export function sealBackup(
  backupKey: Uint8Array,
  plaintext: BackupPlaintext,
  address: BackupAddress,
  nonce: Uint8Array
): Uint8Array {
  return sealPlaintext(backupKey, plaintext, backupAad(address), nonce)
}

export function sealPlaintext(
  key: Uint8Array,
  plaintext: BackupPlaintext,
  aad: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')

  const compressed = gzipSync(utf8(JSON.stringify(plaintext)), { mtime: 0 })
  const ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(compressed)
  return concatBytes(new Uint8Array([BLOB_VERSION]), nonce, ciphertext)
}

export function openBackup(
  backupKey: Uint8Array,
  blob: Uint8Array,
  address: BackupAddress,
  olderKeys: readonly Uint8Array[] = []
): BackupPlaintext {
  return openPlaintext(backupKey, blob, backupAad(address), olderKeys)
}

export function openPlaintext(
  key: Uint8Array,
  blob: Uint8Array,
  aad: Uint8Array,
  olderKeys: readonly Uint8Array[] = []
): BackupPlaintext {
  for (const older of olderKeys) {
    try {
      return openPlaintextWith(key, blob, aad)
    } catch (error) {
      if (!(error instanceof BackupOpenError) || error.problem !== 'decrypt')
        throw error
      key = older
    }
  }
  return openPlaintextWith(key, blob, aad)
}

export type ResealResult =
  | { outcome: 'resealed'; blob: Uint8Array }
  | { outcome: 'current' }
  | { outcome: 'unopened' }

export function resealBlob(
  blob: Uint8Array,
  aad: Uint8Array,
  {
    from,
    to,
    nonce,
  }: { from: readonly Uint8Array[]; to: Uint8Array; nonce: Uint8Array }
): ResealResult {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')
  if (decryptWith(to, blob, aad)) return { outcome: 'current' }
  for (const key of from) {
    const compressed = decryptWith(key, blob, aad)
    if (!compressed) continue
    const ciphertext = xchacha20poly1305(to, nonce, aad).encrypt(compressed)
    return {
      outcome: 'resealed',
      blob: concatBytes(new Uint8Array([BLOB_VERSION]), nonce, ciphertext),
    }
  }
  return { outcome: 'unopened' }
}

function decryptWith(
  key: Uint8Array,
  blob: Uint8Array,
  aad: Uint8Array
): Uint8Array | null {
  if (blob.length < 1 + NONCE_LENGTH + TAG_LENGTH || blob[0] !== BLOB_VERSION)
    return null
  try {
    return xchacha20poly1305(
      key,
      blob.subarray(1, 1 + NONCE_LENGTH),
      aad
    ).decrypt(blob.subarray(1 + NONCE_LENGTH))
  } catch {
    return null
  }
}

function openPlaintextWith(
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
