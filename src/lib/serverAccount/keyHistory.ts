import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

/**
 * The account's key history (docs/account-key-change.md, "Key history"; ADR
 * 0039 §6): the keys derived from each account key the account had before, so a
 * device holding the current key still opens what an older one sealed (old "My
 * Account" backup files, and any slot, photo or label a key change didn't
 * reach). Derived keys only, never an older account key. The devices seal it
 * under the current key's history key, and the server stores it unread.
 */

/** The history's derived keys, each an HKDF label of the old account key. */
export type KeyHistoryKind =
  | 'backup'
  | 'backupFile'
  | 'sync'
  | 'syncPhoto'
  | 'syncPhotoName'
  | 'device'

const LABELS: Record<KeyHistoryKind, string> = {
  backup: 'ww-account/v1/backup',
  backupFile: 'ww-account/v1/backup-file',
  sync: 'ww-account/v1/sync',
  syncPhoto: 'ww-account/v1/sync-photo',
  syncPhotoName: 'ww-account/v1/sync-photo-name',
  device: 'ww-account/v1/device',
}

const KINDS = Object.keys(LABELS) as KeyHistoryKind[]

/** One retired account key: its epoch, public key, and derived keys (b64u). */
export type FullKeyHistoryEntry = {
  keyEpoch: number
  /** Epoch ms. */
  retiredAt: number
  accountPub: string
} & Record<KeyHistoryKind, string>

/**
 * An old entry trimmed to fit the size limit: only its backup file key, so old
 * "My Account" files always open.
 */
export type TrimmedKeyHistoryEntry = Pick<
  FullKeyHistoryEntry,
  'keyEpoch' | 'retiredAt' | 'backupFile'
>

export type KeyHistoryEntry = FullKeyHistoryEntry | TrimmedKeyHistoryEntry

export type KeyHistory = { v: 1; entries: KeyHistoryEntry[] }

/**
 * The longest sealed history the server stores, in characters. Past it the
 * oldest entries are trimmed (`TrimmedKeyHistoryEntry`); none is dropped.
 */
export const KEY_HISTORY_SEALED_MAX = 65_536

const HISTORY_LABEL = 'ww-account/v1/key-history'
const BLOB_VERSION = 1
const NONCE_LENGTH = 24
const TAG_LENGTH = 16

export class KeyHistoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyHistoryError'
  }
}

const derive = (accountKey: Uint8Array, label: string) => {
  if (accountKey.length !== 32) throw new Error('Account key must be 32 bytes')
  return hkdf(sha256, accountKey, new Uint8Array(0), utf8(label), 32)
}

/** `HKDF-SHA256(accountKey, "", "ww-account/v1/key-history", 32)`. */
export const deriveKeyHistoryKey = (accountKey: Uint8Array) =>
  derive(accountKey, HISTORY_LABEL)

/** The entry for `oldKey`, retired at `retiredAt` after epoch `keyEpoch`. */
export function keyHistoryEntry(
  oldKey: Uint8Array,
  keyEpoch: number,
  retiredAt: number
): FullKeyHistoryEntry {
  const keys = Object.fromEntries(
    KINDS.map((kind) => [kind, toB64u(derive(oldKey, LABELS[kind]))])
  ) as Record<KeyHistoryKind, string>
  return {
    keyEpoch,
    retiredAt,
    accountPub: deriveAccountSigningKey(oldKey).publicKey,
    ...keys,
  }
}

/** `history` with `entry` last. */
export function appendKeyHistory(
  history: KeyHistory | null,
  entry: KeyHistoryEntry
): KeyHistory {
  return { v: 1, entries: [...(history?.entries ?? []), entry] }
}

const isFull = (entry: KeyHistoryEntry): entry is FullKeyHistoryEntry =>
  'accountPub' in entry

const trimmed = ({
  keyEpoch,
  retiredAt,
  backupFile,
}: KeyHistoryEntry): TrimmedKeyHistoryEntry => ({
  keyEpoch,
  retiredAt,
  backupFile,
})

const aad = (accountId: string, keyEpoch: number) =>
  utf8(`${HISTORY_LABEL}\n${accountId}\n${keyEpoch}`)

/** The sealed length, in characters, of `plaintextBytes` of JSON. */
const sealedLength = (plaintextBytes: number) =>
  Math.ceil(((1 + NONCE_LENGTH + plaintextBytes + TAG_LENGTH) * 4) / 3)

/**
 * `history` as it's sealed: past `KEY_HISTORY_SEALED_MAX`, the oldest whole
 * entries trimmed first. Throws `KeyHistoryError` when even every entry trimmed
 * is too large.
 */
export function fitKeyHistory(history: KeyHistory): KeyHistory {
  const entries = [...history.entries]
  const size = () => utf8(JSON.stringify({ ...history, entries })).length
  for (let oldest = 0; sealedLength(size()) > KEY_HISTORY_SEALED_MAX; ) {
    while (oldest < entries.length && !isFull(entries[oldest])) oldest++
    if (oldest >= entries.length)
      throw new KeyHistoryError('Key history too large')
    entries[oldest] = trimmed(entries[oldest])
  }
  return { ...history, entries }
}

/**
 * `b64u(0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(historyKey(accountKey), nonce,
 * UTF-8(JSON), aad))`, for the account's epoch `keyEpoch` under `accountKey`,
 * as `fitKeyHistory` fits it.
 */
export function sealKeyHistory(
  accountKey: Uint8Array,
  accountId: string,
  keyEpoch: number,
  history: KeyHistory,
  nonce: Uint8Array
): string {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 24 bytes')
  const ciphertext = xchacha20poly1305(
    deriveKeyHistoryKey(accountKey),
    nonce,
    aad(accountId, keyEpoch)
  ).encrypt(utf8(JSON.stringify(fitKeyHistory(history))))
  return toB64u(concatBytes(new Uint8Array([BLOB_VERSION]), nonce, ciphertext))
}

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 43

const isEntry = (value: unknown): value is KeyHistoryEntry => {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  if (
    typeof entry.keyEpoch !== 'number' ||
    !Number.isSafeInteger(entry.keyEpoch) ||
    entry.keyEpoch < 0 ||
    typeof entry.retiredAt !== 'number' ||
    !isKey(entry.backupFile)
  )
    return false
  return entry.accountPub === undefined
    ? KINDS.every((kind) => kind === 'backupFile' || entry[kind] === undefined)
    : typeof entry.accountPub === 'string' &&
        KINDS.every((kind) => isKey(entry[kind]))
}

/** Throws `KeyHistoryError` when it doesn't open or isn't a history. */
export function openKeyHistory(
  accountKey: Uint8Array,
  accountId: string,
  keyEpoch: number,
  sealed: string
): KeyHistory {
  let plaintext: Uint8Array
  try {
    const bytes = fromB64u(sealed)
    if (
      bytes.length < 1 + NONCE_LENGTH + TAG_LENGTH ||
      bytes[0] !== BLOB_VERSION
    )
      throw new Error('format')
    plaintext = xchacha20poly1305(
      deriveKeyHistoryKey(accountKey),
      bytes.subarray(1, 1 + NONCE_LENGTH),
      aad(accountId, keyEpoch)
    ).decrypt(bytes.subarray(1 + NONCE_LENGTH))
  } catch {
    throw new KeyHistoryError('Key history doesn’t open')
  }
  return parseKeyHistory(fromUtf8(plaintext))
}

/** A history from its JSON (sealed, or this device's cache). */
export function parseKeyHistory(json: string): KeyHistory {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new KeyHistoryError('Not a key history')
  }
  const history = value as Partial<KeyHistory> | null
  if (
    history?.v !== 1 ||
    !Array.isArray(history.entries) ||
    !history.entries.every(isEntry)
  )
    throw new KeyHistoryError('Not a key history')
  return {
    v: 1,
    entries: history.entries.map((entry) =>
      isFull(entry)
        ? {
            keyEpoch: entry.keyEpoch,
            retiredAt: entry.retiredAt,
            accountPub: entry.accountPub,
            ...(Object.fromEntries(
              KINDS.map((kind) => [kind, entry[kind]])
            ) as Record<KeyHistoryKind, string>),
          }
        : trimmed(entry)
    ),
  }
}

/**
 * One kind's keys from the older account keys, newest first: every one for
 * `backupFile`, the entries kept whole for the rest.
 */
export function historyKeys(
  history: KeyHistory | null,
  kind: KeyHistoryKind
): Uint8Array[] {
  return (history?.entries ?? [])
    .toReversed()
    .flatMap((entry) =>
      kind === 'backupFile'
        ? [fromB64u(entry.backupFile)]
        : isFull(entry)
          ? [fromB64u(entry[kind])]
          : []
    )
}

/**
 * Cloud Sync photo keys from the older account keys, newest first: a photo
 * whose name under the current name key isn't on the server is looked up under
 * each `name` key, and opened with that entry's `photo` key.
 */
export function historyPhotoKeys(
  history: KeyHistory | null
): { name: Uint8Array; photo: Uint8Array }[] {
  return (history?.entries ?? [])
    .toReversed()
    .filter(isFull)
    .map((entry) => ({
      name: fromB64u(entry.syncPhotoName),
      photo: fromB64u(entry.syncPhoto),
    }))
}

/**
 * The device label keys, newest first, with the public key each label's AAD
 * names.
 */
export function historyLabelKeys(
  history: KeyHistory | null
): { accountPub: string; key: Uint8Array }[] {
  return (history?.entries ?? [])
    .toReversed()
    .filter(isFull)
    .map((entry) => ({
      accountPub: entry.accountPub,
      key: fromB64u(entry.device),
    }))
}
