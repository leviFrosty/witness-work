import { HttpError } from '@/lib/http/request'
import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'
import {
  backupAad,
  deriveBackupKey,
  resealBlob,
} from '@/lib/serverAccount/backupCrypto'
import {
  deriveSyncKey,
  syncAad,
  syncBlobDigest,
} from '@/lib/syncTransport/server/syncCrypto'
import type { KeyChangeStep, KeyChangeStepContext } from './steps'

/**
 * Step 5 of a key change (docs/account-key-change.md, "The device flow"): every
 * Cloud Sync slot and backup slot of the account, other devices' too, re-sealed
 * under the new key, so nothing the account stores still needs the old one.
 * Each slot done is saved into the record, so a crash or a failure resumes
 * after it. A slot that the old key and the key history don't open is left as
 * it is.
 *
 * Puts carry `If-Match` with the ETag read (a 412 reads it again), and Cloud
 * Sync's `x-ww-reseal: 1` for another device's slot, which keeps its writer and
 * time. A put too soon after the slot's last (2 s for Cloud Sync, a minute for
 * backup) waits, then reads the slot again, since what landed may be newer.
 */

export type ResealSyncApi = {
  list: () => Promise<{ slotId: string; etag: string }[]>
  get: (slotId: string) => Promise<Uint8Array>
  put: (
    slotId: string,
    blob: Uint8Array,
    options: { ifMatch: string; reseal: boolean }
  ) => Promise<void>
}

export type ResealBackupApi = {
  list: () => Promise<{ slotId: string }[]>
  /** The slot's bytes, and their etag: null when the server sent none. */
  get: (slotId: string) => Promise<{ blob: Uint8Array; etag: string | null }>
  put: (
    slotId: string,
    blob: Uint8Array,
    options: { ifMatch: string }
  ) => Promise<void>
}

export type ResealStepDeps = {
  /** The account's Cloud Sync slots, as `accountKey`'s session. */
  sync: (accountKey: Uint8Array) => ResealSyncApi
  /** The account's backup slots, as `accountKey`'s session. */
  backup: (accountKey: Uint8Array) => ResealBackupApi
  /** This device's own Cloud Sync slot, put without `x-ww-reseal`. */
  ownSyncSlotId: () => string | null
  /**
   * The key history's derived keys, newest first; null when the history can't
   * be read, so a slot only it might open isn't given up on.
   */
  olderKeys: (
    accountId: string,
    kind: 'sync' | 'backup',
    accountKey: Uint8Array
  ) => Promise<readonly Uint8Array[] | null>
  randomBytes: (length: number) => Uint8Array
  sleep: (ms: number) => Promise<void>
}

type Done = NonNullable<KeyChangeRecord['reseal']>

/** Reads and puts one slot again when it changed meanwhile, this many times. */
const MAX_ATTEMPTS = 4
/**
 * Longer waits than this stop the step, to resume later (an account's daily
 * caps). It covers backup's one put a slot a minute, and Cloud Sync's 2-minute
 * hold on a slot while another put of it is in flight (this device's own push,
 * right after step 4).
 */
const MAX_WAIT_MS = 125_000
/** A Cloud Sync put in flight usually lands in seconds: look again soon. */
const SYNC_WAIT_STEP_MS = 3_000

/** The key history couldn't be read: a slot it might open waits. */
export class KeyHistoryUnavailableError extends Error {
  constructor() {
    super('The key history could not be read')
    this.name = 'KeyHistoryUnavailableError'
  }
}

const codeOf = (error: unknown) =>
  error instanceof HttpError ? error.serverCode : null

/** The account can't use Cloud Sync now: its slots stay under the old key. */
const syncUnavailable = (error: unknown) =>
  codeOf(error) === 'supporter_required' || codeOf(error) === 'disabled'

/** How long the server asks to wait, when it's short enough to. */
function waitFor(error: unknown): number | null {
  if (!(error instanceof HttpError) || error.serverCode !== 'rate_limited')
    return null
  const retryAfter = (error.body as { retryAfter?: unknown } | null)?.retryAfter
  const ms =
    error.retryAfterMs ??
    (typeof retryAfter === 'number' ? retryAfter * 1_000 : null)
  return ms !== null && ms <= MAX_WAIT_MS ? ms : null
}

export function createResealStep(deps: ResealStepDeps): KeyChangeStep {
  return async (context: KeyChangeStepContext) => {
    const done: Done = {
      syncSlots: [...(context.record.reseal?.syncSlots ?? [])],
      photos: [...(context.record.reseal?.photos ?? [])],
      backupSlots: [...(context.record.reseal?.backupSlots ?? [])],
    }
    const record = async (list: 'syncSlots' | 'backupSlots', id: string) => {
      done[list].push(id)
      await context.save({
        syncSlots: [...done.syncSlots],
        photos: [...done.photos],
        backupSlots: [...done.backupSlots],
      })
    }

    await resealSync(deps, context, done, (id) => record('syncSlots', id))
    // TODO(W5 photos, #1190): re-seal Cloud Sync photos here once they're on
    // the server: each under K2's name key (put the new, delete the old),
    // recorded in `done.photos`; `storage_full`, `limit` and `rate_limited`
    // leave a photo under K1 for a later launch without failing the step.
    await resealBackups(deps, context, done, (id) => record('backupSlots', id))
  }
}

async function resealSync(
  deps: ResealStepDeps,
  { oldKey, newKey, accountId }: KeyChangeStepContext,
  done: Done,
  record: (slotId: string) => Promise<void>
): Promise<void> {
  const api = deps.sync(newKey)
  let slots: { slotId: string }[]
  try {
    slots = await api.list()
  } catch (error) {
    if (syncUnavailable(error)) return
    throw error
  }
  const older = await deps.olderKeys(accountId, 'sync', newKey)
  const from = [deriveSyncKey(oldKey), ...(older ?? [])]
  const to = deriveSyncKey(newKey)
  const own = deps.ownSyncSlotId()
  // Past the server's re-seal window, other devices' slots stay under the old
  // key, where the key history opens them: no use downloading the rest.
  let resealRefused = false

  for (const { slotId } of slots) {
    if (done.syncSlots.includes(slotId)) continue
    if (resealRefused && slotId !== own) {
      await record(slotId)
      continue
    }
    const aad = syncAad({ accountId, slotId })
    for (let attempt = 1; ; attempt++) {
      let blob: Uint8Array
      try {
        blob = await api.get(slotId)
      } catch (error) {
        // Deleted since it was listed.
        if (codeOf(error) === 'not_found') break
        throw error
      }
      const result = resealBlob(blob, aad, {
        from,
        to,
        nonce: deps.randomBytes(24),
      })
      if (result.outcome === 'unopened' && older === null)
        throw new KeyHistoryUnavailableError()
      if (result.outcome !== 'resealed') break
      try {
        await api.put(slotId, result.blob, {
          // Only over the bytes just read.
          ifMatch: await syncBlobDigest(blob),
          reseal: slotId !== own,
        })
        break
      } catch (error) {
        const code = codeOf(error)
        if (attempt < MAX_ATTEMPTS) {
          // Changed (or deleted) since it was read: read it again.
          if (code === 'precondition_failed') continue
          // Put a moment ago (one put a slot every 2 s), or another put of it
          // in flight: wait a little, then read again.
          const wait = waitFor(error)
          if (wait !== null) {
            await deps.sleep(Math.min(wait, SYNC_WAIT_STEP_MS))
            continue
          }
        }
        // Past the server's re-seal window: the key history still opens it.
        if (code === 'forbidden') {
          resealRefused = true
          break
        }
        if (syncUnavailable(error)) return
        throw error
      }
    }
    await record(slotId)
  }
}

async function resealBackups(
  deps: ResealStepDeps,
  { oldKey, newKey, accountId }: KeyChangeStepContext,
  done: Done,
  record: (slotId: string) => Promise<void>
): Promise<void> {
  const api = deps.backup(newKey)
  let slots: { slotId: string }[]
  try {
    slots = await api.list()
  } catch (error) {
    if (codeOf(error) === 'disabled') return
    throw error
  }
  const older = await deps.olderKeys(accountId, 'backup', newKey)
  const from = [deriveBackupKey(oldKey), ...(older ?? [])]
  const to = deriveBackupKey(newKey)

  for (const { slotId } of slots) {
    if (done.backupSlots.includes(slotId)) continue
    const aad = backupAad({ accountId, slotId })
    for (let attempt = 1; ; attempt++) {
      let read: { blob: Uint8Array; etag: string | null }
      try {
        read = await api.get(slotId)
      } catch (error) {
        // Deleted since it was listed.
        if (codeOf(error) === 'not_found') break
        throw error
      }
      const result = resealBlob(read.blob, aad, {
        from,
        to,
        nonce: deps.randomBytes(24),
      })
      if (result.outcome === 'unopened' && older === null)
        throw new KeyHistoryUnavailableError()
      if (result.outcome !== 'resealed') break
      // Without the etag, the put could land over a newer backup or make a
      // deleted slot again: stop, to try later.
      if (!read.etag) throw new Error('Backup slot read without an etag')
      try {
        // Only over the bytes just read.
        await api.put(slotId, result.blob, { ifMatch: read.etag })
        break
      } catch (error) {
        // Backup was turned off: the rest stays under the old key, where the
        // key history opens it.
        if (codeOf(error) === 'disabled') return
        if (attempt < MAX_ATTEMPTS) {
          // Uploaded (or deleted) since it was read: read it again, which
          // skips a slot that's gone.
          if (codeOf(error) === 'precondition_failed') continue
          // One put a slot a minute, checked before `If-Match`: wait, then
          // read again, since what was put in that minute may be newer.
          const wait = waitFor(error)
          if (wait !== null) {
            await deps.sleep(wait)
            continue
          }
        }
        throw error
      }
    }
    await record(slotId)
  }
}
