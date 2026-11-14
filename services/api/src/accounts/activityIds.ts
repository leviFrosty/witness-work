import { bytesToBase64Url } from '../crypto'
import { decodeB64u } from '../buddies/contracts'
import type { ActivityIdKeys } from './tokens'

/**
 * Activity entry ids and cursors (`GET /accounts/v1/activity`): the row id of
 * `account_activity`, sealed for the account it belongs to.
 *
 * The row id is a global autoincrement, so handing it out would let any User
 * measure everyone's activity (sign-ins, backups, suspensions) by diffing
 * their own ids over time. Instead each id is the row id (8 bytes, big
 * endian) under AES-256-GCM, with the account id as associated data and a
 * synthetic nonce, the HMAC-SHA256 of the account id and the row id
 * (truncated to 12 bytes): `b64u(nonce || ciphertext || tag)`, 48 characters.
 *
 * - **Opaque and unlinkable**: without the key, an id says nothing about its
 *   row id or about another account's ids.
 * - **Deterministic**: an entry keeps its id from one page to the next (the
 *   app keys its list on it). Equal nonces only ever seal equal messages, so
 *   reusing one reveals nothing.
 * - **Bound to the account**: another account's id, or a forged or altered
 *   one, fails the tag and is refused (400), never another account's rows.
 *
 * Keys come from `ACCOUNT_TOKEN_SECRET` (src/accounts/tokens.ts). Ids are
 * sealed under the current secret; cursors open under it or the previous
 * one, so a page fetched just before a rotation still pages on.
 *
 * Privacy: nothing here logs or reports ids or account ids.
 */

const NONCE_BYTES = 12
const ROW_ID_BYTES = 8
const TAG_BYTES = 16
const SEALED_BYTES = NONCE_BYTES + ROW_ID_BYTES + TAG_BYTES
/** 36 bytes in unpadded base64url. */
export const ACTIVITY_ID_CHARS = Math.ceil((SEALED_BYTES * 4) / 3)

const encoder = new TextEncoder()

const associatedData = (accountId: string): Uint8Array =>
  encoder.encode(`ww-account/v1/activity-id\n${accountId}`)

const rowIdBytes = (rowId: number): Uint8Array => {
  const bytes = new Uint8Array(ROW_ID_BYTES)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(rowId))
  return bytes
}

const syntheticNonce = async (
  keys: ActivityIdKeys,
  accountId: string,
  plaintext: Uint8Array
): Promise<Uint8Array> => {
  const message = new Uint8Array([...associatedData(accountId), 0x0a, ...plaintext])
  const mac = await crypto.subtle.sign('HMAC', keys.nonceKey, message)
  return new Uint8Array(mac, 0, NONCE_BYTES)
}

/** The id the account sees for row `rowId`, under the current secret's `keys`. */
export const sealActivityId = async (
  keys: ActivityIdKeys,
  accountId: string,
  rowId: number
): Promise<string> => {
  const plaintext = rowIdBytes(rowId)
  const nonce = await syntheticNonce(keys, accountId, plaintext)
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: associatedData(accountId) },
    keys.cipherKey,
    plaintext
  )
  return bytesToBase64Url(new Uint8Array([...nonce, ...new Uint8Array(sealed)]))
}

/**
 * The row id an id or cursor seals for this account, or null: malformed,
 * sealed for another account or under a secret that's gone, or altered.
 * `keys` are the current secret's first, then the previous one's if set.
 */
export const openActivityId = async (
  keys: readonly ActivityIdKeys[],
  accountId: string,
  value: string
): Promise<number | null> => {
  if (value.length !== ACTIVITY_ID_CHARS) return null
  const bytes = decodeB64u(value)
  if (!bytes || bytes.length !== SEALED_BYTES) return null
  const nonce = bytes.subarray(0, NONCE_BYTES)
  const sealed = bytes.subarray(NONCE_BYTES)
  for (const secretKeys of keys) {
    let plaintext: ArrayBuffer
    try {
      plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: associatedData(accountId) },
        secretKeys.cipherKey,
        sealed
      )
    } catch {
      continue
    }
    const rowId = new DataView(plaintext).getBigUint64(0)
    return rowId > 0n && rowId <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(rowId)
      : null
  }
  return null
}
