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
import { createFakeSyncServer } from './fakeSyncServer'

const ACCOUNT_ID = 'A'.repeat(22)
const SLOT = 'slot-aaaaaaaa'
const OTHER = 'slot-bbbbbbbb'

function setup(overrides: Partial<ServerTransportDeps> = {}, key = 1) {
  const server = createFakeSyncServer()
  server.state.supporters.add('family')
  const onRefused = vi.fn()
  let nonce = 0
  const transport = createServerTransport({
    access: async () => ({
      accountId: ACCOUNT_ID,
      syncKey: deriveSyncKey(new Uint8Array(32).fill(key)),
      options: {
        baseUrl: 'https://api.test',
        authorize: (run) => run('Bearer family'),
        fetchImpl: server.fetch,
      },
    }),
    isAvailable: () => true,
    identityToken: () => 'account:family',
    randomBytes: (length) => new Uint8Array(length).fill(++nonce),
    deviceName: () => 'phone',
    platform: 'ios',
    now: () => 1_000,
    onRefused,
    ...overrides,
  })
  return { server, transport, onRefused }
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
      access: async () => ({
        accountId: ACCOUNT_ID,
        syncKey: deriveSyncKey(new Uint8Array(32).fill(1)),
        options: {
          baseUrl: 'https://api.test',
          authorize: (run) => run('Bearer family'),
          fetchImpl: server.fetch,
        },
      }),
    })

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
      access: async () => ({
        accountId: ACCOUNT_ID,
        syncKey: deriveSyncKey(new Uint8Array(32).fill(1)),
        options: {
          baseUrl: 'https://api.test',
          authorize: (run) => run('Bearer family'),
          fetchImpl: async () => {
            throw new TypeError('Network request failed')
          },
        },
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
    expect(
      toServerTransportError(new HttpError('client', 426, 'upgrade_required'))
    ).toMatchObject({ code: 'unauthorized' })
    expect(
      toServerTransportError(new HttpError('client', 400, 'upgrade_required'))
    ).toMatchObject({ code: 'unauthorized' })
  })

  it('holds no photos yet', async () => {
    const { transport } = setup()
    expect(transport.supportsBinaries).toBe(false)
    expect(await transport.listBinaryFiles()).toEqual([])
    await expect(
      transport.writeBinary('photo.jpg', 'file:///x')
    ).rejects.toMatchObject({ code: 'not-found' })
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
