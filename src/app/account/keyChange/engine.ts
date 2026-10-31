import { fromB64u, toB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  isCommitted,
  type KeyChangeRecord,
  type KeyChangeRecordStore,
  type KeyChangeStage,
} from '@/lib/accountKey/keyChangeRecord'
import type {
  RekeyPasskeyWrap,
  RekeyRequest,
  RekeyResult,
  StoredKeyHistory,
} from '@/lib/serverAccount/keyChangeClient'
import {
  appendKeyHistory,
  fitKeyHistory,
  type KeyHistory,
  keyHistoryEntry,
  openKeyHistory,
  sealKeyHistory,
} from '@/lib/serverAccount/keyHistory'
import { accountPubOf } from '@/lib/serverAccount/keys'
import {
  AccountSessionError,
  type RekeyedTokens,
} from '@/lib/serverAccount/session'
import {
  classifyNetworkError,
  isConnectivityError,
} from '@/lib/http/networkError'
import type { KeyChangeStep, KeyChangeStepName } from './steps'

/**
 * Changing the account key on this device (ADR 0039 §4;
 * docs/account-key-change.md, "The device flow"): the same account under a new
 * key. Each step is recorded in the change record before the next starts, so a
 * crash anywhere resumes (`resume`), and a change the server may have committed
 * is resolved before anything uses the old key.
 *
 * 0. `start`: online, the server's key is this device's, the key history opens,
 *    and Cloud Sync and backup are up to date (`prepare`).
 * 1. A new key, kept as `pending`.
 * 2. `confirm`: the User saved its recovery key; `confirmed`.
 * 3. `commit`: `account/rekey` (after the web's step-up); `committed`.
 * 4. The key is stored as this device's, keeping the session; `stored`.
 * 5. Re-seal (a registered step); `resealed`.
 * 6. Buddies reset (a registered step); `buddies-reset`.
 * 7. The record, and with it the old key, is deleted.
 */

/** What every event says; never a key, id or device name. */
export type KeyChangeEvent =
  | 'account_key_change_started'
  | 'account_key_change_completed'
  | 'account_key_change_resumed'
  | 'account_key_change_failed'

/**
 * Why `account_key_change_failed` was sent: another device changed the key
 * first (`conflict`, `key_retired`), the platform store refused the key
 * (`store`), or a later step stopped (`step`).
 */
export type KeyChangeFailedReason =
  | 'conflict'
  | 'key_retired'
  | 'store'
  | 'step'

export type KeyChangeFailureReason =
  | 'offline'
  | 'no_key'
  | 'account_mismatch'
  | 'history'
  | 'in_progress'
  | 'no_change'
  | 'not_confirmed'
  | 'committed'
  /** The server can't say yet whether a change committed. */
  | 'unresolved'
  | 'server'

export class KeyChangeError extends Error {
  constructor(readonly reason: KeyChangeFailureReason) {
    super(`Key change failed: ${reason}`)
    this.name = 'KeyChangeError'
  }
}

/** The account as this device's session reads it (`GET /account`). */
export type KeyChangeAccount = {
  accountId: string
  accountPub: string
  keyEpoch: number
}

export type KeyChangeEngineDeps = {
  records: KeyChangeRecordStore
  now: () => number
  randomBytes: (length: number) => Uint8Array
  /** For analytics. */
  platform: string
  /** This device's account key, without creating one. */
  deviceKey: () => Promise<Uint8Array | null>
  isOnline: () => boolean
  server: {
    /** `GET /account` with `key`'s session. */
    readAccount: (key: Uint8Array) => Promise<KeyChangeAccount>
    /** `GET /account/key-history` with `key`'s session. */
    readHistory: (key: Uint8Array) => Promise<StoredKeyHistory>
    rekey: (request: RekeyRequest) => Promise<RekeyResult>
    /**
     * The account this device is on (its session's, else the last one it was
     * on), and whether it holds a session there to ask with; null when it was
     * never on one.
     */
    deviceAccount: () => Promise<{ accountId: string; session: boolean } | null>
    /**
     * Opens a session with `key` only into `accountId`, never creating an
     * account, and without touching this device's own session: `unknownAccount`
     * when `key` isn't its current key, `keyRetired` when it was retired. Other
     * failures throw.
     */
    openInto: (
      key: Uint8Array,
      accountId: string
    ) => Promise<'opened' | 'unknownAccount' | 'keyRetired'>
    /** This device's label sealed under the new key, if any. */
    sealLabel?: (newKey: Uint8Array) => string | undefined
  }
  /** Step 0: Cloud Sync pulls, merges and pushes; a backup when it's on. */
  prepare: () => Promise<void>
  /** Step 4 (`accountKey.adoptChangedKey`). */
  adopt: (
    oldKey: Uint8Array,
    newKey: Uint8Array,
    call: {
      accountId: string
      tokens?: RekeyedTokens
    }
  ) => Promise<void>
  /** Keeps the history the change sealed on this device (`keyHistoryCache`). */
  saveHistory: (accountId: string, history: KeyHistory | null) => Promise<void>
  step: (name: KeyChangeStepName) => KeyChangeStep
  /**
   * The web's step-up, right after "I've saved it"; its passkey wraps the new
   * key. Phones check Face ID before starting instead.
   */
  stepUp?: (newKey: Uint8Array) => Promise<{ passkeyWrap?: RekeyPasskeyWrap }>
  track: (
    event: KeyChangeEvent,
    properties: {
      platform: string
      stage?: KeyChangeStage
      reason?: KeyChangeFailedReason
    }
  ) => void
}

export type CommitResult =
  | { outcome: 'done' }
  /** Another device changed the key first; this device's new key is gone. */
  | { outcome: 'lostRace' }
  | { outcome: 'sessionTooNew' }
  | { outcome: 'stepUpRequired' }

export type ResumeResult =
  | { state: 'none' }
  /** Not committed: offer to continue (back to step 2 or 3) or discard. */
  | { state: 'awaiting'; stage: 'pending' | 'confirmed' }
  /** Can't tell yet (offline); asked again next launch. */
  | { state: 'unresolved' }
  | { state: 'lostRace' }
  | { state: 'done' }

const NEXT: Partial<Record<KeyChangeStage, KeyChangeStage>> = {
  committed: 'stored',
  stored: 'resealed',
  resealed: 'buddies-reset',
}

const STEP: Partial<Record<KeyChangeStage, KeyChangeStepName>> = {
  stored: 'reseal',
  resealed: 'buddies-reset',
}

/**
 * No answer, or one that says nothing (a 401, or a server failure): the request
 * may have committed, so the account is checked.
 */
const answerLost = (error: unknown) =>
  isConnectivityError(error) ||
  (error instanceof HttpError &&
    error.status !== null &&
    (error.status === 401 || error.status >= 500))

/**
 * No connection, or no answer in time. A call the session layer cancelled (its
 * key retired on this device, or replaced meanwhile) isn't offline: saying so
 * would leave the User waiting for a connection they have.
 */
const isOffline = (error: unknown) => {
  const kind = classifyNetworkError(error)
  return kind === 'offline' || kind === 'timeout'
}

/**
 * Checking found this device signed out of the account: its session revoked by
 * the winner's change, or K1 reopening as retired.
 */
const isLost = (error: unknown) =>
  (error instanceof HttpError && error.serverCode === 'key_retired') ||
  (error instanceof AccountSessionError && error.ended === 'revoked')

export function createKeyChangeEngine(deps: KeyChangeEngineDeps) {
  let queue: Promise<unknown> = Promise.resolve()
  /** One operation at a time. */
  const serially = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  }

  const track = (
    event: KeyChangeEvent,
    extra: { stage?: KeyChangeStage; reason?: KeyChangeFailedReason } = {}
  ) => deps.track(event, { platform: deps.platform, ...extra })

  const listeners = new Set<(stage: KeyChangeStage | null) => void>()
  const notify = (stage: KeyChangeStage | null) => {
    for (const listener of listeners) listener(stage)
  }

  const save = async (record: KeyChangeRecord) => {
    await deps.records.write(record)
    notify(record.stage)
    return record
  }

  /** Deletes the record, and with it the new key or the old one. */
  const remove = async () => {
    await deps.records.remove()
    notify(null)
  }

  const keysOf = (record: KeyChangeRecord) => ({
    oldKey: fromB64u(record.oldKey),
    newKey: fromB64u(record.newKey),
  })

  /** Ends the change without committing: the new key is gone. */
  async function lostRace(
    record: KeyChangeRecord,
    reason: KeyChangeFailedReason
  ): Promise<void> {
    await remove()
    track('account_key_change_failed', { stage: record.stage, reason })
  }

  /** Steps 4 to 7, from the stage `record` reached. */
  async function proceed(
    start: KeyChangeRecord,
    tokens?: RekeyedTokens
  ): Promise<void> {
    let record = start
    const { oldKey, newKey } = keysOf(record)
    while (record.stage !== 'buddies-reset') {
      const stage = record.stage
      try {
        if (stage === 'committed') {
          await deps.adopt(oldKey, newKey, {
            accountId: record.accountId,
            ...(tokens && { tokens }),
          })
        } else {
          const name = STEP[stage]
          if (!name) throw new KeyChangeError('not_confirmed')
          let current = record
          await deps.step(name)({
            oldKey,
            newKey,
            accountId: record.accountId,
            record,
            save: async (reseal) => {
              current = await save({ ...current, reseal })
            },
          })
          record = current
        }
      } catch (error) {
        track('account_key_change_failed', {
          stage,
          reason: stage === 'committed' ? 'store' : 'step',
        })
        throw error
      }
      record = await save({ ...record, stage: NEXT[stage]! })
    }
    await remove()
    track('account_key_change_completed')
  }

  /** Steps 0 and 1. Returns K2, for its recovery key. */
  function start(): Promise<{ newKey: Uint8Array }> {
    return serially(async () => {
      if (!deps.isOnline()) throw new KeyChangeError('offline')
      const existing = await ownRecord()
      if (existing === 'unresolved') throw new KeyChangeError('offline')
      if (existing) throw new KeyChangeError('in_progress')
      const oldKey = await deps.deviceKey()
      if (!oldKey) throw new KeyChangeError('no_key')
      let account: KeyChangeAccount
      let stored: StoredKeyHistory
      try {
        account = await deps.server.readAccount(oldKey)
        if (account.accountPub !== accountPubOf(oldKey))
          throw new KeyChangeError('account_mismatch')
        stored = await deps.server.readHistory(oldKey)
      } catch (error) {
        if (error instanceof KeyChangeError) throw error
        throw new KeyChangeError(isOffline(error) ? 'offline' : 'server')
      }
      // The history this change appends to must open, and still fit with
      // this key's entry, now rather than at step 3.
      try {
        fitKeyHistory(
          appendKeyHistory(
            stored.history === null
              ? null
              : openKeyHistory(
                  oldKey,
                  account.accountId,
                  stored.keyEpoch,
                  stored.history
                ),
            keyHistoryEntry(oldKey, account.keyEpoch, deps.now())
          )
        )
      } catch {
        throw new KeyChangeError('history')
      }
      await deps.prepare()
      let newKey = deps.randomBytes(32)
      while (toB64u(newKey) === toB64u(oldKey)) newKey = deps.randomBytes(32)
      await save({
        v: 1,
        accountId: account.accountId,
        oldKey: toB64u(oldKey),
        newKey: toB64u(newKey),
        oldKeyEpoch: account.keyEpoch,
        stage: 'pending',
        startedAt: deps.now(),
      })
      track('account_key_change_started')
      return { newKey }
    })
  }

  /** Step 2: the User saved the new recovery key. */
  function confirm(): Promise<void> {
    return serially(async () => {
      const record = await ownRecord()
      if (record === 'unresolved') throw new KeyChangeError('offline')
      if (!record) throw new KeyChangeError('no_change')
      if (record.stage === 'pending')
        await save({ ...record, stage: 'confirmed' })
    })
  }

  /**
   * Leaves a change that wasn't committed: its new key is deleted. A confirmed
   * one may have been sent, so the server says first: one that committed
   * carries on instead (`committed`), and one it can't check yet stays
   * (`unresolved`).
   */
  function discard(): Promise<void> {
    return serially(async () => {
      const record = await ownRecord()
      if (record === 'unresolved') throw new KeyChangeError('unresolved')
      if (!record) return
      if (isCommitted(record)) throw new KeyChangeError('committed')
      if (record.stage === 'confirmed') {
        const resolved = await resolveConfirmed(record)
        if (resolved === 'unresolved') throw new KeyChangeError('unresolved')
        if (resolved === 'committed') {
          await save({ ...record, stage: 'committed' })
          throw new KeyChangeError('committed')
        }
      }
      await remove()
    })
  }

  /** The request for step 3: the history with K1's entry, sealed under K2. */
  async function rekeyRequest(
    record: KeyChangeRecord,
    passkeyWrap?: RekeyPasskeyWrap
  ): Promise<{ request: RekeyRequest; history: KeyHistory }> {
    const { oldKey, newKey } = keysOf(record)
    const stored = await deps.server.readHistory(oldKey)
    const older =
      stored.history === null
        ? null
        : openKeyHistory(
            oldKey,
            record.accountId,
            stored.keyEpoch,
            stored.history
          )
    // As it's sealed, so this device caches what the server holds.
    const history = fitKeyHistory(
      appendKeyHistory(
        older,
        keyHistoryEntry(oldKey, record.oldKeyEpoch, deps.now())
      )
    )
    const device = deps.server.sealLabel?.(newKey)
    return {
      history,
      request: {
        oldKey,
        newKey,
        keyEpoch: record.oldKeyEpoch,
        history: sealKeyHistory(
          newKey,
          record.accountId,
          record.oldKeyEpoch + 1,
          history,
          deps.randomBytes(24)
        ),
        ...(device !== undefined && { device }),
        ...(passkeyWrap && { passkeyWrap }),
      },
    }
  }

  /** How the account reads after an answer that was lost. */
  async function readAfterLoss(
    record: KeyChangeRecord
  ): Promise<'committed' | 'notCommitted' | 'lost'> {
    const { oldKey, newKey } = keysOf(record)
    let account: KeyChangeAccount
    try {
      account = await deps.server.readAccount(oldKey)
    } catch (error) {
      if (isLost(error)) return 'lost'
      throw new KeyChangeError(isOffline(error) ? 'offline' : 'server')
    }
    if (account.accountPub === accountPubOf(newKey)) return 'committed'
    if (account.accountPub === accountPubOf(oldKey)) return 'notCommitted'
    return 'lost'
  }

  /**
   * After an answer that says nothing (lost, or 401 `key_changed`): the account
   * decides. `resend` means not committed, so a new envelope.
   */
  async function afterUnknown(
    record: KeyChangeRecord
  ): Promise<CommitResult | 'resend'> {
    const read = await readAfterLoss(record)
    if (read === 'notCommitted') return 'resend'
    if (read === 'lost') {
      await lostRace(record, 'conflict')
      return { outcome: 'lostRace' }
    }
    const committed = await save({ ...record, stage: 'committed' })
    await proceed(committed)
    return { outcome: 'done' }
  }

  /** Step 3, then the rest. */
  function commit(): Promise<CommitResult> {
    return serially(async () => {
      const owned = await ownRecord()
      if (owned === 'unresolved') throw new KeyChangeError('offline')
      if (!owned) throw new KeyChangeError('no_change')
      let record = owned
      if (isCommitted(record)) {
        await proceed(record)
        return { outcome: 'done' }
      }
      if (record.stage !== 'confirmed')
        throw new KeyChangeError('not_confirmed')
      // An earlier send (before a crash, or a Try Again) may have committed:
      // the account says before anything is sent.
      const resolved = await resolveConfirmed(record)
      if (resolved === 'unresolved') throw new KeyChangeError('offline')
      if (resolved === 'lost') {
        await lostRace(record, 'conflict')
        return { outcome: 'lostRace' }
      }
      if (resolved === 'committed') {
        record = await save({ ...record, stage: 'committed' })
        await proceed(record)
        return { outcome: 'done' }
      }
      const { newKey } = keysOf(record)
      const passkeyWrap = (await deps.stepUp?.(newKey))?.passkeyWrap

      // A lost answer is read from the account; the envelope is never sent
      // twice. Not committed means a new one (fresh ts and nonce).
      for (let attempt = 0; ; attempt++) {
        let sent: { request: RekeyRequest; history: KeyHistory }
        let result: RekeyResult
        try {
          sent = await rekeyRequest(record, passkeyWrap)
          result = await deps.server.rekey(sent.request)
        } catch (error) {
          if (!answerLost(error) || attempt > 0) {
            if (error instanceof KeyChangeError) throw error
            throw new KeyChangeError(isOffline(error) ? 'offline' : 'server')
          }
          const checked = await afterUnknown(record)
          if (checked === 'resend') continue
          return checked
        }
        switch (result.outcome) {
          case 'committed': {
            record = await save({ ...record, stage: 'committed' })
            // Sealed for the epoch after the one read; another epoch means
            // it's read back from the server later instead.
            if (result.keyEpoch === record.oldKeyEpoch + 1)
              await deps
                .saveHistory(record.accountId, sent.history)
                .catch(() => undefined)
            await proceed(record, {
              accessToken: result.accessToken,
              accessExpiresAt: result.accessExpiresAt,
            })
            return { outcome: 'done' }
          }
          case 'conflict':
          case 'keyRetired':
            await lostRace(
              record,
              result.outcome === 'conflict' ? 'conflict' : 'key_retired'
            )
            return { outcome: 'lostRace' }
          case 'keyChanged': {
            // Its token predates a change: checked like a lost answer.
            const checked = await afterUnknown(record)
            if (checked !== 'resend') return checked
            if (attempt > 0) throw new KeyChangeError('server')
            continue
          }
          default:
            return { outcome: result.outcome }
        }
      }
    })
  }

  /**
   * Whether a confirmed change committed (docs/account-key-change.md, "The
   * record wins at launch"), always in the record's own account: with a session
   * there, the account says; otherwise (none, or another account's) opening
   * with K2 into the record's account does, then K1. `unresolved` only without
   * a connection; any other failure throws `server`.
   */
  async function resolveConfirmed(
    record: KeyChangeRecord
  ): Promise<'committed' | 'notCommitted' | 'lost' | 'unresolved'> {
    const { oldKey, newKey } = keysOf(record)
    try {
      const device = await deps.server.deviceAccount()
      if (device?.session && device.accountId === record.accountId) {
        try {
          const account = await deps.server.readAccount(oldKey)
          if (account.accountPub === accountPubOf(newKey)) return 'committed'
          if (account.accountPub === accountPubOf(oldKey)) return 'notCommitted'
          return 'lost'
        } catch (error) {
          if (isOffline(error)) return 'unresolved'
          // The session ended, or K1's was refused here: ask as a device
          // without one.
        }
      }
      if ((await deps.server.openInto(newKey, record.accountId)) === 'opened')
        return 'committed'
      const old = await deps.server.openInto(oldKey, record.accountId)
      return old === 'opened' ? 'notCommitted' : 'lost'
    } catch (error) {
      if (isOffline(error)) return 'unresolved'
      if (error instanceof KeyChangeError) throw error
      throw new KeyChangeError('server')
    }
  }

  /**
   * The record, when it's still this device's account's
   * (docs/account-key-change.md, "The record belongs to its account"). Once
   * this device is on another account, a change that never committed is deleted
   * (`null`): its K2 never became a key. A confirmed one is checked in its own
   * account first; if it committed, it's kept and finishes, since its K2 is
   * that account's only key (`unresolved` while that can't be told).
   */
  async function ownRecord(): Promise<KeyChangeRecord | null | 'unresolved'> {
    const record = await deps.records.read()
    if (!record || isCommitted(record)) return record
    const device = await deps.server.deviceAccount()
    if (!device || device.accountId === record.accountId) return record
    if (record.stage === 'confirmed') {
      const resolved = await resolveConfirmed(record)
      if (resolved === 'unresolved') return 'unresolved'
      if (resolved === 'committed')
        return save({ ...record, stage: 'committed' })
    }
    await remove()
    return null
  }

  /**
   * At launch, before the session layer uses the stored key: resolves a
   * confirmed change, and carries a committed one on to the end. Step failures
   * throw, leaving the record where it stopped. `onResolved` is called once the
   * record says which key is the device's, before the long steps run.
   */
  function resume(onResolved?: () => void): Promise<ResumeResult> {
    return serially(async () => {
      try {
        return await resumeRecord(onResolved)
      } finally {
        onResolved?.()
      }
    })
  }

  async function resumeRecord(onResolved?: () => void): Promise<ResumeResult> {
    {
      const owned = await ownRecord()
      if (owned === 'unresolved') return { state: 'unresolved' }
      if (!owned) return { state: 'none' }
      let record = owned
      if (record.stage === 'pending')
        return { state: 'awaiting', stage: 'pending' }
      if (record.stage === 'confirmed') {
        const resolved = await resolveConfirmed(record)
        if (resolved === 'unresolved') return { state: 'unresolved' }
        if (resolved === 'notCommitted')
          return { state: 'awaiting', stage: 'confirmed' }
        if (resolved === 'lost') {
          await lostRace(record, 'key_retired')
          return { state: 'lostRace' }
        }
        record = await save({ ...record, stage: 'committed' })
      }
      track('account_key_change_resumed', { stage: record.stage })
      onResolved?.()
      await proceed(record)
      return { state: 'done' }
    }
  }

  /** The change under way, without its keys: for the UI. */
  const current = async (): Promise<{
    stage: KeyChangeStage
    startedAt: number
  } | null> => {
    const record = await deps.records.read()
    return record ? { stage: record.stage, startedAt: record.startedAt } : null
  }

  /**
   * The new key of a change waiting for "I've saved it", to show its recovery
   * key again; null otherwise, and for another account's.
   */
  const pendingKey = (): Promise<Uint8Array | null> =>
    serially(async () => {
      const record = await ownRecord()
      return record !== 'unresolved' && record?.stage === 'pending'
        ? fromB64u(record.newKey)
        : null
    })

  /** Each stage the change records, then null once it's gone. */
  const onStage = (listener: (stage: KeyChangeStage | null) => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    start,
    confirm,
    discard,
    commit,
    resume,
    current,
    pendingKey,
    onStage,
  }
}

export type KeyChangeEngine = ReturnType<typeof createKeyChangeEngine>
