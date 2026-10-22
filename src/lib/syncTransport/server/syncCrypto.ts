import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { toB64u, utf8 } from '@/lib/bytes'
import { sha256Native } from '@/lib/sha256'
import {
  type BackupPlaintext,
  openPlaintext,
  sealPlaintext,
} from '@/lib/serverAccount/backupCrypto'

/**
 * Cloud Sync's slot blob (docs/accounts-protocol.md, "Sync"; ADR 0030): the
 * backup's format (`0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(…, gzip(plaintext),
 * aad)`) under the sync key, with an AAD naming the account and the slot, so a
 * blob moved to another slot or account doesn't open. The plaintext is the
 * backup's, holding the whole sync payload, `resetEpoch` included. The server
 * sees only the blob, its size, and when it was put.
 */

export type SyncAddress = { accountId: string; slotId: string }

/** A slot id is the device's sync id (`witness-work-<slotId>.json`). */
export const SYNC_SLOT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/** `HKDF-SHA256(accountKey, "", "ww-account/v1/sync", 32)`. */
export function deriveSyncKey(accountKey: Uint8Array): Uint8Array {
  if (accountKey.length !== 32) throw new Error('Account key must be 32 bytes')
  return hkdf(
    sha256,
    accountKey,
    new Uint8Array(0),
    utf8('ww-account/v1/sync'),
    32
  )
}

export const syncAad = ({ accountId, slotId }: SyncAddress) =>
  utf8(`ww-account/v1/sync\n${accountId}\n${slotId}`)

/** B64u SHA-256 of the blob: `sync/put`'s `x-ww-sha256` and the slot's ETag. */
export const syncBlobDigest = async (blob: Uint8Array) =>
  toB64u(await sha256Native(blob))

export const sealSyncBlob = (
  syncKey: Uint8Array,
  plaintext: BackupPlaintext,
  address: SyncAddress,
  nonce: Uint8Array
) => sealPlaintext(syncKey, plaintext, syncAad(address), nonce)

/** Throws `BackupOpenError`; the payload inside is still unvalidated. */
export const openSyncBlob = (
  syncKey: Uint8Array,
  blob: Uint8Array,
  address: SyncAddress
) => openPlaintext(syncKey, blob, syncAad(address))
