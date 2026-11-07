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
import type { AccountClaim, DroppedAccountId } from '@/lib/accountClaim'

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'account' }))
const ADOPTED_KEY = 'adoptedAccountId'

const ADOPTED_ACCOUNT_KEY = 'adoptedFor'

const ADOPTED_UNTAGGED_KEY = 'adoptedUntagged'

const CLAIMED_AT_KEY = 'claimedAt'

const BOUND_KEY = 'supporterAccount'

const DROPPED_KEY = 'droppedAccountIds'

const MAX_DROPPED = 4

let _cached: { id: string; bound: string | null } | null = null

const idListeners = new Set<() => void>()
const notifyIdChange = () => {
  for (const listener of idListeners) listener()
}

export const onAccountIdChange = (listener: () => void): (() => void) => {
  idListeners.add(listener)
  return () => {
    idListeners.delete(listener)
  }
}

export const boundSupporterAccount = (): string | null => {
  try {
    return store().getString(BOUND_KEY) ?? null
  } catch {
    return null
  }
}

export const bindSupporterAccount = (account: string): void => {
  try {
    const previous = store().getString(BOUND_KEY) ?? null

    if (
      (previous === null || previous === account) &&
      store().getString(ADOPTED_KEY) &&
      !store().getString(ADOPTED_ACCOUNT_KEY)
    )
      store().set(ADOPTED_ACCOUNT_KEY, account)
    store().set(BOUND_KEY, account)
  } catch {}
  notifyIdChange()
}

export const droppedAccountIds = (): DroppedAccountId[] => {
  try {
    const value: unknown = JSON.parse(store().getString(DROPPED_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (entry): entry is DroppedAccountId =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as DroppedAccountId).appUserId === 'string' &&
        typeof (entry as DroppedAccountId).account === 'string'
    )
  } catch {
    return []
  }
}

const rememberDropped = (appUserId: string, account: string) => {
  const entries = [
    { appUserId, account },
    ...droppedAccountIds().filter((entry) => entry.appUserId !== appUserId),
  ].slice(0, MAX_DROPPED)
  store().set(DROPPED_KEY, JSON.stringify(entries))
}

const forgetAdopted = () => {
  store().delete(ADOPTED_KEY)
  store().delete(ADOPTED_ACCOUNT_KEY)
  store().delete(ADOPTED_UNTAGGED_KEY)
  store().delete(CLAIMED_AT_KEY)
  _cached = null
}

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
  if (adopted) {
    if (adoptedFor) rememberDropped(adopted, adoptedFor)
    forgetAdopted()
  }
  const installId = getOrCreateInstallId()
  _cached = { id: installId, bound }
  return installId
}

export const adoptAccountId = (
  accountId: string,
  claimedAt: number,
  account: string | null,
  options: { tagged?: boolean } = {}
): void => {
  store().set(ADOPTED_KEY, accountId)
  if (account) store().set(ADOPTED_ACCOUNT_KEY, account)
  else store().delete(ADOPTED_ACCOUNT_KEY)
  if (options.tagged === false) store().set(ADOPTED_UNTAGGED_KEY, 1)
  else store().delete(ADOPTED_UNTAGGED_KEY)
  store().set(CLAIMED_AT_KEY, claimedAt)
  _cached = null
  notifyIdChange()
}

export const clearAdoptedAccountId = (): void => {
  forgetAdopted()
  notifyIdChange()
}

export const adoptedAccountIdFor = (): string | null => {
  try {
    if (!store().getString(ADOPTED_KEY)) return null
    return store().getString(ADOPTED_ACCOUNT_KEY) ?? null
  } catch {
    return null
  }
}

export const dropAdoptedAccountId = (previous: string | null): void => {
  const adopted = store().getString(ADOPTED_KEY)
  const account = store().getString(ADOPTED_ACCOUNT_KEY) ?? previous
  if (adopted && account) rememberDropped(adopted, account)
  clearAdoptedAccountId()
}

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
  const adopted = store().getString(ADOPTED_KEY) === appUserId
  const tag =
    adopted && store().getNumber(ADOPTED_UNTAGGED_KEY) !== undefined
      ? null
      : (account ??
        (adopted ? (store().getString(ADOPTED_ACCOUNT_KEY) ?? null) : null))
  return tag
    ? { appUserId, entitled, claimedAt, account: tag }
    : { appUserId, entitled, claimedAt }
}

let devAccountFile: AccountFile | null | undefined
const devAccountFileListeners = new Set<() => void>()

export const stageDevAccountFile = (file: AccountFile | null | undefined) => {
  if (!__DEV__) return
  devAccountFile = file
  for (const listener of devAccountFileListeners) listener()
}

export const devAccountFileStaged = (): boolean =>
  __DEV__ && devAccountFile !== undefined

export const devStagedAccountFile = (): AccountFile | null | undefined =>
  __DEV__ ? devAccountFile : undefined

export const onDevAccountFileChange = (listener: () => void): (() => void) => {
  devAccountFileListeners.add(listener)
  return () => {
    devAccountFileListeners.delete(listener)
  }
}

export type AccountRead = {
  file: AccountFile | null

  pending: boolean
}

export const readAccountFile = async (): Promise<AccountRead> => {
  if (devAccountFileStaged())
    return { file: devAccountFile ?? null, pending: false }
  const read = await syncTransport().readFiles(isAccountFilename)

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
