import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'
import {
  type BackupPlaintext,
  deriveBackupKey,
  openBackup,
  sealBackup,
} from '@/lib/serverAccount/backupCrypto'
import {
  getSyncSlot,
  listSyncSlots,
  putSyncSlot,
} from '@/lib/syncTransport/server/syncClient'
import {
  deriveSyncKey,
  openSyncBlob,
  sealSyncBlob,
} from '@/lib/syncTransport/server/syncCrypto'
import { createFakeSyncServer } from '@/lib/syncTransport/server/__tests__/fakeSyncServer'
import { createResealStep, type ResealStepDeps } from './reseal'
import type { KeyChangeStepContext } from './steps'

vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const ACCOUNT = 'A'.repeat(22)
const K0 = new Uint8Array(32).fill(7)
const K1 = new Uint8Array(32).fill(1)
const K2 = new Uint8Array(32).fill(2)
const OWN = 'own-slot-aaaa'
const TABLET = 'tablet-slot-bb'
const LAPTOP = 'laptop-slot-cc'
const BEARER = 'family'

let nonce = 0
const randomBytes = (length: number) =>
  new Uint8Array(length).fill(++nonce % 255)

const plaintext = (deviceName: string): BackupPlaintext => ({
  v: 1,
  deviceName,
  platform: 'ios',
  createdAt: 1_760_000_000_000,
  payload: { version: 1, contactStore: { contacts: [{ id: deviceName }] } },
})

const sealSync = (key: Uint8Array, slotId: string, name = slotId) =>
  sealSyncBlob(
    deriveSyncKey(key),
    plaintext(name),
    { accountId: ACCOUNT, slotId },
    randomBytes(24)
  )

const openSync = (key: Uint8Array, slotId: string, blob: Uint8Array | null) =>
  openSyncBlob(deriveSyncKey(key), blob!, { accountId: ACCOUNT, slotId })
    .deviceName

const sealBackupSlot = (key: Uint8Array, slotId: string, name = slotId) =>
  sealBackup(
    deriveBackupKey(key),
    plaintext(name),
    { accountId: ACCOUNT, slotId },
    randomBytes(24)
  )

const openBackupSlot = (key: Uint8Array, slotId: string, blob: Uint8Array) =>
  openBackup(deriveBackupKey(key), blob, { accountId: ACCOUNT, slotId })
    .deviceName

/** R2's etag of a slot's bytes: opaque to the app. */
const etagOf = (bytes: Uint8Array) => toB64u(sha256(bytes)).slice(0, 32)

/**
 * Ww-api's backup slots: one put a slot a minute, checked before `If-Match`,
 * which must name the bytes the slot holds.
 */
function fakeBackups() {
  const slots = new Map<string, { bytes: Uint8Array; uploadedAt: number }>()
  const state = {
    now: 1_000_000,
    gets: [] as string[],
    puts: [] as string[],
    /** Each put's `If-Match`. */
    ifMatches: [] as string[],
    /** Runs between a slot's read and its put (this device backing up). */
    beforePut: null as ((slotId: string) => void) | null,
    /** The next put is refused with this. */
    refusePut: null as Error | null,
  }
  return {
    state,
    slots,
    api: {
      list: async () =>
        [...slots].map(([slotId, slot]) => ({
          slotId,
          uploadedAt: slot.uploadedAt,
        })),
      get: async (slotId: string) => {
        state.gets.push(slotId)
        const slot = slots.get(slotId)
        if (!slot) throw new HttpError('client', 404, 'not_found')
        const bytes = slot.bytes
        const hook = state.beforePut
        state.beforePut = null
        hook?.(slotId)
        return { blob: bytes, etag: etagOf(bytes) }
      },
      put: async (
        slotId: string,
        bytes: Uint8Array,
        { ifMatch }: { ifMatch: string }
      ) => {
        if (state.refusePut) {
          const error = state.refusePut
          state.refusePut = null
          throw error
        }
        state.ifMatches.push(ifMatch)
        const existing = slots.get(slotId)
        const wait = existing ? existing.uploadedAt + 60_000 - state.now : 0
        if (wait > 0)
          throw new HttpError('rateLimited', 429, 'rate_limited', wait)
        if (!existing || etagOf(existing.bytes) !== ifMatch)
          throw new HttpError('client', 412, 'precondition_failed')
        state.puts.push(slotId)
        slots.set(slotId, { bytes, uploadedAt: state.now })
      },
    },
  }
}

function setup(overrides: Partial<ResealStepDeps> = {}) {
  const server = createFakeSyncServer()
  server.state.supporters.add(BEARER)
  const backups = fakeBackups()
  const sleep = vi.fn(async (ms: number) => {
    backups.state.now += ms
  })
  const options = {
    baseUrl: 'https://api.test',
    authorize: <T>(run: (authorization: string) => Promise<T>) =>
      run(`Bearer ${BEARER}`),
    fetchImpl: server.fetch,
  }
  const sessionKeys: Uint8Array[] = []
  const step = createResealStep({
    sync: (accountKey) => {
      sessionKeys.push(accountKey)
      return {
        list: async () => (await listSyncSlots(options)).slots,
        get: (slotId) => getSyncSlot(options, slotId),
        put: async (slotId, blob, put) => {
          await putSyncSlot(options, slotId, blob, put)
        },
      }
    },
    backup: (accountKey) => {
      sessionKeys.push(accountKey)
      return backups.api
    },
    ownSyncSlotId: () => OWN,
    olderKeys: async (_accountId, kind) => [
      kind === 'sync' ? deriveSyncKey(K0) : deriveBackupKey(K0),
    ],
    randomBytes,
    sleep,
    ...overrides,
  })
  let record: KeyChangeRecord = {
    v: 1,
    accountId: ACCOUNT,
    oldKey: 'k1',
    newKey: 'k2',
    oldKeyEpoch: 1,
    stage: 'stored',
    startedAt: 1,
  }
  const saved: NonNullable<KeyChangeRecord['reseal']>[] = []
  const run = () => {
    const context: KeyChangeStepContext = {
      oldKey: K1,
      newKey: K2,
      accountId: ACCOUNT,
      record,
      save: async (reseal) => {
        saved.push(reseal)
        record = { ...record, reseal }
      },
    }
    return step(context)
  }
  const syncGets = () =>
    server.state.log.filter((entry) => entry === 'POST sync/get').length
  return {
    server,
    backups,
    sleep,
    run,
    saved,
    sessionKeys,
    syncGets,
    record: () => record,
    setRecord: (next: KeyChangeRecord) => {
      record = next
    },
  }
}

describe('the re-seal step', () => {
  it('re-seals every Cloud Sync slot under the new key, other devices’ too', async () => {
    const { server, run, record, sessionKeys } = setup()
    server.seed(BEARER, OWN, sealSync(K1, OWN))
    server.seed(BEARER, TABLET, sealSync(K1, TABLET))
    const tabletTime = server.slotUpdatedAt(BEARER, TABLET)

    await run()

    expect(openSync(K2, OWN, server.slotBytes(BEARER, OWN))).toBe(OWN)
    expect(openSync(K2, TABLET, server.slotBytes(BEARER, TABLET))).toBe(TABLET)
    // Another device's slot keeps its time (`x-ww-reseal`); the fake refuses
    // a re-seal without a quoted ETag.
    expect(server.slotUpdatedAt(BEARER, TABLET)).toBe(tabletTime)
    expect(record().reseal?.syncSlots.sort()).toEqual([OWN, TABLET].sort())
    // Every call runs as the new key's session.
    expect(sessionKeys.every((key) => key === K2)).toBe(true)
  })

  it('opens a slot an older key sealed through the key history', async () => {
    const { server, run } = setup()
    server.seed(BEARER, LAPTOP, sealSync(K0, LAPTOP))
    await run()
    expect(openSync(K2, LAPTOP, server.slotBytes(BEARER, LAPTOP))).toBe(LAPTOP)
  })

  it('leaves a slot that doesn’t open, and one already under the new key', async () => {
    const { server, run, record } = setup()
    const foreign = sealSync(new Uint8Array(32).fill(9), TABLET)
    const current = sealSync(K2, OWN)
    server.seed(BEARER, TABLET, foreign)
    server.seed(BEARER, OWN, current)
    await run()
    expect(server.slotBytes(BEARER, TABLET)).toEqual(foreign)
    expect(server.slotBytes(BEARER, OWN)).toEqual(current)
    expect(server.state.log).not.toContain('POST sync/put')
    expect(record().reseal?.syncSlots.sort()).toEqual([OWN, TABLET].sort())
  })

  it('re-reads a slot written since it was read, and re-seals the newer bytes', async () => {
    const { server, run } = setup()
    server.seed(BEARER, TABLET, sealSync(K1, TABLET, 'older'))
    let wrote = false
    server.state.beforePut = (slotId) => {
      if (wrote) return
      wrote = true
      server.seed(BEARER, slotId, sealSync(K1, slotId, 'newer'))
    }
    await run()
    expect(openSync(K2, TABLET, server.slotBytes(BEARER, TABLET))).toBe('newer')
  })

  it('waits out a slot put too soon after its last, then reads it again', async () => {
    const { server, run, sleep, syncGets } = setup()
    server.seed(BEARER, TABLET, sealSync(K1, TABLET))
    server.state.rateLimitedPuts = 1
    await run()
    expect(sleep).toHaveBeenCalledWith(2_000)
    expect(syncGets()).toBe(2)
    expect(openSync(K2, TABLET, server.slotBytes(BEARER, TABLET))).toBe(TABLET)
  })

  it('stops when the account is over its daily puts', async () => {
    const { run, record } = setup({
      sync: () => ({
        list: async () => [{ slotId: TABLET, etag: 'etag' }],
        get: async () => sealSync(K1, TABLET),
        put: async () => {
          throw new HttpError('rateLimited', 429, 'rate_limited', 3_600_000)
        },
      }),
    })
    await expect(run()).rejects.toThrow('rate_limited')
    expect(record().reseal).toBeUndefined()
  })

  it('skips a slot deleted since it was listed, without creating it', async () => {
    const { server, run, record } = setup()
    server.seed(BEARER, TABLET, sealSync(K1, TABLET))
    server.seed(BEARER, LAPTOP, sealSync(K1, LAPTOP))
    server.state.beforePut = (slotId) => {
      if (slotId === TABLET)
        void server.fetch('https://api.test/accounts/v1/sync/delete', {
          method: 'POST',
          headers: { authorization: `Bearer ${BEARER}` },
          body: JSON.stringify({ slotId: TABLET }),
        })
    }
    await run()
    expect(server.slotIds(BEARER)).toEqual([LAPTOP])
    expect(openSync(K2, LAPTOP, server.slotBytes(BEARER, LAPTOP))).toBe(LAPTOP)
    expect(record().reseal?.syncSlots.sort()).toEqual([LAPTOP, TABLET].sort())
  })

  it('leaves other devices’ slots once the server refuses re-seals (past 7 days)', async () => {
    const { server, run } = setup()
    const tablet = sealSync(K1, TABLET)
    server.seed(BEARER, TABLET, tablet)
    server.seed(BEARER, OWN, sealSync(K1, OWN))
    server.state.resealForbidden = true
    await run()
    expect(server.slotBytes(BEARER, TABLET)).toEqual(tablet)
    // This device's own slot is a normal put.
    expect(openSync(K2, OWN, server.slotBytes(BEARER, OWN))).toBe(OWN)
  })

  it('goes on to backups when the account can’t use Cloud Sync', async () => {
    const { server, backups, run } = setup()
    server.state.supporters.clear()
    backups.slots.set('backup-one', {
      bytes: sealBackupSlot(K1, 'backup-one'),
      uploadedAt: 0,
    })
    await run()
    expect(
      openBackupSlot(K2, 'backup-one', backups.slots.get('backup-one')!.bytes)
    ).toBe('backup-one')
  })

  it('re-seals every backup slot, waiting out the one-put-a-minute limit', async () => {
    const { backups, run, record, sleep } = setup()
    backups.slots.set('backup-own', {
      bytes: sealBackupSlot(K1, 'backup-own'),
      // Step 0 just backed up.
      uploadedAt: backups.state.now - 10_000,
    })
    backups.slots.set('backup-old', {
      bytes: sealBackupSlot(K0, 'backup-old'),
      uploadedAt: 0,
    })
    await run()
    for (const slotId of ['backup-own', 'backup-old'])
      expect(openBackupSlot(K2, slotId, backups.slots.get(slotId)!.bytes)).toBe(
        slotId
      )
    expect(sleep).toHaveBeenCalledWith(50_000)
    // Read again after waiting, in case it changed meanwhile.
    expect(backups.state.gets.filter((id) => id === 'backup-own')).toHaveLength(
      2
    )
    expect(record().reseal?.backupSlots.sort()).toEqual([
      'backup-old',
      'backup-own',
    ])
  })

  it('doesn’t put a backup slot that’s already under the new key', async () => {
    const { backups, run } = setup()
    backups.slots.set('backup-own', {
      bytes: sealBackupSlot(K2, 'backup-own'),
      uploadedAt: 0,
    })
    await run()
    expect(backups.state.puts).toEqual([])
  })

  it('stops on a failure, and resumes after what it finished', async () => {
    const { server, backups, run, record, syncGets } = setup()
    server.seed(BEARER, OWN, sealSync(K1, OWN))
    server.seed(BEARER, TABLET, sealSync(K1, TABLET))
    backups.slots.set('backup-a', {
      bytes: sealBackupSlot(K1, 'backup-a'),
      uploadedAt: 0,
    })
    backups.slots.set('backup-b', {
      bytes: sealBackupSlot(K1, 'backup-b'),
      uploadedAt: 0,
    })
    let puts = 0
    const put = backups.api.put
    backups.api.put = async (slotId, bytes, options) => {
      if (++puts === 2) throw new HttpError('offline')
      return put(slotId, bytes, options)
    }
    await expect(run()).rejects.toThrow('offline')
    const stopped = record().reseal!
    expect(stopped.syncSlots.sort()).toEqual([OWN, TABLET].sort())
    expect(stopped.backupSlots).toHaveLength(1)

    const getsBefore = syncGets()
    const backupGetsBefore = backups.state.gets.length
    await run()
    // Nothing finished is read again.
    expect(syncGets()).toBe(getsBefore)
    expect(backups.state.gets.length).toBe(backupGetsBefore + 1)
    expect(record().reseal?.backupSlots.sort()).toEqual([
      'backup-a',
      'backup-b',
    ])
    for (const slotId of ['backup-a', 'backup-b'])
      expect(openBackupSlot(K2, slotId, backups.slots.get(slotId)!.bytes)).toBe(
        slotId
      )
  })

  it('stops when a slot can’t be read (offline)', async () => {
    const { run, record } = setup({
      sync: () => ({
        list: async () => [{ slotId: TABLET, etag: 'etag' }],
        get: async () => {
          throw new HttpError('offline')
        },
        put: async () => undefined,
      }),
    })
    await expect(run()).rejects.toThrow('offline')
    expect(record().reseal).toBeUndefined()
  })

  it('waits a little at a time while another put of the slot is in flight', async () => {
    const { server, run, sleep, syncGets } = setup()
    server.seed(BEARER, OWN, sealSync(K1, OWN))
    // This device's own push, started by step 4, holds the slot for up to
    // the server's 2-minute reservation.
    server.state.rateLimitedPuts = 2
    server.state.putRetryAfterSec = 120
    await run()
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(3_000)
    expect(syncGets()).toBe(3)
    expect(openSync(K2, OWN, server.slotBytes(BEARER, OWN))).toBe(OWN)
  })

  it('stops downloading other devices’ slots once re-seals are refused', async () => {
    const { server, run, record, syncGets } = setup()
    server.seed(BEARER, TABLET, sealSync(K1, TABLET))
    server.seed(BEARER, LAPTOP, sealSync(K1, LAPTOP))
    server.seed(BEARER, OWN, sealSync(K1, OWN))
    server.state.resealForbidden = true
    await run()
    // One other device's slot learns it; the next isn't fetched. This
    // device's own slot is a normal put.
    expect(syncGets()).toBe(2)
    expect(openSync(K2, OWN, server.slotBytes(BEARER, OWN))).toBe(OWN)
    expect(record().reseal?.syncSlots.sort()).toEqual(
      [LAPTOP, OWN, TABLET].sort()
    )
  })

  it('doesn’t record a slot it can’t open when the key history couldn’t be read', async () => {
    const { server, run, record } = setup({ olderKeys: async () => null })
    server.seed(BEARER, TABLET, sealSync(K1, TABLET))
    server.seed(BEARER, LAPTOP, sealSync(K0, LAPTOP))
    await expect(run()).rejects.toThrow(/key history/)
    // What K1 opened is done; the slot only the history opens waits.
    expect(record().reseal?.syncSlots).toEqual([TABLET])
  })

  it('puts each backup slot only over the bytes it read', async () => {
    const { backups, run } = setup()
    const bytes = sealBackupSlot(K1, 'backup-own')
    backups.slots.set('backup-own', { bytes, uploadedAt: 0 })
    await run()
    expect(backups.state.ifMatches).toEqual([etagOf(bytes)])
  })

  it('reads a backup slot again when its put meets a 412', async () => {
    const { backups, run, record } = setup()
    backups.slots.set('backup-own', {
      bytes: sealBackupSlot(K1, 'backup-own', 'older'),
      uploadedAt: 0,
    })
    // Written between the read and the put, over a minute after its last.
    let wrote = false
    backups.state.beforePut = (slotId) => {
      if (wrote) return
      wrote = true
      backups.slots.set(slotId, {
        bytes: sealBackupSlot(K1, slotId, 'newer'),
        uploadedAt: backups.state.now - 61_000,
      })
    }
    // The listing is read once, not before each put.
    const list = vi.spyOn(backups.api, 'list')
    await run()
    expect(list).toHaveBeenCalledTimes(1)
    expect(backups.state.gets).toEqual(['backup-own', 'backup-own'])
    expect(
      openBackupSlot(K2, 'backup-own', backups.slots.get('backup-own')!.bytes)
    ).toBe('newer')
    expect(record().reseal?.backupSlots).toEqual(['backup-own'])
  })

  it('doesn’t put a backup slot deleted after it was read', async () => {
    const { backups, run, record } = setup()
    backups.slots.set('backup-gone', {
      bytes: sealBackupSlot(K1, 'backup-gone'),
      uploadedAt: 0,
    })
    backups.state.beforePut = (slotId) => backups.slots.delete(slotId)
    await run()
    expect(backups.slots.has('backup-gone')).toBe(false)
    expect(record().reseal?.backupSlots).toEqual(['backup-gone'])
  })

  it('reads a backup slot again when it was uploaded after it was read', async () => {
    const { backups, run, sleep } = setup()
    backups.slots.set('backup-own', {
      bytes: sealBackupSlot(K1, 'backup-own', 'older'),
      uploadedAt: 0,
    })
    backups.state.beforePut = (slotId) =>
      backups.slots.set(slotId, {
        bytes: sealBackupSlot(K1, slotId, 'newer'),
        uploadedAt: backups.state.now - 61_000,
      })
    await run()
    expect(sleep).not.toHaveBeenCalled()
    expect(
      openBackupSlot(K2, 'backup-own', backups.slots.get('backup-own')!.bytes)
    ).toBe('newer')
  })

  it('leaves backups when the server turns backup off mid-way', async () => {
    const { backups, run, record } = setup()
    backups.slots.set('backup-a', {
      bytes: sealBackupSlot(K1, 'backup-a'),
      uploadedAt: 0,
    })
    backups.state.refusePut = new HttpError('server', 503, 'disabled')
    await run()
    expect(record().reseal?.backupSlots ?? []).toEqual([])
  })

  it('keeps the photos it already listed', async () => {
    const { server, run, record, setRecord } = setup()
    server.seed(BEARER, TABLET, sealSync(K1, TABLET))
    setRecord({
      ...record(),
      reseal: { syncSlots: [], photos: ['photo-a'], backupSlots: [] },
    })
    await run()
    expect(record().reseal?.photos).toEqual(['photo-a'])
  })
})
