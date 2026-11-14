import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromB64u, toB64u } from '@/lib/bytes'
import { openChange, sealChange } from '@/lib/syncTransport/server/changeCrypto'
import {
  type ChangeStore,
  RECORD_CHANGE_LIMITS,
} from '@/lib/syncTransport/server/recordChanges'
import {
  createServerTransport,
  filenameForSlot,
  type ServerTransport,
  type ServerTransportDeps,
  type SlotStore,
} from '@/lib/syncTransport/server/serverTransport'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'
import { derivePhotoKeys } from '@/lib/syncTransport/server/photoCrypto'
import { createFakeSyncServer, type FakeSyncServer } from './fakeSyncServer'

const ACCOUNT_ID = 'A'.repeat(22)
const PHONE = 'slot-phone000'
const TABLET = 'slot-tablet00'
const LAPTOP = 'slot-laptop00'
const SYNC_KEY = deriveSyncKey(new Uint8Array(32).fill(1))

type Payload = {
  version: number
  writtenAt: number
  calibratedClock: boolean
  deviceId: string
  contactStore: { contacts: Array<Record<string, unknown>> }
  serviceReportStore: {
    serviceReports: Record<string, Record<string, unknown[]>>
  }
  preferencesStore: { values: Record<string, unknown> }
}

const payloadFor = (deviceId: string): Payload => ({
  version: 1,
  writtenAt: 1_000,
  calibratedClock: true,
  deviceId,
  contactStore: {
    contacts: [
      { id: 'c1', name: 'Ada', updatedAt: 10 },
      { id: 'c2', name: 'Ben', updatedAt: 11 },
    ],
  },
  serviceReportStore: { serviceReports: {} },
  preferencesStore: { values: { theme: 'dark' } },
})

const memoryStores = () => {
  const slots = new Map<
    string,
    { accountId: string; etag: string; blob: Uint8Array }
  >()
  const slotStore: SlotStore = {
    read: (accountId, slotId) => {
      const slot = slots.get(slotId)
      return slot?.accountId === accountId
        ? { etag: slot.etag, blob: slot.blob }
        : null
    },
    write: (accountId, slotId, etag, blob) => {
      slots.set(slotId, { accountId, etag, blob: blob.slice() })
    },
    remove: (slotId) => {
      slots.delete(slotId)
    },
    prune: (accountId, keep) => {
      for (const [slotId, slot] of slots)
        if (!keep.has(slotId) || slot.accountId !== accountId)
          slots.delete(slotId)
    },
    clear: () => slots.clear(),
  }
  const values = new Map<string, string>()
  const changeStore: ChangeStore = {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value)
    },
    delete: (key) => {
      values.delete(key)
    },
    clear: () => values.clear(),
  }
  return { slots, values, slotStore, changeStore }
}

type Stores = ReturnType<typeof memoryStores>

let nonce = 0

function device(
  server: FakeSyncServer,
  slotId: string,
  {
    stores = memoryStores(),
    overrides = {},
  }: { stores?: Stores | null; overrides?: Partial<ServerTransportDeps> } = {}
) {
  server.state.supporters.add('family')
  server.state.changes = true
  const onChangesRefused = vi.fn()
  const onCatchUp = vi.fn()
  const pushes = vi.fn()
  const remote = vi.fn()
  let on = true
  const transport: ServerTransport = createServerTransport({
    access: async () => ({
      accountId: ACCOUNT_ID,
      syncKey: SYNC_KEY,
      photoKeys: derivePhotoKeys(new Uint8Array(32).fill(1)),
      options: {
        baseUrl: 'https://api.test',
        authorize: <T>(run: (authorization: string) => Promise<T>) =>
          run('Bearer family'),
        fetchImpl: server.fetch,
      },
    }),
    slotStore: stores?.slotStore,
    changeStore: stores?.changeStore,
    changes: () => on,
    onChangesRefused: () => {
      on = false
      onChangesRefused()
    },
    onCatchUp,
    isAvailable: () => true,
    identityToken: () => 'account:family',
    randomBytes: (length) => {
      const bytes = new Uint8Array(length)
      new DataView(bytes.buffer).setUint32(0, ++nonce)
      return bytes
    },
    deviceName: () => slotId,
    platform: 'ios',
    now: () => 1_000,
    slotId: () => slotId,
    ...overrides,
  })
  transport.setPushRequester?.(pushes)
  transport.addRemoteChangeListener(remote)
  const own = filenameForSlot(slotId)
  const read = async () => {
    const { files } = await transport.readFiles(() => true, {
      listOnly: (name) => name === own,
    })
    return files
  }
  return {
    transport,
    stores,
    onChangesRefused,
    onCatchUp,
    pushes,
    remote,
    read,
    write: (payload: unknown, compact = false) =>
      transport.write(own, JSON.stringify(payload), { compact }),
    payloadOf: async (slot: string) => {
      const file = (await read()).find(
        (each) => each.filename === filenameForSlot(slot)
      )
      return file?.json ? (JSON.parse(file.json) as Payload) : null
    },
    connect: async () => {
      const live = server.openSocket('family', slotId)
      live.onMessage = (message) => transport.liveMessage(message, live.send)
      transport.liveEvent('connecting')
      server.hello(live)
      await vi.waitFor(() =>
        expect(transport.changeStats().subscribed).toBe(true)
      )
      return live
    },
  }
}

const requests = (server: FakeSyncServer) => {
  const log = [...server.state.log]
  server.state.log.length = 0
  return log
}

afterEach(() => {
  vi.useRealTimers()
})

describe('record changes: what a device sends', () => {
  it('sends the base once, then one small change for one edit', async () => {
    const server = createFakeSyncServer()
    const phone = device(server, PHONE)
    const payload = payloadFor(PHONE)
    await phone.write(payload)
    expect(requests(server)).toEqual(['POST sync/put'])
    expect(server.state.basePuts).toEqual([{ slotId: PHONE, covers: null }])

    payload.contactStore.contacts[1].name = 'Benjamin'
    payload.writtenAt = 2_000
    const at = await phone.write(payload)
    expect(requests(server)).toEqual(['POST sync/changes/put'])
    expect(server.state.changePuts).toEqual([256])
    expect(at).toBe(server.tail('family', PHONE)[0].createdAt)

    const [stored] = server.tail('family', PHONE)
    expect(
      openChange(SYNC_KEY, fromB64u(stored.blob), {
        accountId: ACCOUNT_ID,
        slotId: PHONE,
        changeId: stored.changeId,
      })
    ).toEqual({
      v: 1,
      records: {
        'contactStore/contacts': [
          { id: 'c2', name: 'Benjamin', updatedAt: 11 },
        ],
      },
      leaves: { writtenAt: 2_000, calibratedClock: true },
    })
  })

  it('sends nothing when nothing changed', async () => {
    const server = createFakeSyncServer()
    const phone = device(server, PHONE)
    const first = await phone.write(payloadFor(PHONE))
    requests(server)
    const again = await phone.write({ ...payloadFor(PHONE), writtenAt: 9_000 })
    expect(requests(server)).toEqual([])
    expect(again).toBe(first)
  })

  it('keeps its fingerprints for the next launch', async () => {
    const server = createFakeSyncServer()
    const stores = memoryStores()
    await device(server, PHONE, { stores }).write(payloadFor(PHONE))
    requests(server)

    const relaunched = device(server, PHONE, { stores })
    await relaunched.write(payloadFor(PHONE))
    expect(requests(server)).toEqual([])
    const edited = payloadFor(PHONE)
    edited.contactStore.contacts[0].name = 'Ada L.'
    await relaunched.write(edited)
    expect(requests(server)).toEqual(['POST sync/changes/put'])
  })

  it('sends the base again when it has no fingerprints', async () => {
    const server = createFakeSyncServer()
    await device(server, PHONE).write(payloadFor(PHONE))
    requests(server)
    await device(server, PHONE, { stores: null }).write(payloadFor(PHONE))
    expect(requests(server)).toEqual(['POST sync/put'])
  })

  it('sends the base when the reset generation changes', async () => {
    const server = createFakeSyncServer()
    const phone = device(server, PHONE)
    await phone.write(payloadFor(PHONE))
    requests(server)
    await phone.write({ ...payloadFor(PHONE), resetEpoch: { id: 'e2' } })
    expect(requests(server)).toEqual(['POST sync/put'])
    expect(server.tail('family', PHONE)).toEqual([])
  })

  it('folds its changes into the base when asked to, before a key change', async () => {
    const server = createFakeSyncServer()
    const phone = device(server, PHONE)
    const payload = payloadFor(PHONE)
    await phone.write(payload)
    payload.contactStore.contacts[0].name = 'Ada L.'
    await phone.write(payload)
    requests(server)
    await phone.transport.write(
      filenameForSlot(PHONE),
      JSON.stringify(payload),
      { fold: true }
    )
    expect(requests(server)).toEqual(['POST sync/put'])
    expect(server.tail('family', PHONE)).toEqual([])

    await phone.transport.write(
      filenameForSlot(PHONE),
      JSON.stringify(payload),
      { fold: true }
    )
    expect(requests(server)).toEqual([])
  })

  it('sends the base when its slot is gone or its tail is full', async () => {
    const server = createFakeSyncServer()
    const phone = device(server, PHONE)
    const payload = payloadFor(PHONE)
    await phone.write(payload)
    for (const code of ['no_slot', 'tail_full']) {
      requests(server)
      server.state.failChangePuts = { code, status: 409 }
      payload.contactStore.contacts[0].name = `Ada ${code}`
      await phone.write(payload)
      expect(requests(server)).toEqual([
        'POST sync/changes/put',
        'POST sync/put',
      ])
    }
  })

  it('does not send back a record another device sent', async () => {
    const server = createFakeSyncServer()
    const phone = device(server, PHONE)
    const tablet = device(server, TABLET)
    await phone.write(payloadFor(PHONE))
    await tablet.write(payloadFor(TABLET))
    await tablet.read()

    const edited = payloadFor(PHONE)
    edited.contactStore.contacts.push({ id: 'c3', name: 'Cy', updatedAt: 30 })
    await phone.write(edited)
    const theirs = await tablet.payloadOf(PHONE)
    expect(theirs?.contactStore.contacts).toHaveLength(3)
    requests(server)

    const merged = payloadFor(TABLET)
    merged.contactStore.contacts.push({ id: 'c3', name: 'Cy', updatedAt: 30 })
    await tablet.write(merged)
    expect(requests(server)).toEqual([])

    await phone.transport.deleteFile(filenameForSlot(PHONE))
    await tablet.read()
    expect(tablet.pushes).toHaveBeenCalled()
    requests(server)
    await tablet.write(merged)
    expect(requests(server)).toEqual(['POST sync/changes/put'])
    const [sent] = server.tail('family', TABLET)
    expect(
      openChange(SYNC_KEY, fromB64u(sent.blob), {
        accountId: ACCOUNT_ID,
        slotId: TABLET,
        changeId: sent.changeId,
      })
    ).toMatchObject({
      records: { 'contactStore/contacts': [{ id: 'c3' }] },
    })
  })
})

describe('record changes: what a device reads', () => {
  const pair = async (stores?: { phone?: Stores; tablet?: Stores }) => {
    const server = createFakeSyncServer()
    const phone = device(server, PHONE, { stores: stores?.phone })
    const tablet = device(server, TABLET, { stores: stores?.tablet })
    const payload = payloadFor(PHONE)
    await phone.write(payload)
    await tablet.write(payloadFor(TABLET))
    return { server, phone, tablet, payload }
  }
  const edit = async (
    phone: ReturnType<typeof device>,
    payload: Payload,
    name: string
  ) => {
    payload.contactStore.contacts[1] = { id: 'c2', name, updatedAt: 12 }
    payload.writtenAt += 1_000
    await phone.write(payload)
  }

  it('reads each base once, then only the changes', async () => {
    const { server, phone, tablet, payload } = await pair()
    requests(server)
    expect(await tablet.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual([
      'POST sync/changes/list',
      'POST sync/get',
    ])

    await edit(phone, payload, 'Benjamin')
    requests(server)
    const files = await tablet.read()
    expect(requests(server)).toEqual(['POST sync/changes/list'])
    const theirs = files.find((f) => f.filename === filenameForSlot(PHONE))!
    expect(JSON.parse(theirs.json)).toEqual(payload)
    expect(theirs.modifiedAt).toBe(server.tail('family', PHONE)[0].createdAt)
    expect(files.find((f) => f.filename === filenameForSlot(TABLET))).toEqual({
      filename: filenameForSlot(TABLET),
      json: '',
      modifiedAt: server.slotUpdatedAt('family', TABLET),
    })
    expect(tablet.onCatchUp).toHaveBeenLastCalledWith({
      requestedAt: null,
      photos: true,
    })
  })

  it('gets a change on the open socket with no request', async () => {
    const { server, phone, tablet, payload } = await pair()
    await tablet.connect()
    await tablet.read()
    requests(server)
    tablet.remote.mockClear()

    await edit(phone, payload, 'Benjamin')
    await vi.waitFor(() => expect(tablet.remote).toHaveBeenCalledTimes(1))
    requests(server)
    expect(await tablet.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual([])
    expect(tablet.transport.lastSeq()).toBe(server.seq())
  })

  it('launches with nothing new over the socket alone', async () => {
    const stores = memoryStores()
    const { server, phone, payload } = await pair({ tablet: stores })
    await device(server, TABLET, { stores }).read()
    await edit(phone, payload, 'Benjamin')
    await device(server, TABLET, { stores }).read()
    requests(server)

    const relaunched = device(server, TABLET, { stores })
    const live = await relaunched.connect()
    expect(await relaunched.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual([])
    expect(live.asked).toEqual([server.seq()])
  })

  it('waits for a socket that is connecting, then asks over it', async () => {
    const { server, tablet, payload } = await pair()
    requests(server)
    const live = server.openSocket('family', TABLET)
    live.onMessage = (message) =>
      tablet.transport.liveMessage(message, live.send)
    tablet.transport.liveEvent('connecting')
    const reading = tablet.payloadOf(PHONE)
    server.hello(live)
    expect(await reading).toEqual(payload)
    expect(requests(server)).toEqual(['POST sync/get'])
    expect(live.asked).toEqual([0])
  })

  it('catches up over HTTP after the socket closes', async () => {
    const { server, phone, tablet, payload } = await pair()
    await tablet.connect()
    await tablet.read()
    tablet.transport.liveEvent('closed')
    await edit(phone, payload, 'Benjamin')
    requests(server)
    expect(await tablet.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual(['POST sync/changes/list'])
  })

  it('asks the new socket after the old one was replaced without closing', async () => {
    const { server, phone, tablet, payload } = await pair()
    const old = await tablet.connect()
    await tablet.read()
    await edit(phone, payload, 'Benjamin')
    old.close()
    const asked = old.asked.length
    tablet.transport.liveEvent('connecting')
    expect(tablet.transport.changeStats().subscribed).toBe(false)
    const next = server.openSocket('family', TABLET)
    next.onMessage = (message) =>
      tablet.transport.liveMessage(message, next.send)
    requests(server)
    const reading = tablet.payloadOf(PHONE)
    server.hello(next)
    expect(await reading).toEqual(payload)
    expect(requests(server)).toEqual([])
    expect(old.asked).toHaveLength(asked)
    expect(next.asked.length).toBeGreaterThan(0)
  })

  it('catches up when a notice says something else changed', async () => {
    const { server, phone, tablet } = await pair()
    const live = await tablet.connect()
    await tablet.read()
    const rebuilt = { ...payloadFor(PHONE), resetEpoch: { id: 'e2' } }
    await phone.write(rebuilt)
    requests(server)
    expect(await tablet.payloadOf(PHONE)).toEqual(rebuilt)
    expect(requests(server)).toEqual(['POST sync/get'])
    expect(live.asked).toHaveLength(2)
  })

  it('rebuilds a slot from its stored base and changes at the next launch', async () => {
    const stores = memoryStores()
    const { server, phone, payload } = await pair({ tablet: stores })
    const tablet = device(server, TABLET, { stores })
    await tablet.read()
    await edit(phone, payload, 'Benjamin')
    await tablet.read()
    await edit(phone, payload, 'Benjamin F.')
    requests(server)

    const relaunched = device(server, TABLET, { stores })
    expect(await relaunched.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual(['POST sync/changes/list'])
  })

  it('pages a long catch-up', async () => {
    const { server, phone, tablet, payload } = await pair()
    await tablet.read()
    server.state.changePageSize = 2
    for (const name of ['B1', 'B2', 'B3', 'B4', 'B5'])
      await edit(phone, payload, name)
    requests(server)
    expect(await tablet.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual([
      'POST sync/changes/list',
      'POST sync/changes/list',
      'POST sync/changes/list',
    ])
  })

  it('reads the base again when it was replaced, not when it was folded', async () => {
    const { server, phone, tablet, payload } = await pair()
    await tablet.read()
    await edit(phone, payload, 'Benjamin')
    await tablet.read()

    for (let n = 0; n < RECORD_CHANGE_LIMITS.foldTailChanges; n++)
      await edit(phone, payload, `Ben ${n}`)
    expect(phone.transport.wantsCompaction?.()).toBe(true)
    await tablet.read()
    requests(server)
    await phone.write(payload, true)
    expect(requests(server)).toEqual(['POST sync/put'])
    expect(server.state.basePuts.at(-1)).toEqual({
      slotId: PHONE,
      covers: server.floor('family', PHONE),
    })
    expect(server.tail('family', PHONE)).toEqual([])
    expect(phone.transport.wantsCompaction?.()).toBe(false)

    expect(await tablet.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual(['POST sync/changes/list'])

    const laptop = device(server, LAPTOP)
    expect(await laptop.payloadOf(PHONE)).toEqual(payload)

    await edit(phone, payload, 'After the fold')
    expect(await tablet.payloadOf(PHONE)).toEqual(payload)
    expect(await laptop.payloadOf(PHONE)).toEqual(payload)
  })

  it('folds a long stored tail into its own stored base', async () => {
    const stores = memoryStores()
    const { server, phone, payload } = await pair({ tablet: stores })
    const tablet = device(server, TABLET, { stores })
    await tablet.read()
    for (let n = 0; n < RECORD_CHANGE_LIMITS.localFoldChanges + 3; n++) {
      await edit(phone, payload, `Ben ${n}`)
      await tablet.read()
    }
    expect(stores.slots.get(PHONE)?.etag).toMatch(/^local\./)
    expect(JSON.parse(stores.values.get(`t:${PHONE}`)!)).toHaveLength(3)
    requests(server)

    const relaunched = device(server, TABLET, { stores })
    expect(await relaunched.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual(['POST sync/changes/list'])
  })

  it('starts over when what it stored is gone', async () => {
    const stores = memoryStores()
    const { server, phone, payload } = await pair({ tablet: stores })
    await device(server, TABLET, { stores }).read()
    await edit(phone, payload, 'Benjamin')
    await device(server, TABLET, { stores }).read()
    stores.slots.clear()
    requests(server)

    const relaunched = device(server, TABLET, { stores })
    expect(await relaunched.payloadOf(PHONE)).toEqual(payload)
    expect(requests(server)).toEqual([
      'POST sync/changes/list',
      'POST sync/get',
    ])
  })

  it('shows a slot with a change from a newer version as newer', async () => {
    const { server, tablet } = await pair()
    await tablet.read()
    const changeId = toB64u(new Uint8Array(16).fill(9))
    const blob = sealChange(
      SYNC_KEY,
      { v: 99, anything: true },
      { accountId: ACCOUNT_ID, slotId: PHONE, changeId },
      new Uint8Array(24).fill(3)
    )
    await server.fetch('https://api.test/accounts/v1/sync/changes/put', {
      method: 'POST',
      headers: { authorization: 'Bearer family' },
      body: JSON.stringify({ slotId: PHONE, changeId, blob: toB64u(blob) }),
    })
    const files = await tablet.read()
    const theirs = files.find((f) => f.filename === filenameForSlot(PHONE))!
    expect(JSON.parse(theirs.json)).toEqual({
      version: Number.MAX_SAFE_INTEGER,
    })
  })

  it('sends its base again after another device deleted its slot', async () => {
    const { server, phone, tablet, payload } = await pair()
    await phone.read()
    await tablet.transport.deleteFile(filenameForSlot(PHONE))
    const files = await phone.read()
    expect(files.map((f) => f.filename)).toEqual([filenameForSlot(TABLET)])
    requests(server)
    await phone.write(payload)
    expect(requests(server)).toEqual(['POST sync/put'])
  })

  it('reads a base an older app put, and folds for it', async () => {
    vi.useFakeTimers()
    const { server, phone, tablet, payload } = await pair()
    await tablet.read()
    const old = device(server, LAPTOP, { overrides: { changes: () => false } })
    const theirs = payloadFor(LAPTOP)
    await old.write(theirs)
    await old.read()
    expect(server.state.snapshotReaders).toBe(true)
    expect(await tablet.payloadOf(LAPTOP)).toEqual(theirs)

    await edit(phone, payload, 'Benjamin')
    expect(phone.pushes).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(RECORD_CHANGE_LIMITS.snapshotReaderFoldMs)
    expect(phone.pushes).toHaveBeenCalledTimes(1)
    requests(server)
    await phone.write(payload, true)
    expect(requests(server)).toEqual(['POST sync/put'])
    expect(await old.payloadOf(PHONE)).toEqual(payload)
  })

  it('goes back to snapshots when the server turns changes off', async () => {
    const { server, phone, tablet, payload } = await pair()
    await tablet.read()
    server.state.changes = false
    payload.contactStore.contacts[0].name = 'Ada L.'
    requests(server)
    await phone.write(payload)
    expect(requests(server)).toEqual([
      'POST sync/changes/put',
      'POST sync/changes/put',
      'POST sync/put',
    ])
    expect(phone.onChangesRefused).toHaveBeenCalledTimes(1)

    expect(await tablet.payloadOf(PHONE)).toEqual(payload)
    expect(tablet.onChangesRefused).toHaveBeenCalledTimes(1)
  })

  it('deletes a signed-out browser’s slot only once it merged all of it', async () => {
    const { server, phone, tablet } = await pair()
    server.setSlotPlatform('family', PHONE, 'web')
    server.endSlotSession('family', PHONE)
    const files = await tablet.read()
    const merged = new Map(files.map((f) => [f.filename, f.modifiedAt]))

    const edited = payloadFor(PHONE)
    edited.contactStore.contacts[0].name = 'Ada L.'
    await phone.write(edited)
    server.endSlotSession('family', PHONE)
    expect(await tablet.transport.deleteEndedWebSnapshots!(merged)).toEqual([])

    const again = await tablet.read()
    expect(
      await tablet.transport.deleteEndedWebSnapshots!(
        new Map(again.map((f) => [f.filename, f.modifiedAt]))
      )
    ).toEqual([filenameForSlot(PHONE)])
    expect(server.slotIds('family')).toEqual([TABLET])
    expect(tablet.pushes).toHaveBeenCalled()
  })
})
