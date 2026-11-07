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

export type KeyChangeEvent =
  | 'account_key_change_started'
  | 'account_key_change_completed'
  | 'account_key_change_resumed'
  | 'account_key_change_failed'

export type KeyChangeFailedReason =
  | 'conflict'
  | 'key_retired'
  | 'store'
  | 'step'
  | 'session_too_new'
  | 'no_passkey'
  | 'unsupported'
  | 'step_up'

export type KeyChangeFailureReason =
  | 'offline'
  | 'no_key'
  | 'account_mismatch'
  | 'history'
  | 'in_progress'
  | 'no_change'
  | 'not_confirmed'
  | 'committed'
  | 'unresolved'
  | 'server'
  | 'session_too_new'
  | 'no_passkey'
  | 'unsupported'
  | 'step_up'

export class KeyChangeError extends Error {
  readonly availableAt?: number

  constructor(
    readonly reason: KeyChangeFailureReason,
    detail: { availableAt?: number } = {}
  ) {
    super(`Key change failed: ${reason}`)
    this.name = 'KeyChangeError'
    if (detail.availableAt !== undefined) this.availableAt = detail.availableAt
  }
}

export type KeyChangeAccount = {
  accountId: string
  accountPub: string
  keyEpoch: number
}

export type KeyChangeEngineDeps = {
  records: KeyChangeRecordStore

  exclusive?: <T>(run: () => Promise<T>) => Promise<T>

  finished?: () => void
  now: () => number
  randomBytes: (length: number) => Uint8Array

  platform: string

  deviceKey: () => Promise<Uint8Array | null>

  heldKey: () => Promise<Uint8Array | null>
  isOnline: () => boolean
  server: {
    readAccount: (key: Uint8Array) => Promise<KeyChangeAccount>

    readHistory: (key: Uint8Array) => Promise<StoredKeyHistory>
    rekey: (request: RekeyRequest) => Promise<RekeyResult>

    deviceAccount: () => Promise<{
      accountId: string
      session: boolean

      accountPub?: string | null
    } | null>

    openInto: (
      key: Uint8Array,
      accountId: string
    ) => Promise<'opened' | 'unknownAccount' | 'keyRetired'>

    sealLabel?: (newKey: Uint8Array) => string | undefined
  }

  precheck?: (oldKey: Uint8Array) => Promise<void>

  prepare: (change: { oldKey: Uint8Array; accountId: string }) => Promise<void>

  adopt: (
    oldKey: Uint8Array,
    newKey: Uint8Array,
    call: {
      accountId: string
      tokens?: RekeyedTokens
    }
  ) => Promise<void>

  saveHistory: (accountId: string, history: KeyHistory | null) => Promise<void>
  step: (name: KeyChangeStepName) => KeyChangeStep

  stepUp?: (change: {
    newKey: Uint8Array
    accountId: string
    keyEpoch: number
  }) => Promise<{ passkeyWrap?: RekeyPasskeyWrap }>
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
  | { outcome: 'lostRace' }
  | { outcome: 'sessionTooNew' }
  | { outcome: 'stepUpRequired' }

export type ResumeResult =
  | { state: 'none' }
  | { state: 'awaiting'; stage: 'pending' | 'confirmed' }
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

const answerLost = (error: unknown) =>
  isConnectivityError(error) ||
  (error instanceof HttpError &&
    error.status !== null &&
    (error.status === 401 || error.status >= 500))

const isOffline = (error: unknown) => {
  const kind = classifyNetworkError(error)
  return kind === 'offline' || kind === 'timeout'
}

const isLost = (error: unknown) =>
  (error instanceof HttpError && error.serverCode === 'key_retired') ||
  (error instanceof AccountSessionError &&
    (error.ended === 'key_changed' || error.ended === 'revoked'))

export function createKeyChangeEngine(deps: KeyChangeEngineDeps) {
  let queue: Promise<unknown> = Promise.resolve()
  const exclusive = deps.exclusive ?? (<T>(run: () => Promise<T>) => run())

  const serially = <T>(run: () => Promise<T>): Promise<T> => {
    const locked = () => exclusive(run)
    const next = queue.then(locked, locked)
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

  const remove = async () => {
    await deps.records.remove()
    notify(null)
  }

  const keysOf = (record: KeyChangeRecord) => ({
    oldKey: fromB64u(record.oldKey),
    newKey: fromB64u(record.newKey),
  })

  async function lostRace(
    record: KeyChangeRecord,
    reason: KeyChangeFailedReason
  ): Promise<void> {
    await remove()
    track('account_key_change_failed', { stage: record.stage, reason })
  }

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
    deps.finished?.()
  }

  async function precheck(oldKey: Uint8Array): Promise<void> {
    try {
      await deps.precheck?.(oldKey)
    } catch (error) {
      if (!(error instanceof KeyChangeError))
        throw new KeyChangeError(
          isConnectivityError(error) ? 'offline' : 'server'
        )
      if (
        error.reason === 'session_too_new' ||
        error.reason === 'no_passkey' ||
        error.reason === 'unsupported'
      )
        track('account_key_change_failed', { reason: error.reason })
      throw error
    }
  }

  async function stepUp(
    record: KeyChangeRecord
  ): Promise<RekeyPasskeyWrap | undefined> {
    if (!deps.stepUp) return undefined
    try {
      const passed = await deps.stepUp({
        newKey: keysOf(record).newKey,
        accountId: record.accountId,
        keyEpoch: record.oldKeyEpoch + 1,
      })
      return passed.passkeyWrap
    } catch (error) {
      if (!(error instanceof KeyChangeError))
        throw new KeyChangeError(
          isConnectivityError(error) ? 'offline' : 'server'
        )
      if (error.reason === 'step_up')
        track('account_key_change_failed', {
          stage: record.stage,
          reason: 'step_up',
        })
      throw error
    }
  }

  function start(): Promise<{ newKey: Uint8Array }> {
    return serially(async () => {
      if (!deps.isOnline()) throw new KeyChangeError('offline')
      const existing = await ownRecord()
      if (existing === 'unresolved') throw new KeyChangeError('offline')
      if (existing) throw new KeyChangeError('in_progress')
      const oldKey = await deps.deviceKey()
      if (!oldKey) throw new KeyChangeError('no_key')
      await precheck(oldKey)
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
      await deps.prepare({ oldKey, accountId: account.accountId })
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

  function confirm(): Promise<void> {
    return serially(async () => {
      const record = await ownRecord()
      if (record === 'unresolved') throw new KeyChangeError('offline')
      if (!record) throw new KeyChangeError('no_change')
      if (record.stage === 'pending')
        await save({ ...record, stage: 'confirmed' })
    })
  }

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

  function commit(
    hooks: { onStepUp?: (waiting: boolean) => void } = {}
  ): Promise<CommitResult> {
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
      if (deps.stepUp) hooks.onStepUp?.(true)
      let passkeyWrap: RekeyPasskeyWrap | undefined
      try {
        passkeyWrap = await stepUp(record)
      } finally {
        if (deps.stepUp) hooks.onStepUp?.(false)
      }

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
            const checked = await afterUnknown(record)
            if (checked !== 'resend') return checked
            if (attempt > 0) throw new KeyChangeError('server')
            continue
          }
          default:
            track('account_key_change_failed', {
              stage: record.stage,
              reason:
                result.outcome === 'sessionTooNew'
                  ? 'session_too_new'
                  : 'step_up',
            })
            return { outcome: result.outcome }
        }
      }
    })
  }

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

  async function ownRecord(): Promise<KeyChangeRecord | null | 'unresolved'> {
    const record = await deps.records.read()
    if (!record || isCommitted(record)) return record
    const device = await deps.server.deviceAccount()
    if (!device || device.accountId === record.accountId)
      return replacedKey(record, device)
    if (record.stage === 'confirmed') {
      const resolved = await resolveConfirmed(record)
      if (resolved === 'unresolved') return 'unresolved'
      if (resolved === 'committed')
        return save({ ...record, stage: 'committed' })
    }
    await remove()
    return null
  }

  async function replacedKey(
    record: KeyChangeRecord,
    device: Awaited<ReturnType<KeyChangeEngineDeps['server']['deviceAccount']>>
  ): Promise<KeyChangeRecord | null> {
    const held = await deps.heldKey().catch(() => null)
    if (!held) return record
    const heldPub = accountPubOf(held)
    const { oldKey, newKey } = keysOf(record)
    if (heldPub === accountPubOf(oldKey)) return record
    if (record.stage === 'confirmed') {
      if (heldPub === accountPubOf(newKey))
        return save({ ...record, stage: 'committed' })
      if (!device?.session || device.accountPub !== heldPub) return record
    }
    await lostRace(record, 'key_retired')
    return null
  }

  function lose(): Promise<void> {
    return serially(async () => {
      const record = await deps.records.read()
      if (record && !isCommitted(record)) await lostRace(record, 'key_retired')
    })
  }

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

  const current = async (): Promise<{
    stage: KeyChangeStage
    startedAt: number

    otherKeyHeld: boolean
  } | null> => {
    const record = await deps.records.read()
    if (!record) return null
    const held = await deps.heldKey().catch(() => null)
    return {
      stage: record.stage,
      startedAt: record.startedAt,
      otherKeyHeld: held !== null && toB64u(held) !== record.oldKey,
    }
  }

  const pendingKey = (): Promise<Uint8Array | null> =>
    serially(async () => {
      const record = await ownRecord()
      return record !== 'unresolved' && record?.stage === 'pending'
        ? fromB64u(record.newKey)
        : null
    })

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
    lose,
    commit,
    resume,
    current,
    pendingKey,
    onStage,
  }
}

export type KeyChangeEngine = ReturnType<typeof createKeyChangeEngine>
