import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { toB64u, utf8 } from '@/lib/bytes'
import { sha256Native } from '@/lib/sha256'
import {
  type BackupPlaintext,
  openPlaintext,
  sealPlaintext,
} from '@/lib/serverAccount/backupCrypto'

export type SyncAddress = { accountId: string; slotId: string }

export const SYNC_SLOT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

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

export const syncBlobDigest = async (blob: Uint8Array) =>
  toB64u(await sha256Native(blob))

export const sealSyncBlob = (
  syncKey: Uint8Array,
  plaintext: BackupPlaintext,
  address: SyncAddress,
  nonce: Uint8Array
) => sealPlaintext(syncKey, plaintext, syncAad(address), nonce)

export const openSyncBlob = (
  syncKey: Uint8Array,
  blob: Uint8Array,
  address: SyncAddress
) => openPlaintext(syncKey, blob, syncAad(address))
