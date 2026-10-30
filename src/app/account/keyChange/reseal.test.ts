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
import {
  derivePhotoKeys,
  openPhoto,
  openPhotoMeta,
  photoName,
  sealPhoto,
  sealPhotoMeta,
} from '@/lib/syncTransport/server/photoCrypto'
import {
  createFakeSyncServer,
  type FakeSyncServer,
} from '@/lib/syncTransport/server/__tests__/fakeSyncServer'
import {
  createPhotoResealRetry,
  createResealStep,
  resealPhotoApi,
  type ResealStepDeps,
} from './reseal'
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

const CONTACT = 'witness-work-img-contact-c1--r1.jpg'
const PROFILE = 'witness-work-img-profile--r1.jpg'
const NOTE = 'witness-work-note-note0001.jpg'

const photoFile = (size: number, fill: number) =>
  new Uint8Array(size).fill(fill)

/** Puts a photo as a device holding `key` would have. */
async function seedPhoto(
  server: FakeSyncServer,
  key: Uint8Array,
  filename: string,
  bytes: Uint8Array
): Promise<string> {
  const { photoKey, nameKey } = derivePhotoKeys(key)
  const name = photoName(nameKey, filename)
  const address = { accountId: ACCOUNT, name }
  const blob = await sealPhoto(photoKey, bytes, address, randomBytes(24))
  server.putPhoto(BEARER, name, {
    bytes: blob,
    sha256: toB64u(sha256(blob)),
    createdAt: 1,
    meta: sealPhotoMeta(photoKey, filename, address, randomBytes(24)),
  })
  return name
}

/** The photo `key`'s name for `filename` holds, opened with `key`. */
async function photoUnder(
  server: FakeSyncServer,
  key: Uint8Array,
  filename: string
): Promise<Uint8Array | null> {
  const { photoKey, nameKey } = derivePhotoKeys(key)
  const name = photoName(nameKey, filename)
  const address = { accountId: ACCOUNT, name }
  const blob = server.photoBytes(BEARER, name)
  if (!blob) return null
  const listed = await resealPhotoApi(optionsFor(server), () => null).list()
  const meta = listed.photos.find((photo) => photo.name === name)!.meta
  expect(openPhotoMeta(photoKey, meta, address, nameKey)).toBe(filename)
  return openPhoto(photoKey, blob, address)
}

const optionsFor = (server: FakeSyncServer) => ({
  baseUrl: 'https://api.test',
  authorize: <T>(run: (authorization: string) => Promise<T>) =>
    run(`Bearer ${BEARER}`),
  fetchImpl: server.fetch,
})

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
  const options = optionsFor(server)
  const sessionKeys: Uint8Array[] = []
  const photosLeft = { accountId: null as string | null }
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
    photos: (accountKey) => {
      sessionKeys.push(accountKey)
      return resealPhotoApi(options, () => OWN)
    },
    ownSyncSlotId: () => OWN,
    olderKeys: async (_accountId, kind) => [
      kind === 'sync' ? deriveSyncKey(K0) : deriveBackupKey(K0),
    ],
    olderPhotoKeys: async () => [derivePhotoKeys(K0)],
    photosLeft: {
      get: () => photosLeft.accountId,
      set: (accountId) => {
        photosLeft.accountId = accountId
      },
    },
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
    photosLeft,
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

describe('the re-seal step, for Cloud Sync photos', () => {
  /** Photos are there for Cloud Sync's devices: the account has a slot. */
  const withPhotos = (overrides: Partial<ResealStepDeps> = {}) => {
    const context = setup(overrides)
    context.server.seed(BEARER, OWN, sealSync(K1, OWN))
    return context
  }
  const photoOps = (server: FakeSyncServer) =>
    server.state.photoWrites.map(({ op }) => op)
  const photoGets = (server: FakeSyncServer) =>
    server.state.log.filter((entry) => entry === 'POST sync/photos/get').length

  it('moves every photo to the new key’s name, then deletes the old', async () => {
    const { server, run, record, photosLeft, sessionKeys } = withPhotos()
    const contact = await seedPhoto(server, K1, CONTACT, photoFile(300, 3))
    // An older key's, through the key history.
    const note = await seedPhoto(server, K0, NOTE, photoFile(200, 4))

    await run()

    expect(server.photoNames(BEARER)).toEqual(
      [
        photoName(derivePhotoKeys(K2).nameKey, CONTACT),
        photoName(derivePhotoKeys(K2).nameKey, NOTE),
      ].sort()
    )
    expect(await photoUnder(server, K2, CONTACT)).toEqual(photoFile(300, 3))
    expect(await photoUnder(server, K2, NOTE)).toEqual(photoFile(200, 4))
    // Each new one live before its old name goes.
    expect(photoOps(server)).toEqual(['put', 'delete', 'put', 'delete'])
    // The listing shows they've moved: the record keeps no list of them.
    expect(record().reseal?.photos ?? []).toEqual([])
    expect([contact, note]).not.toContain(server.photoNames(BEARER)[0])
    expect(photosLeft.accountId).toBeNull()
    expect(sessionKeys.every((key) => key === K2)).toBe(true)
  })

  it('leaves photos already under the new key', async () => {
    const { server, run } = withPhotos()
    const name = await seedPhoto(server, K2, CONTACT, photoFile(100, 1))
    const before = server.photoBytes(BEARER, name)
    await run()
    expect(server.photoBytes(BEARER, name)).toBe(before)
    expect(photoOps(server)).toEqual([])
    expect(photoGets(server)).toBe(0)
  })

  it('only deletes the old name when the new one is already there', async () => {
    const { server, run } = withPhotos()
    // A try that put the new one, then stopped before the delete.
    const old = await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    const name = await seedPhoto(server, K2, CONTACT, photoFile(100, 1))
    const before = server.photoBytes(BEARER, name)
    await run()
    expect(server.photoNames(BEARER)).toEqual([name])
    expect(server.photoBytes(BEARER, name)).toBe(before)
    expect(photoOps(server)).toEqual(['delete'])
    expect(photoGets(server)).toBe(0)
    expect(server.photoNames(BEARER)).not.toContain(old)
  })

  it('skips the damaged photos the record lists', async () => {
    const { server, run, record, setRecord } = withPhotos()
    const done = await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    await seedPhoto(server, K1, NOTE, photoFile(100, 2))
    setRecord({
      ...record(),
      reseal: { syncSlots: [], photos: [done], backupSlots: [] },
    })
    await run()
    expect(server.photoNames(BEARER)).toContain(done)
    expect(await photoUnder(server, K2, NOTE)).toEqual(photoFile(100, 2))
  })

  it('leaves a photo that doesn’t fit under the old key, and moves the rest', async () => {
    const { server, backups, run, photosLeft } = withPhotos()
    const big = await seedPhoto(server, K1, PROFILE, photoFile(5_000, 9))
    await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    backups.slots.set('backup-own', {
      bytes: sealBackupSlot(K1, 'backup-own'),
      uploadedAt: 0,
    })
    // Room for the small one's new copy, not the big one's.
    server.state.photoLimitBytes = server.photoUsage(BEARER).bytes + 1_000

    await run()

    expect(server.photoNames(BEARER)).toContain(big)
    expect(await photoUnder(server, K2, CONTACT)).toEqual(photoFile(100, 1))
    // Known not to fit from the listing: not downloaded.
    expect(photoGets(server)).toBe(1)
    expect(photosLeft.accountId).toBe(ACCOUNT)
    // Photos never hold up the rest of the change.
    expect(
      openBackupSlot(K2, 'backup-own', backups.slots.get('backup-own')!.bytes)
    ).toBe('backup-own')
  })

  it('leaves a photo the server says is over storage, and goes on', async () => {
    const { server, run, photosLeft } = withPhotos()
    await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    await seedPhoto(server, K1, NOTE, photoFile(100, 2))
    server.state.photoFailure = {
      code: 'storage_full',
      status: 429,
      op: 'sync/photos/put',
    }
    await run()
    expect(photoOps(server)).toEqual(['put', 'delete'])
    expect(server.photoNames(BEARER)).toHaveLength(2)
    expect(photosLeft.accountId).toBe(ACCOUNT)
  })

  it.each([
    ['limit', 429],
    ['rate_limited', 429],
    ['photos_disabled', 503],
    ['no_slot', 409],
  ])(
    'stops the photos for a later launch on %s, and the change goes on',
    async (code, status) => {
      const { server, backups, run, photosLeft, record } = withPhotos()
      const contact = await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
      const note = await seedPhoto(server, K1, NOTE, photoFile(100, 2))
      backups.slots.set('backup-own', {
        bytes: sealBackupSlot(K1, 'backup-own'),
        uploadedAt: 0,
      })
      server.state.photoFailure = { code, status, op: 'sync/photos/put' }

      await expect(run()).resolves.toBeUndefined()

      expect(server.photoNames(BEARER)).toEqual([contact, note].sort())
      expect(photoOps(server)).toEqual([])
      expect(photosLeft.accountId).toBe(ACCOUNT)
      expect(record().reseal?.photos ?? []).toEqual([])
      expect(record().reseal?.backupSlots).toEqual(['backup-own'])
    }
  )

  it('leaves the photos for later when they can’t be listed', async () => {
    const { server, run, photosLeft } = withPhotos()
    await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    server.state.photoFailure = {
      code: 'bad_request',
      status: 400,
      op: 'sync/photos/list',
    }
    await expect(run()).resolves.toBeUndefined()
    expect(photosLeft.accountId).toBe(ACCOUNT)
  })

  it('notes nothing for an account that isn’t a Supporter, and keeps an earlier note', async () => {
    const { server, run, photosLeft } = withPhotos()
    server.state.supporters.delete(BEARER)
    await expect(run()).resolves.toBeUndefined()
    expect(photosLeft.accountId).toBeNull()

    // Photos an earlier change left wait for the account to be a Supporter.
    const again = withPhotos()
    again.server.state.supporters.delete(BEARER)
    again.photosLeft.accountId = ACCOUNT
    await again.run()
    expect(again.photosLeft.accountId).toBe(ACCOUNT)
  })

  it('leaves the rest when deleting an old name fails, and notes them', async () => {
    const { server, run, photosLeft } = withPhotos()
    const contact = await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    const note = await seedPhoto(server, K1, NOTE, photoFile(100, 2))
    server.state.photoFailure = {
      code: 'bad_request',
      status: 400,
      op: 'sync/photos/delete',
    }
    await expect(run()).resolves.toBeUndefined()
    // One new copy beside its old name; nothing else touched.
    expect(photoOps(server)).toEqual(['put'])
    expect(server.photoNames(BEARER)).toEqual(
      expect.arrayContaining([contact, note])
    )
    expect(server.photoNames(BEARER)).toHaveLength(3)
    expect(photosLeft.accountId).toBe(ACCOUNT)
  })

  it('deletes the old name when the new one turns out already live', async () => {
    const real = (server: FakeSyncServer) =>
      resealPhotoApi(optionsFor(server), () => OWN)
    let raced: Uint8Array | null = null
    const context = withPhotos({
      photos: () => {
        const api = real(context.server)
        return {
          ...api,
          // Another device holding K2 put it after the listing.
          put: async (photo) => {
            raced = photo.blob.slice()
            context.server.putPhoto(BEARER, photo.name, {
              bytes: raced,
              sha256: toB64u(sha256(raced)),
              createdAt: 2,
              meta: photo.meta,
            })
            return api.put(photo)
          },
        }
      },
    })
    const { server, run } = context
    const old = await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    await run()
    const name = photoName(derivePhotoKeys(K2).nameKey, CONTACT)
    expect(server.photoNames(BEARER)).toEqual([name])
    expect(server.photoNames(BEARER)).not.toContain(old)
    expect(server.photoBytes(BEARER, name)).toEqual(raced)
  })

  it('skips a photo the server said didn’t fit for the rest of the launch', async () => {
    const { server, run, photosLeft } = withPhotos()
    const name = await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    server.state.photoFailure = {
      code: 'storage_full',
      status: 429,
      op: 'sync/photos/put',
    }
    await run()
    expect(photoGets(server)).toBe(1)
    // The step runs again (a resume): not downloaded again this launch.
    await run()
    expect(photoGets(server)).toBe(1)
    expect(server.photoNames(BEARER)).toEqual([name])
    expect(photosLeft.accountId).toBe(ACCOUNT)
  })

  it('leaves a photo only the unreadable key history might open for later', async () => {
    const { server, run, photosLeft } = withPhotos({
      olderPhotoKeys: async () => null,
    })
    const older = await seedPhoto(server, K0, NOTE, photoFile(100, 2))
    await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    await run()
    expect(server.photoNames(BEARER)).toContain(older)
    expect(await photoUnder(server, K2, CONTACT)).toEqual(photoFile(100, 1))
    expect(photosLeft.accountId).toBe(ACCOUNT)
  })

  it('leaves a damaged photo as it is, without retrying it', async () => {
    const { server, run, photosLeft, record } = withPhotos()
    const name = await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    const damaged = server.photoBytes(BEARER, name)!.slice()
    damaged[40] ^= 1
    server.putPhoto(BEARER, name, {
      bytes: damaged,
      sha256: toB64u(sha256(damaged)),
      createdAt: 1,
      meta: (await resealPhotoApi(optionsFor(server), () => null).list())
        .photos[0]!.meta,
    })
    await run()
    expect(server.photoBytes(BEARER, name)).toEqual(damaged)
    expect(photoOps(server)).toEqual([])
    expect(record().reseal?.photos).toEqual([name])
    expect(photosLeft.accountId).toBeNull()
  })

  it('ignores a photo whose meta isn’t for the name it’s under', async () => {
    const { server, run } = withPhotos()
    const name = await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    const meta = (await resealPhotoApi(optionsFor(server), () => null).list())
      .photos[0]!.meta
    // The contact's meta, moved under the note's name.
    const moved = photoName(derivePhotoKeys(K1).nameKey, NOTE)
    server.putPhoto(BEARER, moved, {
      bytes: server.photoBytes(BEARER, name)!,
      sha256: 'x',
      createdAt: 1,
      meta,
    })
    await run()
    expect(server.photoNames(BEARER)).toContain(moved)
  })
})

describe('the photo re-seal on a later launch', () => {
  /** The device with an open session for `ACCOUNT`, holding K2. */
  const retrying = (
    server: FakeSyncServer,
    {
      left = ACCOUNT as string | null,
      session = ACCOUNT as string | null,
      underWay = false,
      key = K2 as Uint8Array | null,
    } = {}
  ) => {
    const note = { value: left }
    const retry = createPhotoResealRetry({
      photos: () => resealPhotoApi(optionsFor(server), () => OWN),
      olderPhotoKeys: async () => [derivePhotoKeys(K1)],
      photosLeft: {
        get: () => note.value,
        set: (accountId) => {
          note.value = accountId
        },
      },
      randomBytes,
      sessionAccountId: () => session,
      changeUnderWay: async () => underWay,
      accountKey: async () => key,
    })
    return { retry, note }
  }
  const withSlot = () => {
    const server = createFakeSyncServer()
    server.state.supporters.add(BEARER)
    server.seed(BEARER, OWN, sealSync(K2, OWN))
    return server
  }

  it('moves the photos a change left under an older key, then stops', async () => {
    const server = withSlot()
    await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    const { retry, note } = retrying(server)

    await retry()

    expect(await photoUnder(server, K2, CONTACT)).toEqual(photoFile(100, 1))
    expect(server.photoNames(BEARER)).toHaveLength(1)
    expect(note.value).toBeNull()
  })

  it('keeps waiting while a photo still doesn’t fit', async () => {
    const server = withSlot()
    await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    server.state.photoLimitBytes = server.photoUsage(BEARER).bytes
    const { retry, note } = retrying(server)
    await retry()
    expect(note.value).toBe(ACCOUNT)
  })

  it('tries once a launch, and never twice at once', async () => {
    const server = withSlot()
    await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    server.state.photoLimitBytes = server.photoUsage(BEARER).bytes
    const { retry } = retrying(server)
    await Promise.all([retry(), retry()])
    await retry()
    expect(
      server.state.log.filter((entry) => entry === 'POST sync/photos/list')
    ).toHaveLength(1)
  })

  it.each([
    ['no photos left', { left: null }],
    ['photos left for another account', { left: 'B'.repeat(22) }],
    ['no session open', { session: null }],
    ['a change under way', { underWay: true }],
    ['no account key on the device', { key: null }],
  ])('does nothing with %s', async (_, options) => {
    const server = withSlot()
    server.state.log.length = 0
    const { retry } = retrying(server, options)
    await retry()
    expect(server.state.log).toEqual([])
  })

  it('tries again later in the launch once a session opens', async () => {
    const server = withSlot()
    await seedPhoto(server, K1, CONTACT, photoFile(100, 1))
    let session: string | null = null
    const note = { value: ACCOUNT as string | null }
    const retry = createPhotoResealRetry({
      photos: () => resealPhotoApi(optionsFor(server), () => OWN),
      olderPhotoKeys: async () => [derivePhotoKeys(K1)],
      photosLeft: {
        get: () => note.value,
        set: (accountId) => {
          note.value = accountId
        },
      },
      randomBytes,
      sessionAccountId: () => session,
      changeUnderWay: async () => false,
      accountKey: async () => K2,
    })
    await retry()
    session = ACCOUNT
    await retry()
    expect(note.value).toBeNull()
  })
})
