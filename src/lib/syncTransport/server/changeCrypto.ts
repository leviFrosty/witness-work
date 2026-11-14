import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { gunzipSync, gzipSync } from 'fflate'
import { concatBytes, fromUtf8, toB64u, utf8 } from '@/lib/bytes'

const BLOB_VERSION = 1
const NONCE_LENGTH = 24
const TAG_LENGTH = 16
const LENGTH_PREFIX = 4

export const CHANGE_BLOCK_BYTES = 256

export const MAX_CHANGE_BYTES = 256 * 1024

const OVERHEAD = 1 + NONCE_LENGTH + TAG_LENGTH

export type ChangeAddress = {
  accountId: string
  slotId: string
  changeId: string
}

export type ChangeOpenProblem = 'format' | 'decrypt' | 'contents'

export class ChangeOpenError extends Error {
  constructor(readonly problem: ChangeOpenProblem) {
    super(`Could not open the change: ${problem}`)
    this.name = 'ChangeOpenError'
  }
}

export const newChangeId = (randomBytes: (length: number) => Uint8Array) =>
  toB64u(randomBytes(16))

export const changeAad = ({ accountId, slotId, changeId }: ChangeAddress) =>
  utf8(`ww-account/v1/sync-change\n${accountId}\n${slotId}\n${changeId}`)

export function sealChange(
  syncKey: Uint8Array,
  change: unknown,
  address: ChangeAddress,
  nonce: Uint8Array
): Uint8Array {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')
  const compressed = gzipSync(utf8(JSON.stringify(change)), { mtime: 0 })
  const sealedBytes =
    Math.ceil(
      (LENGTH_PREFIX + compressed.length + OVERHEAD) / CHANGE_BLOCK_BYTES
    ) * CHANGE_BLOCK_BYTES
  const padded = new Uint8Array(sealedBytes - OVERHEAD)
  new DataView(padded.buffer).setUint32(0, compressed.length)
  padded.set(compressed, LENGTH_PREFIX)
  const ciphertext = xchacha20poly1305(
    syncKey,
    nonce,
    changeAad(address)
  ).encrypt(padded)
  return concatBytes(new Uint8Array([BLOB_VERSION]), nonce, ciphertext)
}

function openWith(key: Uint8Array, blob: Uint8Array, aad: Uint8Array): unknown {
  let padded: Uint8Array
  try {
    padded = xchacha20poly1305(
      key,
      blob.subarray(1, 1 + NONCE_LENGTH),
      aad
    ).decrypt(blob.subarray(1 + NONCE_LENGTH))
  } catch {
    throw new ChangeOpenError('decrypt')
  }
  if (padded.length < LENGTH_PREFIX) throw new ChangeOpenError('contents')
  const length = new DataView(
    padded.buffer,
    padded.byteOffset,
    padded.byteLength
  ).getUint32(0)
  if (length > padded.length - LENGTH_PREFIX)
    throw new ChangeOpenError('contents')
  try {
    return JSON.parse(
      fromUtf8(
        gunzipSync(padded.subarray(LENGTH_PREFIX, LENGTH_PREFIX + length))
      )
    ) as unknown
  } catch {
    throw new ChangeOpenError('contents')
  }
}

export function openChange(
  syncKey: Uint8Array,
  blob: Uint8Array,
  address: ChangeAddress,
  olderKeys: readonly Uint8Array[] = []
): unknown {
  if (
    blob.length < OVERHEAD + LENGTH_PREFIX ||
    blob.length % CHANGE_BLOCK_BYTES !== 0 ||
    blob[0] !== BLOB_VERSION
  )
    throw new ChangeOpenError('format')
  const aad = changeAad(address)
  let key = syncKey
  for (const older of olderKeys) {
    try {
      return openWith(key, blob, aad)
    } catch (error) {
      if (!(error instanceof ChangeOpenError) || error.problem !== 'decrypt')
        throw error
      key = older
    }
  }
  return openWith(key, blob, aad)
}

export type ChangeReseal =
  | { outcome: 'resealed'; blob: Uint8Array }
  | { outcome: 'current' }
  | { outcome: 'unopened' }

export function resealChange(
  blob: Uint8Array,
  address: ChangeAddress,
  {
    from,
    to,
    nonce,
  }: { from: readonly Uint8Array[]; to: Uint8Array; nonce: Uint8Array }
): ChangeReseal {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')
  if (blob.length < OVERHEAD || blob[0] !== BLOB_VERSION)
    return { outcome: 'unopened' }
  const aad = changeAad(address)
  const decrypt = (key: Uint8Array) => {
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
  if (decrypt(to)) return { outcome: 'current' }
  for (const key of from) {
    const padded = decrypt(key)
    if (!padded) continue
    return {
      outcome: 'resealed',
      blob: concatBytes(
        new Uint8Array([BLOB_VERSION]),
        nonce,
        xchacha20poly1305(to, nonce, aad).encrypt(padded)
      ),
    }
  }
  return { outcome: 'unopened' }
}
