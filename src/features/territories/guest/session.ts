import { toB64u } from '@/lib/bytes'
import {
  GUEST_LIMITS,
  type GuestSpacesClient,
  type SpacePutRecord,
  SpaceError,
  spaceErrorFrom,
} from '@/lib/sharedSpaces/client'
import {
  GUEST_BLOB_MAX_BYTES,
  guestKeysRecordId,
  inScopeRecordId,
  openRecordWithKey,
  scopeOfRecordId,
  sealRecordWithKey,
} from '@/lib/sharedSpaces/records'
import {
  deriveLinkCredentials,
  type GuestLink,
  sortedScopeIds,
} from '@/lib/sharedSpaces/scopes'
import {
  type GuestKeysData,
  guestData,
  readGuestKeys,
  type RecordData,
} from '@/features/territories/guest/codecs'
import {
  freshGuestLink,
  type GuestLinkStore,
  type LocalWrite,
  type StoredGuestLink,
} from '@/features/territories/guest/store'
import { clockOffset, nextStamp } from '@/features/territories/guest/timing'

export type GuestStatus =
  | 'loading'
  | 'ready'
  | 'offline'
  | 'invalid'
  | 'ended'
  | 'expired'
  | 'paused'
  | 'forgotten'

export type GuestWrite = {
  recordId: string
  kind: string
  data?: RecordData
  deleted?: boolean
}

export type GuestRecord = {
  recordId: string
  stamp: number
  deleted: boolean
  kind: string | null
  data: RecordData | null
}

export type GuestSessionState = {
  status: GuestStatus
  offline: boolean
  queued: number
  lost: number

  refused: number
  keys: GuestKeysData | null
  records: ReadonlyMap<string, GuestRecord>
  guest: { id: string; name: string } | null
  next: Readonly<Record<string, number>>
  firstRecordSent: boolean
}

export type GuestSessionDeps = {
  link: GuestLink
  client: GuestSpacesClient
  store: GuestLinkStore
  now: () => number
  randomBytes: (length: number) => Uint8Array
  randomUUID: () => string
}

const FINAL: readonly GuestStatus[] = [
  'invalid',
  'ended',
  'expired',
  'forgotten',
]

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  )

export function createGuestSession({
  link,
  client,
  store,
  now,
  randomBytes,
  randomUUID,
}: GuestSessionDeps) {
  const { linkToken, linkKey } = deriveLinkCredentials(link.linkSecret)
  const auth = { spaceId: link.spaceId, linkId: link.linkId, linkToken }
  const secret = toB64u(link.linkSecret)
  const keysRecordId = guestKeysRecordId(link.linkId)

  const loaded = store.load(link.linkId)
  let saved: StoredGuestLink =
    loaded && loaded.secret === secret && loaded.spaceId === link.spaceId
      ? loaded
      : freshGuestLink(link.spaceId, link.linkId, secret)

  const opened = new Map<string, GuestRecord>()
  const listeners = new Set<(state: GuestSessionState) => void>()
  let running: Promise<void> | null = null
  let again = false
  let blockedUntil = 0
  let state: GuestSessionState = {
    status: 'loading',
    offline: false,
    queued: 0,
    lost: 0,
    refused: 0,
    keys: null,
    records: new Map(),
    guest: null,
    next: saved.next,
    firstRecordSent: saved.firstRecordSent === true,
  }

  const corrected = () => now() + saved.clockOffset
  const isFinal = () => FINAL.includes(state.status)

  const emit = () => listeners.forEach((listener) => listener(state))

  const persist = () => {
    if (!isFinal()) store.save(saved)
  }

  function open(recordId: string, keys: GuestKeysData | null) {
    const synced = saved.records[recordId]
    if (!synced) return null
    const cacheKey = `${recordId}|${synced.seq}|${synced.stamp}`
    const cached = opened.get(cacheKey)
    if (cached) return cached
    const address = {
      spaceId: link.spaceId,
      epoch: synced.epoch,
      recordId,
      deleted: synced.deleted,
      stamp: synced.stamp,
    }
    const key =
      recordId === keysRecordId
        ? linkKey
        : keys?.scopes[scopeOfRecordId(recordId) ?? '']?.[synced.epoch]
    if (!key) return null
    let record: GuestRecord
    try {
      const plaintext = openRecordWithKey(key, address, synced.blob)
      record = {
        recordId,
        stamp: synced.stamp,
        deleted: synced.deleted,
        kind: plaintext.kind,
        data: plaintext.data ?? null,
      }
    } catch {
      record = {
        recordId,
        stamp: synced.stamp,
        deleted: synced.deleted,
        kind: null,
        data: null,
      }
    }
    opened.set(cacheKey, record)
    return record
  }

  function readKeys(): GuestKeysData | null {
    const record = open(keysRecordId, null)
    if (
      !record ||
      record.deleted ||
      record.kind !== 'guestKeys' ||
      !record.data
    )
      return null
    return readGuestKeys(record.data)
  }

  function recompute(status?: GuestStatus) {
    const keys = readKeys()
    const records = new Map<string, GuestRecord>()
    for (const recordId of Object.keys(saved.records)) {
      if (recordId === keysRecordId) continue
      const record = open(recordId, keys)
      if (record) records.set(recordId, record)
    }
    for (const write of Object.values(saved.local)) {
      const synced = records.get(write.recordId)
      if (synced && synced.stamp > write.stamp) continue
      records.set(write.recordId, {
        recordId: write.recordId,
        stamp: write.stamp,
        deleted: write.deleted,
        kind: write.kind,
        data: write.deleted ? null : (write.data ?? {}),
      })
    }
    state = {
      ...state,
      status: status ?? state.status,
      keys,
      records,
      queued: Object.values(saved.local).filter((write) => !write.sent).length,
      guest:
        saved.guestId && saved.name
          ? { id: saved.guestId, name: saved.name }
          : null,
      next: saved.next,
      firstRecordSent: saved.firstRecordSent === true,
    }
    emit()
  }

  function finish(status: GuestStatus) {
    const lost = Object.values(saved.local).filter(
      (write) => !write.sent
    ).length
    store.remove(link.linkId)
    opened.clear()
    saved = freshGuestLink(link.spaceId, link.linkId, secret)
    state = {
      ...state,
      status,
      offline: false,
      queued: 0,
      lost: status === 'ended' || status === 'expired' ? lost : 0,
      keys: null,
      records: new Map(),
      guest: null,
      next: {},
    }
    emit()
  }

  function observe(serverTime: number | null) {
    saved.clockOffset = clockOffset(serverTime, now(), saved.clockOffset)
  }

  function expiredNow() {
    return saved.expiresAt !== undefined && corrected() >= saved.expiresAt
  }

  async function pull() {
    let since = saved.cursor
    for (;;) {
      const page = await client.guestSync(auth, { since })
      observe(page.serverTime)
      for (const record of page.records)
        saved.records[record.recordId] = {
          epoch: record.epoch,
          stamp: record.stamp,
          deleted: record.deleted,
          blob: record.blob,
          seq: record.seq,
        }
      saved.epoch = page.epoch
      saved.expiresAt = page.expiresAt
      since = page.cursor
      if (!page.more) break
    }
    saved.cursor = since
    for (const write of Object.values(saved.local)) {
      const synced = saved.records[write.recordId]
      if (write.sent && synced && synced.stamp >= write.stamp)
        delete saved.local[write.recordId]
    }
    persist()
    recompute(readKeys() ? 'ready' : 'invalid')
  }

  function seal(write: LocalWrite, keys: GuestKeysData): SpacePutRecord | null {
    const scopeId = scopeOfRecordId(write.recordId)
    const key = scopeId ? keys.scopes[scopeId]?.[saved.epoch] : undefined
    if (!key) return null
    const address = {
      spaceId: link.spaceId,
      epoch: saved.epoch,
      recordId: write.recordId,
      deleted: write.deleted,
      stamp: write.stamp,
    }
    return {
      recordId: write.recordId,
      epoch: saved.epoch,
      stamp: write.stamp,
      deleted: write.deleted,
      blob: sealRecordWithKey(
        key,
        address,
        write.deleted
          ? { kind: write.kind }
          : { kind: write.kind, data: write.data ?? {} },
        randomBytes(24),
        GUEST_BLOB_MAX_BYTES
      ),
    }
  }

  function drop(recordIds: string[], refused: boolean) {
    for (const recordId of recordIds) delete saved.local[recordId]
    if (refused) state = { ...state, refused: state.refused + recordIds.length }
  }

  async function putBatch(batch: SpacePutRecord[]): Promise<'ok' | 'stale'> {
    try {
      const result = await client.guestPut(auth, batch)
      observe(result.serverTime)
      for (const { recordId, stored } of result.results) {
        const write = saved.local[recordId]
        if (!write) continue
        if (stored) write.sent = true
        else delete saved.local[recordId]
      }
      return 'ok'
    } catch (error) {
      const failure = spaceErrorFrom(error)
      if (failure.code === 'stale_key') return 'stale'
      if (failure.code === 'forbidden') {
        const scopes = new Set(batch.map((r) => scopeOfRecordId(r.recordId)))
        if (scopes.size > 1) {
          for (const scopeId of scopes) {
            const part = batch.filter(
              (r) => scopeOfRecordId(r.recordId) === scopeId
            )
            if ((await putBatch(part)) === 'stale') return 'stale'
          }
          return 'ok'
        }
        drop(
          batch.map((r) => r.recordId),
          true
        )
        return 'ok'
      }
      if (failure.code === 'too_large' || failure.code === 'bad_request') {
        drop(
          batch.map((r) => r.recordId),
          true
        )
        return 'ok'
      }
      throw failure
    }
  }

  async function push(): Promise<boolean> {
    let refreshed = false
    for (;;) {
      const keys = readKeys()
      const pending = Object.values(saved.local).filter((write) => !write.sent)
      if (!keys || pending.length === 0) return false
      const sealed: SpacePutRecord[] = []
      for (const write of pending) {
        try {
          const record = seal(write, keys)
          if (record) sealed.push(record)
        } catch {
          drop([write.recordId], true)
        }
      }
      if (sealed.length === 0) {
        persist()
        recompute()
        return false
      }
      let stale = false
      for (const batch of chunks(sealed, GUEST_LIMITS.putRecords)) {
        if ((await putBatch(batch)) === 'stale') {
          stale = true
          break
        }
      }
      persist()
      recompute()
      if (!stale) return true
      if (refreshed) return false
      refreshed = true
      await pull()
    }
  }

  function fail(error: unknown) {
    const failure = error instanceof SpaceError ? error : spaceErrorFrom(error)
    switch (failure.code) {
      case 'not_found':
        return finish('invalid')
      case 'gone':
        return finish(failure.reason === 'expired' ? 'expired' : 'ended')
      case 'disabled':
        blockedUntil = now() + (failure.retryAfterMs ?? 60_000)
        state = { ...state, status: 'paused' }
        return emit()
      case 'rate_limited':
        blockedUntil = now() + (failure.retryAfterMs ?? 60_000)
        return
      default:
        state = {
          ...state,
          offline: true,
          status: state.keys ? state.status : 'offline',
        }
        return emit()
    }
  }

  async function run() {
    do {
      again = false
      if (isFinal()) return
      if (expiredNow()) return finish('expired')
      if (now() < blockedUntil) return
      try {
        await pull()
        if ((await push()) && !isFinal()) await pull()
        if (state.offline) {
          state = { ...state, offline: false }
          emit()
        }
      } catch (error) {
        fail(error)
        return
      }
    } while (again)
  }

  function sync(): Promise<void> {
    if (running) {
      again = true
      return running
    }
    running = run().finally(() => {
      running = null
    })
    return running
  }

  function write(writes: GuestWrite[]) {
    if (isFinal() || writes.length === 0) return
    const at = corrected()
    for (const entry of writes) {
      const previous = [
        saved.records[entry.recordId]?.stamp,
        saved.local[entry.recordId]?.stamp,
      ].filter((stamp): stamp is number => stamp !== undefined)
      saved.local[entry.recordId] = {
        recordId: entry.recordId,
        kind: entry.kind,
        data: entry.deleted ? undefined : entry.data,
        deleted: entry.deleted === true,
        stamp: nextStamp(at, ...previous),
        sent: false,
      }
    }
    persist()
    recompute()
    void sync()
  }

  if (readKeys() && !expiredNow()) recompute('ready')

  return {
    getState: () => state,

    subscribe(listener: (state: GuestSessionState) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    start() {
      store.setCurrent(link.linkId)
      store.sweep(corrected(), link.linkId)
      if (expiredNow()) {
        finish('expired')
        return Promise.resolve()
      }
      persist()
      recompute(readKeys() ? 'ready' : 'loading')
      return sync()
    },

    sync,

    write,

    corrected,

    checkExpiry() {
      if (!isFinal() && expiredNow()) finish('expired')
    },

    expiresAt: () => saved.expiresAt,

    setName(name: string) {
      const keys = state.keys
      const trimmed = name.trim()
      if (!keys || !trimmed || isFinal()) return
      const [scopeId] = sortedScopeIds(Object.keys(keys.scopes))
      if (!scopeId) return
      const guestId = saved.guestId ?? randomUUID().toLowerCase()
      const recordId = inScopeRecordId(scopeId, guestId)
      saved.guestId = guestId
      saved.name = trimmed
      saved.joinedAt = saved.joinedAt ?? Math.round(corrected())
      write([
        {
          recordId,
          kind: 'guest',
          data: guestData(
            { name: trimmed, linkId: link.linkId, joinedAt: saved.joinedAt },
            state.records.get(recordId)?.data ?? undefined
          ),
        },
      ])
    },

    setNext(streetId: string, next: number) {
      if (saved.next[streetId] === next || isFinal()) return
      saved.next = { ...saved.next, [streetId]: next }
      persist()
      recompute()
    },

    markFirstRecord() {
      if (saved.firstRecordSent) return false
      saved.firstRecordSent = true
      persist()
      recompute()
      return true
    },

    clearRefused() {
      if (state.refused === 0) return
      state = { ...state, refused: 0 }
      emit()
    },

    forget() {
      finish('forgotten')
    },
  }
}

export type GuestSession = ReturnType<typeof createGuestSession>
