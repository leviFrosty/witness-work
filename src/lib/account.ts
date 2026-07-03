import { Platform } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import * as Device from 'expo-device'
import * as ICloudBridge from '../../modules/icloud-bridge'
import { getOrCreateInstallId } from '@/lib/installId'
import {
  ACCOUNT_FILENAME,
  AccountFile,
  isAccountFilename,
  parseAccountFile,
} from '@/lib/accountFile'
import { logger } from '@/lib/logger'

/**
 * Effectful half of the account model (ADR 0011) — id persistence and the
 * account file's iCloud IO. The pure payload/decision layer lives in
 * `@/lib/accountFile`; the reconcile loop that drives both lives in
 * `AccountProvider`.
 *
 * The account id defaults to this device's install id (ADR 0007) and is
 * replaced only when the device adopts another device's claim from iCloud. The
 * adopted id is persisted device-locally (MMKV, not preferences — it must never
 * round-trip through the supporter-gated data sync it unlocks).
 */

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'account' }))
const ADOPTED_KEY = 'adoptedAccountId'

let _cached: string | null = null

/**
 * The identity this app presents everywhere: RevenueCat app user id and the
 * ww-proxy (Notes-Import) uuid. Resolves to the adopted shared account id when
 * this device has joined another device's claim, else the install id.
 */
export const getOrCreateAccountId = (): string => {
  if (_cached) return _cached
  const adopted = store().getString(ADOPTED_KEY)
  if (adopted) {
    _cached = adopted
    return adopted
  }
  const installId = getOrCreateInstallId()
  _cached = installId
  return installId
}

/** Persist a foreign claim as this device's account id. */
export const adoptAccountId = (accountId: string): void => {
  store().set(ADOPTED_KEY, accountId)
  _cached = accountId
}

/**
 * Dev-tools only (paywall "Reset purchases"): drop the adopted id so the device
 * falls back to its install id on next resolution.
 */
export const clearAdoptedAccountId = (): void => {
  store().delete(ADOPTED_KEY)
  _cached = null
}

/**
 * Reads the account file from the ubiquity container. Also absorbs iCloud
 * conflict duplicates (`witness-work-account 2.json`): the newest payload wins,
 * losers are deleted, and a winner that lived under a duplicate name is
 * rewritten to the canonical filename — all best-effort.
 *
 * Rejects when iCloud is unavailable (signed out, or iCloud Drive disabled for
 * the app) — callers treat that as "sharing unavailable", not an error.
 */
export const readAccountFile = async (): Promise<AccountFile | null> => {
  const files = await ICloudBridge.readAll()
  const candidates = files
    .filter((f) => isAccountFilename(f.filename))
    .map((f) => ({ filename: f.filename, payload: parseAccountFile(f.json) }))
    .filter(
      (c): c is { filename: string; payload: AccountFile } => c.payload !== null
    )
  if (candidates.length === 0) return null

  let best = candidates[0]
  for (const c of candidates) {
    if (c.payload.updatedAt > best.payload.updatedAt) best = c
  }

  for (const c of candidates) {
    if (c.filename === best.filename || c.filename === ACCOUNT_FILENAME) {
      continue
    }
    void ICloudBridge.deleteFile(c.filename).catch(() => {})
  }
  if (best.filename !== ACCOUNT_FILENAME) {
    try {
      await ICloudBridge.write(ACCOUNT_FILENAME, JSON.stringify(best.payload))
      await ICloudBridge.deleteFile(best.filename)
    } catch (e) {
      logger.warn('[Account] failed to canonicalize account file', e)
    }
  }
  return best.payload
}

/** Claims (or re-claims) the account file for `accountId`. */
export const writeAccountFile = async (
  accountId: string,
  entitled: boolean
): Promise<void> => {
  const payload: AccountFile = {
    v: 1,
    accountId,
    entitled,
    updatedAt: Date.now(),
    deviceName: Device.modelName ?? undefined,
  }
  await ICloudBridge.write(ACCOUNT_FILENAME, JSON.stringify(payload))
}

/**
 * Best-effort re-claim after a flow that wipes the whole sync namespace
 * (`overwriteRemoteWithLocal`). Not load-bearing — every device keeps its
 * adopted id locally, so the next reconcile pass re-claims the same id even
 * without this — but re-writing immediately closes the window where a fresh
 * device could claim first.
 */
export const reclaimAccountFile = async (entitled: boolean): Promise<void> => {
  if (Platform.OS !== 'ios') return
  if (!ICloudBridge.isAvailable()) return
  try {
    await writeAccountFile(getOrCreateAccountId(), entitled)
  } catch (e) {
    logger.warn('[Account] reclaim after remote wipe failed', e)
  }
}
