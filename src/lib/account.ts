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

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'account' }))
const ADOPTED_KEY = 'adoptedAccountId'

let _cached: string | null = null

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

export const adoptAccountId = (accountId: string): void => {
  store().set(ADOPTED_KEY, accountId)
  _cached = accountId
}

export const clearAdoptedAccountId = (): void => {
  store().delete(ADOPTED_KEY)
  _cached = null
}

export type AccountRead = {
  file: AccountFile | null

  pending: boolean
}

export const readAccountFile = async (): Promise<AccountRead> => {
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
  await syncTransport().write(ACCOUNT_FILENAME, JSON.stringify(payload))
}

export const reclaimAccountFile = async (entitled: boolean): Promise<void> => {
  if (!hasSyncTransport()) return
  if (!syncTransport().isAvailable()) return
  try {
    await writeAccountFile(getOrCreateAccountId(), entitled)
  } catch (e) {
    logger.warn('[Account] reclaim after remote wipe failed', e)
  }
}
