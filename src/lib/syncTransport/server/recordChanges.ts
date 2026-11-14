import isEqual from 'lodash/isEqual'
import { fromB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  BackupOpenError,
  BACKUP_PLAINTEXT_VERSION,
  type BackupPlatform,
} from '@/lib/serverAccount/backupCrypto'
import {
  MAX_CHANGE_BYTES,
  newChangeId,
  openChange,
  sealChange,
} from '@/lib/syncTransport/server/changeCrypto'
import {
  applyPayloadChange,
  diffPayload,
  type Fingerprints,
  fingerprintPayload,
  heldBy,
  parsePayloadChange,
  type PayloadTree,
} from '@/lib/syncTransport/server/payloadDiff'
import type {
  ServerSyncAccess,
  SlotStore,
} from '@/lib/syncTransport/server/serverTypes'
import {
  deleteSyncSlot,
  getSyncSlot,
  listSyncChanges,
  listSyncSlots,
  parseSyncCatchUp,
  parseSyncChange,
  putSyncChange,
  putSyncSlot,
  type SyncCatchUp,
  type SyncChange,
  SYNC_LIMITS,
} from '@/lib/syncTransport/server/syncClient'
import {
  openSyncBlob,
  sealSyncBlob,
  syncBlobDigest,
} from '@/lib/syncTransport/server/syncCrypto'
import {
  type SyncFile,
  type SyncRead,
  type SyncReadOptions,
  SyncTransportError,
  type SyncWriteOptions,
} from '@/lib/syncTransport/types'

export type ChangeStore = {
  get: (key: string) => string | null
  set: (key: string, value: string) => void
  delete: (key: string) => void
  clear: () => void
}

export const RECORD_CHANGE_LIMITS = {
  foldTailChanges: 50,
  foldTailBytes: 128 * 1024,

  urgentFoldTailChanges: 150,

  snapshotReaderFoldMs: 5_000,

  localFoldChanges: 64,
  localFoldBytes: 256 * 1024,

  liveWaitMs: 2_000,
  liveReplyMs: 5_000,

  maxStoredBaseBytes: 2 * 1024 * 1024,
} as const

const CATCH_UP_ATTEMPTS = 3
const STATE_VERSION = 1
const STATE_KEY = 'state'
const FINGERPRINTS_KEY = 'fp'
const tailKey = (slotId: string) => `t:${slotId}`

type StoredChange = Pick<
  SyncChange,
  'sequence' | 'changeId' | 'createdAt' | 'blob'
>

type OwnSlot = {
  slotId: string

  etag: string | null
  changedAt: number | null

  fingerprints: Fingerprints | null
  tailCount: number
  tailBytes: number

  lastSequence: number
  snapshotReaders: boolean
}

type OtherSlot = {
  etag: string

  baseThrough: number
  baseAt: number

  through: number
  modifiedAt: number
  payload: PayloadTree | null
  problem: 'newer' | 'invalid' | null
  json: string | null
  tail: StoredChange[]
  tailBytes: number
}

type StoredState = {
  v: number
  id: string
  cursor: number
  own: Omit<OwnSlot, 'fingerprints'> | null
  slots: Record<string, { etag: string; through: number; at: number }>
}

export type LiveSend = (data: string) => void

export type RecordChangesDeps = {
  slotStore?: SlotStore
  changeStore?: ChangeStore
  access: () => Promise<ServerSyncAccess>

  accessId: (access: ServerSyncAccess) => string
  ownSlotId: () => string | null
  randomBytes: (length: number) => Uint8Array
  deviceName: () => string
  platform: BackupPlatform
  now: () => number

  onRemoteChange: () => void

  requestPush: () => void

  onCatchUp?: (status: Pick<SyncCatchUp, 'requestedAt' | 'photos'>) => void

  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

export type RecordChangeStats = {
  cursor: number
  subscribed: boolean
  stale: boolean
  ownTail: { count: number; bytes: number } | null
  slots: number
}

export type RecordChanges = {
  read: (
    current: ServerSyncAccess,
    include: (filename: string) => boolean,
    options: SyncReadOptions | undefined,
    names: {
      filenameForSlot: (slotId: string) => string
      newerPlaceholder: string

      readOwnBase: (slotId: string, etag: string) => Promise<string | null>
    }
  ) => Promise<SyncRead>

  write: (
    current: ServerSyncAccess,
    slotId: string,
    json: string,
    options?: SyncWriteOptions
  ) => Promise<number>

  wantsCompaction: () => boolean

  deleteEndedWebSlots: (
    current: ServerSyncAccess,
    merged: ReadonlyMap<string, number>,
    filenameForSlot: (slotId: string) => string
  ) => Promise<string[]>

  forgetSlot: (slotId: string) => void

  forgetOwn: () => void
  reset: () => void
  cursor: () => number

  liveConnecting: (connecting: boolean) => void
  liveClosed: () => void
  liveMessage: (message: Record<string, unknown>, send: LiveSend) => void
  stats: () => RecordChangeStats
}

const serverCodeOf = (error: unknown) =>
  error instanceof HttpError ? error.serverCode : undefined

export const isChangesDisabled = (error: unknown) =>
  serverCodeOf(error) === 'changes_disabled'

const sealedBytes = (blob: string) => Math.floor((blob.length * 3) / 4)

export function createRecordChanges(deps: RecordChangesDeps): RecordChanges {
  const setTimer =
    deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms))
  const clearTimer =
    deps.clearTimer ??
    ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>))

  let loadedFor: string | null = null
  let cursor = 0
  let own: OwnSlot | null = null
  let others = new Map<string, OtherSlot>()
  let ownAhead = new Set<number>()
  let stale = true
  let foldWanted = false
  let foldTimer: unknown = null

  let live: { send: LiveSend; subscribed: boolean; failed: boolean } | null =
    null
  let connecting = false
  let liveWaiters: Array<() => void> = []
  let pending: {
    resolve: (catchUp: SyncCatchUp) => void
    reject: (error: unknown) => void
  } | null = null

  let chain: Promise<unknown> = Promise.resolve()
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task)
    chain = run.catch(() => undefined)
    return run
  }

  const store = <T>(work: (store: ChangeStore) => T): T | undefined => {
    if (!deps.changeStore) return undefined
    try {
      return work(deps.changeStore)
    } catch {
      return undefined
    }
  }
  const bases = <T>(work: (store: SlotStore) => T): T | undefined => {
    if (!deps.slotStore) return undefined
    try {
      return work(deps.slotStore)
    } catch {
      return undefined
    }
  }

  const persistState = () => {
    if (!loadedFor) return
    const state: StoredState = {
      v: STATE_VERSION,
      id: loadedFor,
      cursor,
      own: own
        ? {
            slotId: own.slotId,
            etag: own.etag,
            changedAt: own.changedAt,
            tailCount: own.tailCount,
            tailBytes: own.tailBytes,
            lastSequence: own.lastSequence,
            snapshotReaders: own.snapshotReaders,
          }
        : null,
      slots: Object.fromEntries(
        [...others].map(([slotId, slot]) => [
          slotId,
          { etag: slot.etag, through: slot.baseThrough, at: slot.baseAt },
        ])
      ),
    }
    store((s) => s.set(STATE_KEY, JSON.stringify(state)))
  }
  const persistFingerprints = () =>
    store((s) =>
      own?.fingerprints
        ? s.set(FINGERPRINTS_KEY, JSON.stringify(own.fingerprints))
        : s.delete(FINGERPRINTS_KEY)
    )
  const persistTail = (slotId: string, slot: OtherSlot | null) =>
    store((s) =>
      slot?.tail.length
        ? s.set(tailKey(slotId), JSON.stringify(slot.tail))
        : s.delete(tailKey(slotId))
    )

  const forgetOther = (slotId: string) => {
    others.delete(slotId)
    persistTail(slotId, null)
    bases((s) => s.remove(slotId))
  }

  const clearMemory = () => {
    cursor = 0
    own = null
    others = new Map()
    ownAhead = new Set()
    stale = true
    foldWanted = false
    if (foldTimer !== null) clearTimer(foldTimer)
    foldTimer = null
    if (live) live.subscribed = false
  }

  const startOver = () => {
    const keptOwn = own
    store((s) => s.clear())
    clearMemory()
    own = keptOwn
    persistFingerprints()
    persistState()
  }

  const openBase = (
    current: ServerSyncAccess,
    slotId: string,
    blob: Uint8Array
  ): Pick<OtherSlot, 'payload' | 'problem'> => {
    try {
      const { payload } = openSyncBlob(
        current.syncKey,
        blob,
        { accountId: current.accountId, slotId },
        current.olderSyncKeys
      )
      return { payload: payload as PayloadTree, problem: null }
    } catch (error) {
      return {
        payload: null,
        problem:
          error instanceof BackupOpenError && error.problem === 'newer'
            ? 'newer'
            : 'invalid',
      }
    }
  }

  const applyTo = (
    current: ServerSyncAccess,
    slotId: string,
    slot: OtherSlot,
    change: StoredChange
  ) => {
    slot.through = change.sequence
    slot.modifiedAt = change.createdAt
    slot.json = null
    if (!slot.payload) return
    let opened: unknown
    try {
      opened = openChange(
        current.syncKey,
        fromB64u(change.blob),
        {
          accountId: current.accountId,
          slotId,
          changeId: change.changeId,
        },
        current.olderSyncKeys
      )
    } catch {
      slot.problem ??= 'invalid'
      return
    }
    const parsed = parsePayloadChange(opened)
    if (parsed === 'newer') slot.problem = 'newer'
    else if (parsed === null) slot.problem ??= 'invalid'
    else applyPayloadChange(slot.payload, parsed)
  }

  const load = (current: ServerSyncAccess) => {
    const id = deps.accessId(current)
    if (loadedFor === id) return
    clearMemory()
    loadedFor = id
    const ownSlotId = deps.ownSlotId()
    let state: StoredState | null = null
    try {
      const raw = store((s) => s.get(STATE_KEY))
      state = raw ? (JSON.parse(raw) as StoredState) : null
    } catch {}
    if (state?.v !== STATE_VERSION || state.id !== id) {
      store((s) => s.clear())
      return
    }
    cursor = Number.isSafeInteger(state.cursor) ? state.cursor : 0
    if (state.own && state.own.slotId === ownSlotId) {
      let fingerprints: Fingerprints | null = null
      try {
        const raw = store((s) => s.get(FINGERPRINTS_KEY))
        fingerprints = raw ? (JSON.parse(raw) as Fingerprints) : null
      } catch {}
      own = { ...state.own, fingerprints }
    }
    for (const [slotId, kept] of Object.entries(state.slots ?? {})) {
      const base = bases((s) => s.read(current.accountId, slotId))
      const opened =
        base?.etag === kept.etag ? openBase(current, slotId, base.blob) : null
      if (!opened || opened.problem) {
        cursor = 0
        continue
      }
      const slot: OtherSlot = {
        etag: kept.etag,
        baseThrough: kept.through,
        baseAt: kept.at,
        through: kept.through,
        modifiedAt: kept.at,
        ...opened,
        json: null,
        tail: [],
        tailBytes: 0,
      }
      try {
        const raw = store((s) => s.get(tailKey(slotId)))
        const tail = raw ? (JSON.parse(raw) as StoredChange[]) : []
        for (const change of tail) {
          if (change.sequence <= slot.through) continue
          applyTo(current, slotId, slot, change)
          slot.tail.push(change)
          slot.tailBytes += sealedBytes(change.blob)
        }
      } catch {
        cursor = 0
        continue
      }
      others.set(slotId, slot)
    }
    if (cursor === 0) startOver()
  }

  const advanceOwn = () => {
    while (ownAhead.delete(cursor + 1)) cursor += 1
    for (const sequence of ownAhead)
      if (sequence <= cursor) ownAhead.delete(sequence)
  }
  const noteOwnSequence = (sequence: number) => {
    ownAhead.add(sequence)
    advanceOwn()
  }

  const waitForLive = () =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimer(timer)
        liveWaiters = liveWaiters.filter((waiter) => waiter !== done)
        resolve()
      }
      const timer = setTimer(done, RECORD_CHANGE_LIMITS.liveWaitMs)
      liveWaiters.push(done)
    })
  const releaseLiveWaiters = () => {
    for (const waiter of [...liveWaiters]) waiter()
  }

  const askLive = (
    socket: NonNullable<typeof live>,
    afterSequence: number
  ): Promise<SyncCatchUp> =>
    new Promise<SyncCatchUp>((resolve, reject) => {
      const settle = () => {
        clearTimer(timer)
        if (pending === waiting) pending = null
      }
      const waiting = {
        resolve: (catchUp: SyncCatchUp) => {
          settle()
          resolve(catchUp)
        },
        reject: (error: unknown) => {
          settle()
          reject(error)
        },
      }
      const timer = setTimer(
        () => waiting.reject(new Error('live reply timed out')),
        RECORD_CHANGE_LIMITS.liveReplyMs
      )
      pending = waiting
      try {
        socket.send(JSON.stringify({ type: 'sync', afterSequence }))
      } catch (error) {
        waiting.reject(error)
      }
    })

  const fetchCatchUp = async (
    current: ServerSyncAccess,
    ownSlotId: string,
    afterSequence: number
  ): Promise<{ catchUp: SyncCatchUp; socket: typeof live }> => {
    if (!live && connecting) await waitForLive()
    const socket = live
    if (socket && !socket.failed) {
      try {
        return { catchUp: await askLive(socket, afterSequence), socket }
      } catch (error) {
        if (isChangesDisabled(error)) throw error
        socket.failed = true
        socket.subscribed = false
      }
    }
    return {
      catchUp: await listSyncChanges(current.options, ownSlotId, afterSequence),
      socket: null,
    }
  }

  const foldLocally = (
    current: ServerSyncAccess,
    slotId: string,
    slot: OtherSlot
  ) => {
    if (
      !deps.slotStore ||
      !slot.payload ||
      slot.problem ||
      (slot.tail.length < RECORD_CHANGE_LIMITS.localFoldChanges &&
        slot.tailBytes < RECORD_CHANGE_LIMITS.localFoldBytes)
    )
      return
    let blob: Uint8Array
    try {
      blob = sealSyncBlob(
        current.syncKey,
        {
          v: BACKUP_PLAINTEXT_VERSION,
          deviceName: '',
          platform: deps.platform,
          createdAt: slot.modifiedAt,
          payload: slot.payload,
        },
        { accountId: current.accountId, slotId },
        deps.randomBytes(24)
      )
    } catch {
      return
    }
    if (blob.length > RECORD_CHANGE_LIMITS.maxStoredBaseBytes) return
    const etag = `local.${slot.through}`
    try {
      deps.slotStore.write(current.accountId, slotId, etag, blob)
    } catch {
      return
    }
    slot.etag = etag
    slot.baseThrough = slot.through
    slot.baseAt = slot.modifiedAt
    slot.tail = []
    slot.tailBytes = 0
    persistTail(slotId, null)
  }

  const scheduleFold = () => {
    foldWanted = true
    if (foldTimer !== null) return
    foldTimer = setTimer(() => {
      foldTimer = null
      if (foldWanted) deps.requestPush()
    }, RECORD_CHANGE_LIMITS.snapshotReaderFoldMs)
  }

  const noteTail = () => {
    if (!own?.etag || own.tailCount === 0) return
    if (own.snapshotReaders) scheduleFold()
    else if (
      own.tailCount >= RECORD_CHANGE_LIMITS.foldTailChanges ||
      own.tailBytes >= RECORD_CHANGE_LIMITS.foldTailBytes
    )
      foldWanted = true
  }

  const catchUp = async (current: ServerSyncAccess): Promise<boolean> => {
    const ownSlotId = deps.ownSlotId()
    if (!ownSlotId) throw new SyncTransportError('unknown', 'no device slot')
    for (let attempt = 0; attempt < CATCH_UP_ATTEMPTS; attempt++) {
      advanceOwn()
      const sent = cursor
      let { catchUp: page, socket } = await fetchCatchUp(
        current,
        ownSlotId,
        sent
      )
      const changes = [...page.changes]
      while (page.more && page.changes.length > 0) {
        const next = await fetchCatchUp(
          current,
          ownSlotId,
          changes[changes.length - 1].sequence
        )
        page = next.catchUp
        socket = socket && next.socket === socket ? socket : null
        changes.push(...page.changes)
      }
      if (deps.accessId(current) !== loadedFor) return false
      if (page.sequence < sent) {
        startOver()
        continue
      }
      const lost =
        sent > 0 &&
        page.slots.some(
          (slot) =>
            slot.slotId !== ownSlotId &&
            !others.has(slot.slotId) &&
            slot.floorSequence <= sent
        )
      if (lost) {
        startOver()
        continue
      }

      const fresh = new Map<
        string,
        { blob: Uint8Array; stored: boolean } & Pick<
          OtherSlot,
          'payload' | 'problem'
        >
      >()
      let moved = false
      for (const slot of page.slots) {
        if (slot.slotId === ownSlotId) continue
        if (others.has(slot.slotId) && slot.floorSequence <= sent) continue
        const stored = bases((s) => s.read(current.accountId, slot.slotId))
        if (stored?.etag === slot.etag) {
          const opened = openBase(current, slot.slotId, stored.blob)
          if (!opened.problem) {
            fresh.set(slot.slotId, {
              blob: stored.blob,
              stored: true,
              ...opened,
            })
            continue
          }
        }
        let blob: Uint8Array
        try {
          blob = await getSyncSlot(current.options, slot.slotId)
        } catch (error) {
          if (serverCodeOf(error) !== 'not_found') throw error
          moved = true
          break
        }
        if ((await syncBlobDigest(blob)) !== slot.etag) {
          moved = true
          break
        }
        fresh.set(slot.slotId, {
          blob,
          stored: false,
          ...openBase(current, slot.slotId, blob),
        })
      }
      if (moved) continue
      if (deps.accessId(current) !== loadedFor) return false

      let changed = false
      const listed = new Set(page.slots.map((slot) => slot.slotId))
      let gone = false
      for (const slotId of [...others.keys()])
        if (!listed.has(slotId)) {
          forgetOther(slotId)
          changed = gone = true
        }
      const touched = new Set<string>()
      for (const slot of page.slots) {
        const base = fresh.get(slot.slotId)
        if (!base) continue
        if (!base.stored)
          bases((s) =>
            base.problem ||
            base.blob.length > RECORD_CHANGE_LIMITS.maxStoredBaseBytes
              ? s.remove(slot.slotId)
              : s.write(current.accountId, slot.slotId, slot.etag, base.blob)
          )
        others.set(slot.slotId, {
          etag: slot.etag,
          baseThrough: slot.floorSequence,
          baseAt: slot.updatedAt,
          through: slot.floorSequence,
          modifiedAt: slot.updatedAt,
          payload: base.payload,
          problem: base.problem,
          json: null,
          tail: [],
          tailBytes: 0,
        })
        touched.add(slot.slotId)
        changed = true
      }
      for (const change of changes) {
        const slot = others.get(change.slotId)
        if (!slot || change.sequence <= slot.through) continue
        const kept = {
          sequence: change.sequence,
          changeId: change.changeId,
          createdAt: change.createdAt,
          blob: change.blob,
        }
        applyTo(current, change.slotId, slot, kept)
        slot.tail.push(kept)
        slot.tailBytes += sealedBytes(kept.blob)
        touched.add(change.slotId)
        changed = true
      }

      const ownListed = page.slots.find((slot) => slot.slotId === ownSlotId)
      if (!ownListed) {
        if (own?.etag) changed = true
        own = null
        persistFingerprints()
      } else if (own?.slotId === ownSlotId && own.etag === ownListed.etag) {
        own.changedAt = ownListed.changedAt
        own.snapshotReaders = page.snapshotReaders
      } else {
        own = {
          slotId: ownSlotId,
          etag: ownListed.etag,
          changedAt: ownListed.changedAt,
          fingerprints: null,
          tailCount: 0,
          tailBytes: 0,
          lastSequence: 0,
          snapshotReaders: page.snapshotReaders,
        }
        persistFingerprints()
      }

      cursor = Math.max(page.sequence, sent)
      advanceOwn()
      stale = false
      if (socket && socket === live) socket.subscribed = true
      for (const slotId of touched) {
        const slot = others.get(slotId)
        if (!slot) continue
        foldLocally(current, slotId, slot)
        persistTail(slotId, slot)
      }
      persistState()
      deps.onCatchUp?.({ requestedAt: page.requestedAt, photos: page.photos })
      noteTail()
      if (gone) deps.requestPush()
      return changed
    }
    throw new SyncTransportError('server-error', 'catch-up kept moving')
  }

  const applyLiveChange = async (change: SyncChange) => {
    if (!loadedFor || !live?.subscribed) return
    advanceOwn()
    if (change.sequence <= cursor) return
    const slot = others.get(change.slotId)
    if (stale || !slot || change.sequence !== cursor + 1) {
      stale = true
      deps.onRemoteChange()
      return
    }
    let current: ServerSyncAccess
    try {
      current = await deps.access()
    } catch {
      stale = true
      return
    }
    if (
      deps.accessId(current) !== loadedFor ||
      others.get(change.slotId) !== slot
    )
      return
    const kept = {
      sequence: change.sequence,
      changeId: change.changeId,
      createdAt: change.createdAt,
      blob: change.blob,
    }
    applyTo(current, change.slotId, slot, kept)
    slot.tail.push(kept)
    slot.tailBytes += sealedBytes(kept.blob)
    cursor = change.sequence
    advanceOwn()
    foldLocally(current, change.slotId, slot)
    persistTail(change.slotId, slot)
    persistState()
    deps.onRemoteChange()
  }

  const subscribe = async () => {
    if (!live || live.subscribed) return
    let changed = true
    try {
      const current = await deps.access()
      load(current)
      changed = await catchUp(current)
    } catch {}
    if (changed) deps.onRemoteChange()
  }

  const sameGeneration = (payload: PayloadTree): PayloadTree[] => {
    const held: PayloadTree[] = []
    for (const slot of others.values())
      if (
        slot.payload &&
        !slot.problem &&
        isEqual(slot.payload.resetEpoch, payload.resetEpoch)
      )
        held.push(slot.payload)
    return held
  }

  const putBase = async (
    current: ServerSyncAccess,
    slotId: string,
    payload: PayloadTree,
    coversSequence?: number
  ): Promise<number> => {
    const blob = sealSyncBlob(
      current.syncKey,
      {
        v: BACKUP_PLAINTEXT_VERSION,
        deviceName: deps.deviceName(),
        platform: deps.platform,
        createdAt: deps.now(),
        payload,
      },
      { accountId: current.accountId, slotId },
      deps.randomBytes(24)
    )
    if (blob.length > SYNC_LIMITS.bytes)
      throw new SyncTransportError('storage-full', 'too_large')
    const put = await putSyncSlot(current.options, slotId, blob, {
      coversSequence,
    })
    own = {
      slotId,
      etag: put.etag,
      changedAt: put.updatedAt,
      fingerprints: fingerprintPayload(payload),
      tailCount: 0,
      tailBytes: 0,
      lastSequence: coversSequence ?? 0,
      snapshotReaders: own?.snapshotReaders ?? false,
    }
    foldWanted = false
    if (foldTimer !== null) clearTimer(foldTimer)
    foldTimer = null
    noteOwnSequence(put.seq)
    persistFingerprints()
    persistState()
    return put.updatedAt
  }

  return {
    read: (current, include, options, names) =>
      serialize(async () => {
        load(current)
        if (stale || !live?.subscribed) await catchUp(current)
        const ownSlotId = deps.ownSlotId()
        const files: SyncFile[] = []
        const slotIds = [...others.keys()]
        if (own?.etag && own.slotId === ownSlotId) slotIds.push(own.slotId)
        for (const slotId of slotIds.sort()) {
          const filename = names.filenameForSlot(slotId)
          if (!include(filename)) continue
          if (slotId === ownSlotId) {
            const etag = own?.etag
            const json =
              !etag || options?.listOnly?.(filename)
                ? ''
                : ((await names.readOwnBase(slotId, etag)) ?? '')
            files.push({ filename, json, modifiedAt: own?.changedAt ?? 0 })
            continue
          }
          const slot = others.get(slotId)!
          if (options?.listOnly?.(filename)) {
            files.push({ filename, json: '', modifiedAt: slot.modifiedAt })
            continue
          }
          const json =
            slot.problem === 'newer'
              ? names.newerPlaceholder
              : slot.problem || !slot.payload
                ? ''
                : (slot.json ??= JSON.stringify(slot.payload))
          files.push({ filename, json, modifiedAt: slot.modifiedAt })
        }
        return { files, pending: [] }
      }),

    write: (current, slotId, json, options) =>
      serialize(async () => {
        load(current)
        const payload = JSON.parse(json) as PayloadTree
        const known =
          own?.slotId === slotId && own.etag ? own.fingerprints : null
        if (!own || !known) return putBase(current, slotId, payload)
        const diff = diffPayload(
          payload,
          known,
          heldBy(sameGeneration(payload))
        )
        if (!diff || diff.needsBase) return putBase(current, slotId, payload)

        if (diff.change) {
          const changeId = newChangeId(deps.randomBytes)
          const blob = sealChange(
            current.syncKey,
            diff.change,
            { accountId: current.accountId, slotId, changeId },
            deps.randomBytes(24)
          )
          if (blob.length > MAX_CHANGE_BYTES)
            return putBase(current, slotId, payload)
          const send = () =>
            putSyncChange(current.options, { slotId, changeId, blob })
          let put: Awaited<ReturnType<typeof send>>
          try {
            put = await send()
          } catch (error) {
            const code = serverCodeOf(error)
            if (code !== 'no_slot' && code !== 'tail_full') throw error
            return putBase(current, slotId, payload)
          }
          own.fingerprints = diff.fingerprints
          own.tailCount = put.tailCount
          own.tailBytes = put.tailBytes
          own.lastSequence = put.sequence
          own.snapshotReaders = put.snapshotReaders
          own.changedAt = put.changedAt ?? deps.now()
          noteOwnSequence(put.sequence)
          persistFingerprints()
          persistState()
          noteTail()
        }

        const urgent =
          own.tailCount >= RECORD_CHANGE_LIMITS.urgentFoldTailChanges
        if (
          own.tailCount > 0 &&
          (urgent || options?.fold || (foldWanted && options?.compact))
        )
          return putBase(current, slotId, payload, own.lastSequence)
        return own.changedAt ?? deps.now()
      }),

    wantsCompaction: () => foldWanted && (own?.tailCount ?? 0) > 0,

    deleteEndedWebSlots: (current, merged, filenameForSlot) =>
      serialize(async () => {
        load(current)
        const ownSlotId = deps.ownSlotId()
        if (!ownSlotId) return []
        const listing = await listSyncSlots(current.options, {
          readsChanges: true,
        })
        advanceOwn()
        if (listing.seq > cursor && (await catchUp(current)))
          deps.onRemoteChange()
        if (listing.seq > cursor) return []
        const deleted: string[] = []
        for (const listed of listing.slots) {
          const slot = others.get(listed.slotId)
          const filename = filenameForSlot(listed.slotId)
          if (
            listed.slotId === ownSlotId ||
            listed.platform !== 'web' ||
            !listed.ended ||
            !slot ||
            merged.get(filename) !== slot.modifiedAt
          )
            continue
          try {
            await deleteSyncSlot(current.options, listed.slotId)
          } catch {
            continue
          }
          stale = true
          forgetOther(listed.slotId)
          deleted.push(filename)
        }
        if (deleted.length) {
          persistState()
          deps.requestPush()
        }
        return deleted
      }),

    forgetSlot(slotId) {
      stale = true
      if (own?.slotId === slotId) {
        own = null
        persistFingerprints()
      } else forgetOther(slotId)
      persistState()
    },

    forgetOwn() {
      if (!own) return
      own = null
      persistFingerprints()
      persistState()
    },

    reset() {
      clearMemory()
      loadedFor = null
      store((s) => s.clear())
    },

    cursor: () => cursor,

    liveConnecting(next) {
      connecting = next
      if (!next) return releaseLiveWaiters()
      if (!live) return
      live = null
      stale = true
      pending?.reject(new Error('live socket replaced'))
    },

    liveClosed() {
      live = null
      connecting = false
      stale = true
      pending?.reject(new Error('live socket closed'))
      releaseLiveWaiters()
    },

    liveMessage(message, send) {
      switch (message.type) {
        case 'hello':
          live = { send, subscribed: false, failed: false }
          connecting = false
          releaseLiveWaiters()
          void serialize(subscribe)
          return
        case 'changed':
          advanceOwn()
          if (typeof message.seq !== 'number' || message.seq > cursor)
            stale = true
          return
        case 'sync': {
          const parsed = parseSyncCatchUp(message)
          if (parsed) pending?.resolve(parsed)
          else pending?.reject(new Error('unreadable live catch-up'))
          return
        }
        case 'error':
          pending?.reject(
            message.error === 'changes_disabled'
              ? new HttpError('server', 503, 'changes_disabled')
              : new Error(`live catch-up refused: ${String(message.error)}`)
          )
          return
        case 'change': {
          const change = parseSyncChange(message.change)
          if (change) void serialize(() => applyLiveChange(change))
          else stale = true
        }
      }
    },

    stats: () => ({
      cursor,
      subscribed: live?.subscribed ?? false,
      stale,
      ownTail: own ? { count: own.tailCount, bytes: own.tailBytes } : null,
      slots: others.size,
    }),
  }
}
