/**
 * Legacy KV adapter. SQLite identity objects are authoritative; these helpers are
 * used only for lazy import and the compatibility mirror needed by deployed v1
 * clients during rolling upgrades.
 */

export type AppAttestKv = Pick<
  KVNamespace,
  'get' | 'put' | 'delete' | 'list'
>

export interface DeviceKeyRecord {
  /** Base64url SPKI of the device's attested P-256 public key. */
  spki: string
  /** Highest assertion sign-count seen; each assertion must exceed it. */
  signCount: number
  /** The identity (Keychain UUID) this device key is pinned to (ADR 0007). */
  uuid: string
  environment: 'development' | 'production'
  attestedAt: number
  /**
   * Bundle id the key attested against. Absent on records written before
   * bundle binding; those are bound to the primary `IOS_BUNDLE_ID`.
   */
  bundleId?: string
}

const keyStoreKey = (keyId: string) => `key:${keyId}`

/** Legacy reverse index from install UUID to the deployed v1 key id. */
const uuidOwnerKey = (uuid: string) => `uuidOwner:${uuid}`

const parseKeyRecord = (raw: string): DeviceKeyRecord | null => {
  try {
    const value = JSON.parse(raw) as Partial<DeviceKeyRecord>
    if (
      typeof value.spki !== 'string' ||
      !Number.isSafeInteger(value.signCount) ||
      (value.signCount ?? -1) < 0 ||
      typeof value.uuid !== 'string' ||
      (value.environment !== 'development' &&
        value.environment !== 'production') ||
      !Number.isFinite(value.attestedAt) ||
      (value.bundleId !== undefined &&
        (typeof value.bundleId !== 'string' || value.bundleId === ''))
    ) {
      return null
    }
    return value as DeviceKeyRecord
  } catch {
    return null
  }
}

export const getKeyRecord = async (
  kv: AppAttestKv,
  keyId: string
): Promise<DeviceKeyRecord | null> => {
  const raw = await kv.get(keyStoreKey(keyId))
  return raw == null ? null : parseKeyRecord(raw)
}

export const putKeyRecord = (
  kv: AppAttestKv,
  keyId: string,
  record: DeviceKeyRecord
): Promise<void> => kv.put(keyStoreKey(keyId), JSON.stringify(record))

export const deleteKeyRecord = (
  kv: AppAttestKv,
  keyId: string
): Promise<void> => kv.delete(keyStoreKey(keyId))

/** The keyId that owns `uuid`, or null if the identity is still unclaimed. */
export const getUuidOwner = (
  kv: AppAttestKv,
  uuid: string
): Promise<string | null> => kv.get(uuidOwnerKey(uuid))

/** Update the deployed v1 UUID→key compatibility mirror. */
export const putUuidOwner = (
  kv: AppAttestKv,
  uuid: string,
  keyId: string
): Promise<void> => kv.put(uuidOwnerKey(uuid), keyId)
