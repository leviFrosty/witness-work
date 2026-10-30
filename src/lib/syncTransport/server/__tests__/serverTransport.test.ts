import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import {
  createServerTransport,
  filenameForSlot,
  slotIdForFilename,
  toServerTransportError,
  type ServerTransportDeps,
} from '@/lib/syncTransport/server/serverTransport'
import {
  deriveSyncKey,
  sealSyncBlob,
  syncBlobDigest,
} from '@/lib/syncTransport/server/syncCrypto'
import {
  derivePhotoKeys,
  photoName,
  sealPhoto,
} from '@/lib/syncTransport/server/photoCrypto'
import { createFakeSyncServer, type FakeSyncServer } from './fakeSyncServer'

const ACCOUNT_ID = 'A'.repeat(22)
const SLOT = 'slot-aaaaaaaa'
const OTHER = 'slot-bbbbbbbb'

const accessFor = (
  key: number,
  fetchImpl: typeof fetch,
  accountId = ACCOUNT_ID
) => ({
  accountId,
  syncKey: deriveSyncKey(new Uint8Array(32).fill(key)),
  photoKeys: derivePhotoKeys(new Uint8Array(32).fill(key)),
  options: {
    baseUrl: 'https://api.test',
    authorize: <T>(run: (authorization: string) => Promise<T>) =>
      run('Bearer family'),
    fetchImpl,
  },
})

/** Photo files on the device, by path. */
const memoryFiles = () => {
  const files = new Map<string, Uint8Array>()
  return {
    files,
    size: async (path: string) => files.get(path)?.length ?? 0,
    read: async (path: string) => {
      const bytes = files.get(path)
      if (!bytes) throw new Error(`no file at ${path}`)
      return bytes
    },
    write: async (path: string, bytes: Uint8Array) => {
      files.set(path, bytes.slice())
    },
  }
}

function setup(
  overrides: Partial<ServerTransportDeps> = {},
  key = 1,
  server: FakeSyncServer = createFakeSyncServer()
) {
  server.state.supporters.add('family')
  const onRefused = vi.fn()
  const onPhotoUsage = vi.fn()
  const files = memoryFiles()
  let photos: boolean | null = true
  let nonce = 0
  const transport = createServerTransport({
    access: async () => accessFor(key, server.fetch),
    isAvailable: () => true,
    identityToken: () => 'account:family',
    randomBytes: (length) => new Uint8Array(length).fill(++nonce),
    deviceName: () => 'phone',
    platform: 'ios',
    now: () => 1_000,
    onRefused,
    files,
    photoSwitch: () => photos,
    slotId: () => SLOT,
    onPhotoUsage,
    ...overrides,
  })
  return {
    server,
    transport,
    onRefused,
    onPhotoUsage,
    files: files.files,
    setPhotos: (on: boolean | null) => {
      photos = on
    },
  }
}

const everything = () => true

describe('serverTransport', () => {
  it('names slots as the engine names device snapshots', () => {
    expect(filenameForSlot(SLOT)).toBe(`witness-work-${SLOT}.json`)
    expect(slotIdForFilename(`witness-work-${SLOT}.json`)).toBe(SLOT)
    expect(slotIdForFilename('witness-work-account.json')).toBeNull()
    expect(slotIdForFilename('witness-work-a/b.json')).toBeNull()
    expect(slotIdForFilename('witness-work.json')).toBeNull()
  })

  it('writes sealed snapshots and reads them back', async () => {
    const { server, transport } = setup()
    const at = await transport.write(filenameForSlot(SLOT), '{"version":3}')
    expect(typeof at).toBe('number')
    expect(server.slotIds('family')).toEqual([SLOT])
    const bytes = server.slotBytes('family', SLOT)!
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('version')

    const { files, pending } = await transport.readFiles(everything)
    expect(pending).toEqual([])
    expect(files).toEqual([
      {
        filename: filenameForSlot(SLOT),
        json: '{"version":3}',
        modifiedAt: expect.any(Number),
      },
    ])
    expect(transport.lastSeq()).toBeGreaterThan(0)
  })

  it('downloads only slots whose ETag changed', async () => {
    const { server, transport } = setup()
    await transport.write(filenameForSlot(SLOT), '{"a":1}')
    await transport.write(filenameForSlot(OTHER), '{"b":1}')
    await transport.readFiles(everything)
    server.state.log.length = 0
    await transport.readFiles(everything)
    expect(server.state.log).toEqual(['POST sync/list'])

    await transport.write(filenameForSlot(OTHER), '{"b":2}')
    server.state.log.length = 0
    const { files } = await transport.readFiles(everything)
    expect(server.state.log).toEqual(['POST sync/list', 'POST sync/get'])
    expect(files.map((f) => f.json).sort()).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('skips slots the engine leaves out', async () => {
    const { transport } = setup()
    await transport.write(filenameForSlot(SLOT), '{}')
    await transport.write(filenameForSlot(OTHER), '{}')
    const { files } = await transport.readFiles(
      (name) => name !== filenameForSlot(SLOT)
    )
    expect(files.map((f) => f.filename)).toEqual([filenameForSlot(OTHER)])
  })

  it('reads another key’s slot as unreadable, and a newer one as newer', async () => {
    const { transport: writer, server } = setup({}, 2)
    await writer.write(filenameForSlot(OTHER), '{"a":1}')
    const { transport } = setup({
      access: async () => accessFor(1, server.fetch),
    })
    // A slot sealed by a newer app version.
    const newer = sealSyncBlob(
      deriveSyncKey(new Uint8Array(32).fill(1)),
      {
        v: 99,
        deviceName: 'future',
        platform: 'android',
        createdAt: 1,
        payload: {},
      } as never,
      { accountId: ACCOUNT_ID, slotId: SLOT },
      new Uint8Array(24)
    )
    await server.fetch('https://api.test/accounts/v1/sync/put', {
      method: 'POST',
      headers: {
        authorization: 'Bearer family',
        'x-ww-slot-id': SLOT,
        'x-ww-sha256': await syncBlobDigest(newer),
      },
      body: newer as never,
    })
    const { files } = await transport.readFiles(everything)
    const bySlot = Object.fromEntries(files.map((f) => [f.filename, f.json]))
    expect(bySlot[filenameForSlot(OTHER)]).toBe('')
    expect(JSON.parse(bySlot[filenameForSlot(SLOT)]).version).toBe(
      Number.MAX_SAFE_INTEGER
    )
  })

  it('opens a slot an older account key sealed with the key history', async () => {
    const { transport: writer, server } = setup({}, 2)
    await writer.write(filenameForSlot(OTHER), '{"a":1}')
    const { transport } = setup({
      access: async () => ({
        accountId: ACCOUNT_ID,
        syncKey: deriveSyncKey(new Uint8Array(32).fill(1)),
        photoKeys: derivePhotoKeys(new Uint8Array(32).fill(1)),
        olderSyncKeys: [
          deriveSyncKey(new Uint8Array(32).fill(3)),
          deriveSyncKey(new Uint8Array(32).fill(2)),
        ],
        options: {
          baseUrl: 'https://api.test',
          authorize: (run) => run('Bearer family'),
          fetchImpl: server.fetch,
        },
      }),
    })
    const { files } = await transport.readFiles(everything)
    expect(files.map((f) => f.json)).toEqual(['{"a":1}'])
  })

  it('reads a slot again once this device’s key changes, under the same account', async () => {
    // Another device re-sealed its slot under the new key (2) before this one,
    // still on the old key (1), learned of the change.
    const { transport: other, server } = setup({}, 2)
    await other.write(filenameForSlot(OTHER), '{"a":1}')
    let key = 1
    const { transport } = setup(
      { access: async () => accessFor(key, server.fetch) },
      1,
      server
    )
    const before = await transport.readFiles(everything)
    expect(before.files.map((f) => f.json)).toEqual([''])

    // Signed back in with the new key: the same account, the slot unchanged.
    key = 2
    const after = await transport.readFiles(everything)
    expect(after.files.map((f) => f.json)).toEqual(['{"a":1}'])
  })

  it('maps the server’s refusals the way the engine reads them', async () => {
    const { server, transport, onRefused } = setup()
    server.state.enabled = false
    await expect(transport.readFiles(everything)).rejects.toMatchObject({
      code: 'unauthorized',
    })
    expect(onRefused).toHaveBeenLastCalledWith('disabled')

    server.state.enabled = true
    server.state.supporters.clear()
    await expect(
      transport.write(filenameForSlot(SLOT), '{}')
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(onRefused).toHaveBeenLastCalledWith('supporter_required')
  })

  it('reports a missing session as unauthorized', async () => {
    const { transport } = setup({
      access: async () => {
        throw new Error('no session')
      },
    })
    await expect(transport.readFiles(everything)).rejects.toMatchObject({
      code: 'unauthorized',
    })
  })

  it('reports an unreachable server as a network error', async () => {
    const { transport } = setup({
      access: async () =>
        accessFor(1, async () => {
          throw new TypeError('Network request failed')
        }),
    })
    await expect(transport.readFiles(everything)).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('refuses names that aren’t device snapshots', async () => {
    const { transport, server } = setup()
    await expect(
      transport.write('witness-work-account.json', '{}')
    ).rejects.toMatchObject({ code: 'unknown' })
    await transport.deleteFile('witness-work-account.json')
    expect(server.state.log).toEqual([])
  })

  it('deletes one slot, or all of them', async () => {
    const { transport, server } = setup()
    await transport.write(filenameForSlot(SLOT), '{}')
    await transport.write(filenameForSlot(OTHER), '{}')
    await transport.deleteFile(filenameForSlot(SLOT))
    expect(server.slotIds('family')).toEqual([OTHER])
    await transport.deleteAll()
    expect(server.slotIds('family')).toEqual([])
  })

  it('tells a server failure apart from a lost connection', () => {
    expect(toServerTransportError(new HttpError('server', 500))).toMatchObject({
      code: 'server-error',
    })
    expect(
      toServerTransportError(
        new HttpError('server', 503, 'unavailable', 30_000)
      )
    ).toMatchObject({ code: 'server-error', retryAfterMs: 30_000 })
    expect(toServerTransportError(new HttpError('offline'))).toMatchObject({
      code: 'network',
    })
    expect(toServerTransportError(new HttpError('timeout'))).toMatchObject({
      code: 'network',
    })
  })

  it('reads an app too old for the server as needing the User', () => {
    // Update Required shows; the engine mustn't report it on every retry.
    expect(
      toServerTransportError(new HttpError('client', 426, 'upgrade_required'))
    ).toMatchObject({ code: 'unauthorized' })
    expect(
      toServerTransportError(new HttpError('client', 400, 'upgrade_required'))
    ).toMatchObject({ code: 'unauthorized' })
  })

  it('tells listeners about remote changes and availability', () => {
    const { transport } = setup()
    const remote = vi.fn()
    const available = vi.fn()
    const subs = [
      transport.addRemoteChangeListener(remote),
      transport.addAvailabilityChangeListener(available),
    ]
    transport.notifyRemoteChange()
    transport.notifyAvailabilityChange()
    expect(remote).toHaveBeenCalledWith({ modifiedAt: 1_000 })
    expect(available).toHaveBeenCalledWith({ available: true })
    subs.forEach((sub) => sub.remove())
    transport.notifyRemoteChange()
    expect(remote).toHaveBeenCalledTimes(1)
  })
})

const CONTACT = 'witness-work-img-contact-c1--r1.jpg'
const PROFILE = 'witness-work-img-profile--r1.jpg'
const NOTE = 'witness-work-note-note0001.jpg'
const photoBytes = (fill: number, length = 2_000) =>
  new Uint8Array(length).fill(fill)

/** A device on Cloud Sync: its slot is published, so photos may follow. */
async function photoSetup(
  overrides: Partial<ServerTransportDeps> = {},
  key = 1,
  server: FakeSyncServer = createFakeSyncServer()
) {
  const device = setup(overrides, key, server)
  await device.transport.write(filenameForSlot(SLOT), '{}')
  device.server.state.log.length = 0
  return device
}

describe('serverTransport photos', () => {
  it('holds photos once the server says it has them, switch on or off', async () => {
    const { transport, setPhotos } = await photoSetup()
    expect(transport.supportsBinaries).toBe(true)
    expect(transport.binaryWritesPaused).toBe(false)
    // Off: uploads wait, reads and deletes go on.
    setPhotos(false)
    expect(transport.supportsBinaries).toBe(true)
    expect(transport.binaryWritesPaused).toBe(true)
    // A server that doesn't know photos.
    setPhotos(null)
    expect(transport.supportsBinaries).toBe(false)
    expect(
      (await photoSetup({ files: undefined })).transport.supportsBinaries
    ).toBe(false)
    expect(transport.binaryTimeoutMs).toBeGreaterThan(120_000)
  })

  it('uploads a sealed photo under its keyed name and lists it back', async () => {
    const { transport, server, files, onPhotoUsage } = await photoSetup()
    files.set('file:///doc/contact-c1.jpg', photoBytes(5))
    const at = await transport.writeBinary(
      CONTACT,
      'file:///doc/contact-c1.jpg'
    )
    // Its own slot, so this device's live socket isn't told.
    expect(server.state.photoWrites).toEqual([{ op: 'put', slotId: SLOT }])
    const keys = derivePhotoKeys(new Uint8Array(32).fill(1))
    const name = photoName(keys.nameKey, CONTACT)
    expect(server.photoNames('family')).toEqual([name])
    const stored = server.photoBytes('family', name)!
    expect(stored).toHaveLength(1 + 24 + 2_000 + 16)
    expect(stored.subarray(25, 2_025)).not.toEqual(photoBytes(5))
    expect(onPhotoUsage).toHaveBeenLastCalledWith(
      { bytes: stored.length, count: 1, limit: 2_000_000_000 },
      'put'
    )

    expect(await transport.listBinaryFiles()).toEqual([
      { filename: CONTACT, modifiedAt: at },
    ])
    expect(onPhotoUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1 }),
      'list'
    )
  })

  it('downloads and opens a photo another device uploaded', async () => {
    const server = createFakeSyncServer()
    const phone = await photoSetup({}, 1, server)
    phone.files.set('file:///a/n1.jpg', photoBytes(9, 300_000))
    const at = await phone.transport.writeBinary(NOTE, 'file:///a/n1.jpg')

    const tablet = await photoSetup({}, 1, server)
    expect(await tablet.transport.listBinaryFiles()).toEqual([
      { filename: NOTE, modifiedAt: at },
    ])
    expect(await tablet.transport.readBinary(NOTE, 'file:///b/n1.jpg')).toBe(at)
    expect(tablet.files.get('file:///b/n1.jpg')).toEqual(photoBytes(9, 300_000))
  })

  it('reports a missing photo as not found, and writes nothing', async () => {
    const { transport, files } = await photoSetup()
    await expect(
      transport.readBinary(CONTACT, 'file:///b/c1.jpg')
    ).rejects.toMatchObject({ code: 'not-found' })
    expect(files.has('file:///b/c1.jpg')).toBe(false)
  })

  it('reads a blob that doesn’t open as a bad file, never a crash', async () => {
    const server = createFakeSyncServer()
    const other = await photoSetup({}, 2, server)
    other.files.set('file:///a/c1.jpg', photoBytes(3))
    await other.transport.writeBinary(CONTACT, 'file:///a/c1.jpg')

    const { transport, files } = await photoSetup({}, 1, server)
    // Another key's meta doesn't open, so the listing skips it.
    expect(await transport.listBinaryFiles()).toEqual([])
    await expect(
      transport.readBinary(CONTACT, 'file:///b/c1.jpg')
    ).rejects.toMatchObject({ code: 'not-found' })

    // Under our own name, but sealed with another key: a bad file.
    const keys = derivePhotoKeys(new Uint8Array(32).fill(1))
    const name = photoName(keys.nameKey, PROFILE)
    server.putPhoto('family', name, {
      bytes: await sealPhoto(
        derivePhotoKeys(new Uint8Array(32).fill(2)).photoKey,
        photoBytes(1),
        { accountId: ACCOUNT_ID, name },
        new Uint8Array(24)
      ),
      sha256: 'x',
      createdAt: 5,
      meta: 'garbage',
    })
    expect(await transport.listBinaryFiles()).toEqual([])
    await expect(
      transport.readBinary(PROFILE, 'file:///b/p.jpg')
    ).rejects.toMatchObject({ code: 'unknown' })
    expect(files.has('file:///b/p.jpg')).toBe(false)
  })

  it('skips a meta moved from another photo’s name', async () => {
    const { transport, server, files } = await photoSetup()
    files.set('file:///a/c1.jpg', photoBytes(3))
    await transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    const keys = derivePhotoKeys(new Uint8Array(32).fill(1))
    const real = photoName(keys.nameKey, CONTACT)
    const stored = server.photoBytes('family', real)!
    const meta = (await server
      .fetch('https://api.test/accounts/v1/sync/photos/list', {
        method: 'POST',
        headers: { authorization: 'Bearer family' },
        body: '{}',
      })
      .then((response) => response.json())) as {
      photos: Array<{ meta: string }>
    }
    server.putPhoto('family', photoName(keys.nameKey, PROFILE), {
      bytes: stored,
      sha256: 'x',
      createdAt: 7,
      meta: meta.photos[0].meta,
    })
    const fresh = await photoSetup({}, 1, server)
    expect(
      (await fresh.transport.listBinaryFiles()).map((file) => file.filename)
    ).toEqual([CONTACT])
  })

  it('lists every page', async () => {
    const { transport, server, files } = await photoSetup()
    server.state.photoPageSize = 2
    const names = Array.from(
      { length: 5 },
      (_, i) => `witness-work-note-note000${i}.jpg`
    )
    for (const [i, filename] of names.entries()) {
      files.set(`file:///a/${i}`, photoBytes(i))
      await transport.writeBinary(filename, `file:///a/${i}`)
    }
    server.state.log.length = 0
    const listed = await transport.listBinaryFiles()
    expect(listed.map((file) => file.filename).sort()).toEqual(names.sort())
    expect(server.state.log).toEqual([
      'POST sync/photos/list',
      'POST sync/photos/list',
      'POST sync/photos/list',
    ])
  })

  it('takes a name that’s live already as uploaded', async () => {
    const { transport, server, files } = await photoSetup()
    files.set('file:///a/c1.jpg', photoBytes(3))
    const first = await transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    const again = await transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    expect(again).toBe(first)
    expect(server.photoUsage('family').count).toBe(1)
  })

  it('reports a full account as storage-full with its usage', async () => {
    const { transport, server, files, onPhotoUsage } = await photoSetup()
    server.state.photoLimitBytes = 3_000
    files.set('file:///a/c1.jpg', photoBytes(3))
    files.set('file:///a/n1.jpg', photoBytes(4))
    files.set('file:///a/big.jpg', photoBytes(5, 3_000))
    // The server refuses one that doesn't fit, with the account's usage.
    await expect(
      transport.writeBinary(NOTE, 'file:///a/big.jpg')
    ).rejects.toMatchObject({ code: 'storage-full' })
    expect(server.state.log).toContain('POST sync/photos/put')
    expect(onPhotoUsage).toHaveBeenLastCalledWith(
      { bytes: 0, count: 0, limit: 3_000 },
      'full'
    )
    await transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    expect(server.photoUsage('family').count).toBe(1)

    // Known not to fit now: refused without sending it again.
    server.state.log.length = 0
    await expect(
      transport.writeBinary(NOTE, 'file:///a/n1.jpg')
    ).rejects.toMatchObject({ code: 'storage-full' })
    expect(server.state.log).toEqual([])
    expect(onPhotoUsage).toHaveBeenLastCalledWith(
      { bytes: 2_041, count: 1, limit: 3_000 },
      'full'
    )

    // Deleting a photo frees its space at once.
    await transport.deleteBinaryFile(CONTACT)
    expect(onPhotoUsage).toHaveBeenLastCalledWith(
      { bytes: 0, count: 0, limit: 3_000 },
      'delete'
    )
    await transport.writeBinary(NOTE, 'file:///a/n1.jpg')
    expect(server.photoUsage('family').count).toBe(1)
  })

  it('waits for room after a count limit too', async () => {
    const { transport, server, files, onPhotoUsage } = await photoSetup()
    files.set('file:///a/c1.jpg', photoBytes(3))
    files.set('file:///a/n1.jpg', photoBytes(4))
    await transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    server.state.photoCountLimit = 1
    await expect(
      transport.writeBinary(NOTE, 'file:///a/n1.jpg')
    ).rejects.toMatchObject({ code: 'storage-full' })
    // The refusal carries no usage, so the last one heard stands for it.
    expect(onPhotoUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1 }),
      'full'
    )
  })

  it('waits on photos’ own switch without pausing sync', async () => {
    const { transport, server, files, onRefused, setPhotos } =
      await photoSetup()
    server.state.photos = false
    files.set('file:///a/c1.jpg', photoBytes(3))
    await expect(
      transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    ).rejects.toMatchObject({ code: 'server-error' })
    expect(onRefused).toHaveBeenLastCalledWith('photos_disabled')
    expect(onRefused).not.toHaveBeenCalledWith('disabled')
    // Reading, deleting and the snapshot go on.
    expect(await transport.listBinaryFiles()).toEqual([])
    await transport.deleteAllBinaries()
    await transport.write(filenameForSlot(SLOT), '{"a":1}')

    // Once recorded off, an upload waits without asking.
    setPhotos(false)
    server.state.log.length = 0
    await expect(
      transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    ).rejects.toMatchObject({ code: 'server-error' })
    expect(server.state.log).toEqual([])
  })

  it('puts only revisioned avatars and note photos', async () => {
    const { transport, server, files } = await photoSetup()
    files.set('file:///a/c1.jpg', photoBytes(3))
    await expect(
      transport.writeBinary(
        'witness-work-img-contact-c1.jpg',
        'file:///a/c1.jpg'
      )
    ).rejects.toMatchObject({ code: 'unknown' })
    expect(server.state.log).toEqual([])
  })

  it('waits for its slot before its photos', async () => {
    const { transport, files } = setup()
    files.set('file:///a/c1.jpg', photoBytes(3))
    await expect(
      transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    ).rejects.toMatchObject({ code: 'server-error', message: 'no_slot' })
    await transport.write(filenameForSlot(SLOT), '{}')
    await transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
  })

  it('maps photo refusals the way the contract says', async () => {
    const { transport, server, files } = await photoSetup()
    files.set('file:///a/c1.jpg', photoBytes(3))
    const failWith = async (code: string, status: number) => {
      server.state.photoFailure = { code, status }
      return transport
        .writeBinary(CONTACT, 'file:///a/c1.jpg')
        .then(() => null)
        .catch((error: { code: string }) => error.code)
    }
    expect(await failWith('too_large', 413)).toBe('too-large')
    expect(await failWith('storage_full', 429)).toBe('storage-full')
    expect(await failWith('limit', 429)).toBe('storage-full')
    expect(await failWith('conflict', 409)).toBe('server-error')
    expect(await failWith('no_slot', 409)).toBe('server-error')
    expect(await failWith('photos_disabled', 503)).toBe('server-error')
    expect(await failWith('rate_limited', 429)).toBe('rate-limited')
    expect(await failWith('disabled', 503)).toBe('unauthorized')
    expect(await failWith('supporter_required', 403)).toBe('unauthorized')
  })

  it('refuses a photo too big for the server before uploading it', async () => {
    const { transport, server, files } = await photoSetup()
    files.set('file:///a/big.jpg', new Uint8Array(25 * 1024 * 1024))
    await expect(
      transport.writeBinary(NOTE, 'file:///a/big.jpg')
    ).rejects.toMatchObject({ code: 'too-large', message: 'too_large' })
    expect(server.state.log).toEqual([])
  })

  it('uses the listed name, and tells the server its slot when deleting', async () => {
    const { transport, server, files } = await photoSetup()
    files.set('file:///a/c1.jpg', photoBytes(3))
    await transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    await transport.listBinaryFiles()
    server.state.photoWrites.length = 0
    await transport.deleteBinaryFile(CONTACT)
    expect(server.state.photoWrites).toEqual([{ op: 'delete', slotId: SLOT }])
    expect(server.photoNames('family')).toEqual([])
  })

  it('deletes one photo, or all of them', async () => {
    const { transport, server, files } = await photoSetup()
    files.set('file:///a/c1.jpg', photoBytes(3))
    files.set('file:///a/n1.jpg', photoBytes(4))
    await transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    await transport.writeBinary(NOTE, 'file:///a/n1.jpg')
    await transport.deleteBinaryFile(CONTACT)
    expect(
      (await transport.listBinaryFiles()).map((file) => file.filename)
    ).toEqual([NOTE])
    // Idempotent.
    await transport.deleteBinaryFile(CONTACT)
    await transport.deleteAllBinaries()
    expect(server.photoNames('family')).toEqual([])
    expect(await transport.listBinaryFiles()).toEqual([])
  })

  describe('after a key change', () => {
    const K1 = derivePhotoKeys(new Uint8Array(32).fill(1))
    const K2 = derivePhotoKeys(new Uint8Array(32).fill(2))
    /** This device holds K2; the key history has K1's photo keys. */
    const changed = (server: FakeSyncServer) =>
      photoSetup(
        {
          access: async () => ({
            ...accessFor(2, server.fetch),
            olderPhotoKeys: [K1],
          }),
        },
        2,
        server
      )

    it('lists and downloads a photo not yet re-sealed, with the history’s keys', async () => {
      const server = createFakeSyncServer()
      const old = await photoSetup({}, 1, server)
      old.files.set('file:///a/c1.jpg', photoBytes(3))
      const at = await old.transport.writeBinary(CONTACT, 'file:///a/c1.jpg')

      const { transport, files } = await changed(server)
      expect(await transport.listBinaryFiles()).toEqual([
        { filename: CONTACT, modifiedAt: at },
      ])
      expect(await transport.readBinary(CONTACT, 'file:///b/c1.jpg')).toBe(at)
      expect(files.get('file:///b/c1.jpg')).toEqual(photoBytes(3))
    })

    it('finds a photo under the history’s name without listing first', async () => {
      const server = createFakeSyncServer()
      const old = await photoSetup({}, 1, server)
      old.files.set('file:///a/n1.jpg', photoBytes(4))
      await old.transport.writeBinary(NOTE, 'file:///a/n1.jpg')

      const { transport, files } = await changed(server)
      await transport.readBinary(NOTE, 'file:///b/n1.jpg')
      expect(files.get('file:///b/n1.jpg')).toEqual(photoBytes(4))
      // Only under the history's name: a photo neither name holds is missing.
      await expect(
        transport.readBinary(PROFILE, 'file:///b/p.jpg')
      ).rejects.toMatchObject({ code: 'not-found' })
    })

    it('lists a photo held under both keys once, by its new name', async () => {
      const server = createFakeSyncServer()
      const old = await photoSetup({}, 1, server)
      old.files.set('file:///a/c1.jpg', photoBytes(3))
      await old.transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
      const { transport, files } = await changed(server)
      // Listed under the history's name first: an upload still goes under
      // the new key's name, never the old one.
      await transport.listBinaryFiles()
      files.set('file:///b/c1.jpg', photoBytes(3))
      const at = await transport.writeBinary(CONTACT, 'file:///b/c1.jpg')
      expect(server.photoNames('family').sort()).toEqual(
        [photoName(K1.nameKey, CONTACT), photoName(K2.nameKey, CONTACT)].sort()
      )
      expect(await transport.listBinaryFiles()).toEqual([
        { filename: CONTACT, modifiedAt: at },
      ])
      expect(await transport.readBinary(CONTACT, 'file:///b/again.jpg')).toBe(
        at
      )
    })

    it('finds a photo re-sealed since it was listed under the history’s name', async () => {
      const server = createFakeSyncServer()
      const old = await photoSetup({}, 1, server)
      old.files.set('file:///a/c1.jpg', photoBytes(3))
      await old.transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
      const { transport, files } = await changed(server)
      await transport.listBinaryFiles()
      // The changing device puts it under the new name, then deletes the old.
      const resealer = await changed(server)
      resealer.files.set('file:///c/c1.jpg', photoBytes(3))
      const at = await resealer.transport.writeBinary(
        CONTACT,
        'file:///c/c1.jpg'
      )
      await old.transport.deleteBinaryFile(CONTACT)
      expect(server.photoNames('family')).toEqual([
        photoName(K2.nameKey, CONTACT),
      ])

      expect(await transport.readBinary(CONTACT, 'file:///b/c1.jpg')).toBe(at)
      expect(files.get('file:///b/c1.jpg')).toEqual(photoBytes(3))
    })

    /** One transport whose account key changes from K1 to K2 mid-process. */
    const switching = async (server: FakeSyncServer) => {
      let key: 1 | 2 = 1
      const device = await photoSetup(
        {
          access: async () =>
            key === 1
              ? accessFor(1, server.fetch)
              : { ...accessFor(2, server.fetch), olderPhotoKeys: [K1] },
        },
        1,
        server
      )
      return {
        ...device,
        changeKey: () => {
          key = 2
        },
      }
    }

    it('reads what it listed under the old key once the key changed', async () => {
      const server = createFakeSyncServer()
      const device = await switching(server)
      device.files.set('file:///a/c1.jpg', photoBytes(3))
      const at = await device.transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
      await device.transport.listBinaryFiles()

      device.changeKey()
      expect(await device.transport.listBinaryFiles()).toEqual([
        { filename: CONTACT, modifiedAt: at },
      ])
      expect(
        await device.transport.readBinary(CONTACT, 'file:///a/again.jpg')
      ).toBe(at)
      expect(device.files.get('file:///a/again.jpg')).toEqual(photoBytes(3))
    })

    it('lists a new key’s photo it couldn’t open before the key changed', async () => {
      const server = createFakeSyncServer()
      const device = await switching(server)
      // Another device, already on K2.
      const other = await changed(server)
      other.files.set('file:///b/c1.jpg', photoBytes(3))
      const at = await other.transport.writeBinary(CONTACT, 'file:///b/c1.jpg')
      expect(await device.transport.listBinaryFiles()).toEqual([])

      device.changeKey()
      expect(await device.transport.listBinaryFiles()).toEqual([
        { filename: CONTACT, modifiedAt: at },
      ])
    })

    it('deletes a photo under every name the keys give it', async () => {
      const server = createFakeSyncServer()
      const old = await photoSetup({}, 1, server)
      old.files.set('file:///a/c1.jpg', photoBytes(3))
      await old.transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
      const { transport, files } = await changed(server)
      files.set('file:///b/c1.jpg', photoBytes(3))
      await transport.writeBinary(CONTACT, 'file:///b/c1.jpg')
      await transport.listBinaryFiles()
      await transport.deleteBinaryFile(CONTACT)
      expect(server.photoNames('family')).toEqual([])
      expect(photoName(K2.nameKey, CONTACT)).not.toBe(
        photoName(K1.nameKey, CONTACT)
      )
    })
  })

  it('reads photos under the account they were written in only', async () => {
    const server = createFakeSyncServer()
    const phone = await photoSetup({}, 1, server)
    phone.files.set('file:///a/c1.jpg', photoBytes(3))
    await phone.transport.writeBinary(CONTACT, 'file:///a/c1.jpg')
    const moved = await photoSetup(
      { access: async () => accessFor(1, server.fetch, 'B'.repeat(22)) },
      1,
      server
    )
    expect(await moved.transport.listBinaryFiles()).toEqual([])
    await expect(
      moved.transport.readBinary(CONTACT, 'file:///b/c1.jpg')
    ).rejects.toMatchObject({ code: 'unknown' })
  })
})
