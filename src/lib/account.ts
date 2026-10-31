import { MMKV } from 'react-native-mmkv'
import * as Device from 'expo-device'
import { hasSyncTransport, syncTransport } from '@/lib/syncTransport'
import { getOrCreateInstallId } from '@/lib/installId'
import {
  ACCOUNT_FILENAME,
  AccountFile,
  isAccountFilename,
  parseAccountFile,
} from '@/lib/accountFile'
import { logger } from '@/lib/logger'
import type { AccountClaim } from '@/lib/accountClaim'

/**
 * Effectful half of the account model (ADR 0011) — id persistence and the
 * account file's IO through the sync transport: the iCloud container on iOS,
 * the Google Drive app data folder on Android (ADR 0019). The pure
 * payload/decision layer lives in `@/lib/accountFile`; the reconcile loop that
 * drives both lives in `AccountProvider`.
 *
 * The account id defaults to this device's install id (ADR 0007) and is
 * replaced only when the device adopts another device's claim, from the account
 * file or the sync data (`@/lib/accountClaim`). The adopted id is persisted
 * device-locally (MMKV, not preferences, which merge as data); the sync payload
 * carries it only as this device's claim.
 */

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'account' }))
const ADOPTED_KEY = 'adoptedAccountId'
/** The server account (`accountFingerprint`) the adopted id belongs to. */
const ADOPTED_ACCOUNT_KEY = 'adoptedFor'
/** When this device's account id was first claimed (`@/lib/accountClaim`). */
const CLAIMED_AT_KEY = 'claimedAt'
/** The server account this device's Supporter state belongs to. */
const BOUND_KEY = 'supporterAccount'

/** The last answer, and the server account it was for. */
let _cached: { id: string; bound: string | null } | null = null

const idListeners = new Set<() => void>()
const notifyIdChange = () => {
  for (const listener of idListeners) listener()
}

/**
 * Calls `listener` when the id `getOrCreateAccountId` answers may have changed:
 * an id adopted or dropped, or another server account bound. Returns the
 * unsubscribe.
 */
export const onAccountIdChange = (listener: () => void): (() => void) => {
  idListeners.add(listener)
  return () => {
    idListeners.delete(listener)
  }
}

/**
 * The server account (`accountFingerprint`) this device's Supporter state
 * belongs to: the last one a session confirmed (`confirmSupporterAccount`).
 * Kept through sign-outs; null until one is confirmed.
 */
export const boundSupporterAccount = (): string | null => {
  try {
    return store().getString(BOUND_KEY) ?? null
  } catch {
    return null
  }
}

export const bindSupporterAccount = (account: string): void => {
  try {
    store().set(BOUND_KEY, account)
  } catch {
    // Unbound until the next confirmation writes it again.
  }
  notifyIdChange()
}

const forgetAdopted = () => {
  store().delete(ADOPTED_KEY)
  store().delete(ADOPTED_ACCOUNT_KEY)
  store().delete(CLAIMED_AT_KEY)
  _cached = null
}

/**
 * The identity this app presents everywhere: RevenueCat app user id and the
 * ww-proxy (Notes-Import) uuid. Resolves to the adopted shared account id when
 * this device has joined another device's claim, else the install id. An id
 * adopted for another server account than the bound one is dropped: it's that
 * account's customer (a reconcile that finished after the switch, or a claim
 * adopted before this device had an account).
 */
export const getOrCreateAccountId = (): string => {
  const bound = boundSupporterAccount()
  if (_cached && _cached.bound === bound) return _cached.id
  const adopted = store().getString(ADOPTED_KEY)
  const adoptedFor = store().getString(ADOPTED_ACCOUNT_KEY) ?? null
  if (
    adopted &&
    (adoptedFor === null || bound === null || adoptedFor === bound)
  ) {
    _cached = { id: adopted, bound }
    return adopted
  }
  if (adopted) forgetAdopted()
  const installId = getOrCreateInstallId()
  _cached = { id: installId, bound }
  return installId
}

/**
 * Persist a foreign claim as this device's account id, keeping the time of the
 * claim it adopted and the server account it belongs to (null when neither this
 * device nor the claim says).
 */
export const adoptAccountId = (
  accountId: string,
  claimedAt: number,
  account: string | null
): void => {
  store().set(ADOPTED_KEY, accountId)
  if (account) store().set(ADOPTED_ACCOUNT_KEY, account)
  else store().delete(ADOPTED_ACCOUNT_KEY)
  store().set(CLAIMED_AT_KEY, claimedAt)
  _cached = null
  notifyIdChange()
}

/**
 * Drop the adopted id so the device falls back to its install id on next
 * resolution, as a new claim: the paywall's dev "Reset purchases", a different
 * Apple Account, and another server account.
 */
export const clearAdoptedAccountId = (): void => {
  forgetAdopted()
  notifyIdChange()
}

/**
 * This device's RevenueCat claim (ADR 0040 §7): its account id, whether it's
 * entitled under it, when the id was first claimed, and the server account it's
 * made under: `account`, or while this device has none, the account its adopted
 * id belongs to, so rewriting the account file keeps that account's claim its
 * own. A device that never recorded a claim time (a first launch, or one from
 * before claims) claims now. Throws when the account id can't be read.
 */
export const getOwnAccountClaim = (
  entitled: boolean,
  account: string | null = null
): AccountClaim => {
  const appUserId = getOrCreateAccountId()
  let claimedAt = store().getNumber(CLAIMED_AT_KEY)
  if (claimedAt === undefined) {
    claimedAt = Date.now()
    store().set(CLAIMED_AT_KEY, claimedAt)
  }
  const tag =
    account ??
    (store().getString(ADOPTED_KEY) === appUserId
      ? (store().getString(ADOPTED_ACCOUNT_KEY) ?? null)
      : null)
  return tag
    ? { appUserId, entitled, claimedAt, account: tag }
    : { appUserId, entitled, claimedAt }
}

/**
 * Dev harness only: an account file in place of the transport's, since
 * simulators have no iCloud or Drive. Undefined reads the transport.
 */
let devAccountFile: AccountFile | null | undefined
const devAccountFileListeners = new Set<() => void>()

/** Dev harness only: stages the account file (`undefined` unstages it). */
export const stageDevAccountFile = (file: AccountFile | null | undefined) => {
  if (!__DEV__) return
  devAccountFile = file
  for (const listener of devAccountFileListeners) listener()
}

/** Whether the dev harness staged the account file. */
export const devAccountFileStaged = (): boolean =>
  __DEV__ && devAccountFile !== undefined

/** The staged account file as written so far, for the harness. */
export const devStagedAccountFile = (): AccountFile | null | undefined =>
  __DEV__ ? devAccountFile : undefined

/** Calls `listener` when the harness stages the account file. */
export const onDevAccountFileChange = (listener: () => void): (() => void) => {
  devAccountFileListeners.add(listener)
  return () => {
    devAccountFileListeners.delete(listener)
  }
}

export type AccountRead = {
  file: AccountFile | null
  /**
   * An account file is still downloading, so `file` may be stale — or null
   * while another device's claim is on its way in. Claiming or rewriting on
   * this read could overwrite that claim.
   */
  pending: boolean
}

/**
 * Reads the account file from the sync transport. Also absorbs iCloud conflict
 * duplicates (`witness-work-account 2.json`): the newest payload wins, losers
 * are deleted, and a winner that lived under a duplicate name is rewritten to
 * the canonical filename — all best-effort, and skipped while any of them is
 * still downloading.
 *
 * Rejects when iCloud is unavailable (signed out, or iCloud Drive disabled for
 * the app) — callers treat that as "sharing unavailable", not an error.
 */
export const readAccountFile = async (): Promise<AccountRead> => {
  if (devAccountFileStaged())
    return { file: devAccountFile ?? null, pending: false }
  const read = await syncTransport().readFiles(isAccountFilename)
  // `pending: null` is a binary that can't tell (see `readFiles`). Treat its
  // read as complete, as before `pending` existed: refusing would stop claims
  // on those builds altogether, and claims still wait for the initial scan.
  const pending = (read.pending?.length ?? 0) > 0
  const candidates = read.files
    .map((f) => ({ filename: f.filename, payload: parseAccountFile(f.json) }))
    .filter(
      (c): c is { filename: string; payload: AccountFile } => c.payload !== null
    )
  if (candidates.length === 0) return { file: null, pending }

  let best = candidates[0]
  for (const c of candidates) {
    if (c.payload.updatedAt > best.payload.updatedAt) best = c
  }
  // The file still downloading may be the newest; canonicalizing now could
  // overwrite it with an older duplicate.
  if (pending) return { file: best.payload, pending }

  for (const c of candidates) {
    if (c.filename === best.filename || c.filename === ACCOUNT_FILENAME) {
      continue
    }
    void syncTransport()
      .deleteFile(c.filename)
      .catch(() => {})
  }
  if (best.filename !== ACCOUNT_FILENAME) {
    try {
      await syncTransport().write(
        ACCOUNT_FILENAME,
        JSON.stringify(best.payload)
      )
      await syncTransport().deleteFile(best.filename)
    } catch (e) {
      logger.warn('[Account] failed to canonicalize account file', e)
    }
  }
  return { file: best.payload, pending: false }
}

/** Claims (or re-claims) the account file with this device's claim. */
export const writeAccountFile = async (claim: AccountClaim): Promise<void> => {
  const payload: AccountFile = {
    v: 1,
    accountId: claim.appUserId,
    entitled: claim.entitled,
    updatedAt: Date.now(),
    claimedAt: claim.claimedAt,
    ...(claim.account ? { account: claim.account } : {}),
    deviceName: Device.modelName ?? undefined,
  }
  if (devAccountFileStaged()) {
    devAccountFile = payload
    return
  }
  await syncTransport().write(ACCOUNT_FILENAME, JSON.stringify(payload))
}

/**
 * Best-effort re-claim after a flow that wipes the whole sync namespace
 * (`overwriteRemoteWithLocal`). Not load-bearing — every device keeps its
 * adopted id locally, so the next reconcile pass re-claims the same id even
 * without this — but re-writing immediately closes the window where a fresh
 * device could claim first.
 */
export const reclaimAccountFile = async (entitled: boolean): Promise<void> => {
  if (!hasSyncTransport()) return
  if (!syncTransport().isAvailable()) return
  try {
    await writeAccountFile(
      getOwnAccountClaim(entitled, boundSupporterAccount())
    )
  } catch (e) {
    logger.warn('[Account] reclaim after remote wipe failed', e)
  }
}
