import { beforeEach, describe, expect, it } from 'vitest'
import { utf8 } from '@/lib/bytes'
import { derivePhotoKeys } from '@/lib/syncTransport/server/photoCrypto'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'
import { noteImageIdFromFilename } from '@/lib/syncTransport/imageNames'
import type { SealKeys } from '@/lib/syncTransport/sealed/sealCrypto'
import {
  isLockedPlaceholder,
  isSealedPhotoName,
  readAdvert,
} from '@/lib/syncTransport/sealed/sealedFiles'
import {
  createSealedTransport,
  type SealingEvent,
} from '@/lib/syncTransport/sealed/sealedTransport'
import { SEALING_QUIET_DEVICE_MS } from '@/lib/syncTransport/sealed/sealingGate'
import { SyncTransportError } from '@/lib/syncTransport/types'
import {
  createMemoryFolder,
  type LocalFiles,
  type MemoryFolder,
  memoryTransport,
} from './memoryFolder'

const keysFor = (fill: number): SealKeys => {
  const accountKey = new Uint8Array(32).fill(fill)
  return {
    syncKey: deriveSyncKey(accountKey),
    photoKeys: derivePhotoKeys(accountKey),
  }
}

let folder: MemoryFolder

type DeviceOptions = {
  key?: number | null
  older?: number[]
  switchOn?: boolean
}

function device(name: string, options: DeviceOptions = {}) {
  const state = {
    key: options.key === undefined ? 1 : options.key,
    older: options.older ?? [],
    switchOn: options.switchOn ?? true,
  }
  const local: LocalFiles = new Map()
  const events: SealingEvent[] = []
  const remembered = new Set<string>()
  let scratch = 0
  const own = `witness-work-${name}.json`
  const transport = createSealedTransport(memoryTransport(folder, local), {
    keyring: async () =>
      state.key === null
        ? null
        : { current: keysFor(state.key), older: state.older.map(keysFor) },
    sealingSwitch: () => state.switchOn,
    remembered: {
      has: (identity) => remembered.has(identity ?? ''),
      add: (identity) => remembered.add(identity ?? ''),
    },
    files: {
      read: async (path) => {
        const bytes = local.get(path)
        if (!bytes) throw new Error(`no ${path}`)
        return bytes
      },
      write: async (path, bytes) => void local.set(path, bytes),
      remove: async (path) => void local.delete(path),
      tempPath: () => `scratch/${name}/${scratch++}`,
    },
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    now: folder.now,
    deviceName: () => name,
    platform: 'ios',
    ownFilename: () => own,
    onEvent: (event) => events.push(event),
  })
  const pull = () =>
    transport.readFiles(
      (filename) => filename !== 'witness-work-account.json',
      {
        listOnly: (filename) => filename === own,
      }
    )
  const push = (contacts: string[]) =>
    transport.write(
      own,
      JSON.stringify({ version: 1, deviceId: name, contacts })
    )
  const read = async (deviceName: string) => {
    const { files } = await pull()
    return files.find((f) => f.filename === `witness-work-${deviceName}.json`)
  }
  const types = () => events.map((event) => event.type)
  return { name, own, state, local, events, transport, pull, push, read, types }
}

function oldBuild(name: string) {
  const own = `witness-work-${name}.json`
  const inner = memoryTransport(folder, new Map())
  return {
    own,
    inner,
    push: (contacts: string[]) =>
      inner.write(
        own,
        JSON.stringify({ version: 1, deviceId: name, contacts })
      ),
  }
}

const corrupt = (json: string) => {
  const at = json.length - 6
  return `${json.slice(0, at)}${json[at] === 'A' ? 'B' : 'A'}${json.slice(at + 1)}`
}

const contactsOf = (json: string | undefined) =>
  json ? (JSON.parse(json) as { contacts: string[] }).contacts : undefined

beforeEach(() => {
  folder = createMemoryFolder()
})

describe('a plaintext folder', () => {
  it('advertises this device’s key in its plaintext file until it can seal', async () => {
    const phone = device('phone')
    const ipad = oldBuild('ipad')
    await ipad.push(['Ana'])
    await phone.pull()
    await phone.push(['Ben'])
    const written = folder.json.get(phone.own)!.json
    expect(readAdvert(written)?.key).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(folder.names()).toEqual([
      'witness-work-ipad.json',
      'witness-work-phone.json',
    ])
    expect(phone.transport.status()).toMatchObject({
      state: 'plain',
      waitingFor: 'devices',
      holdups: [{ filename: 'witness-work-ipad.json', reason: 'update' }],
    })
  })

  it('advertises no key while this device has none, and never seals', async () => {
    const phone = device('phone', { key: null })
    await phone.pull()
    await phone.push(['Ben'])
    expect(readAdvert(folder.json.get(phone.own)!.json)).toEqual({ key: null })
    expect(phone.transport.status()).toMatchObject({ waitingFor: 'key' })
  })

  it('waits while the remote switch is off', async () => {
    const phone = device('phone', { switchOn: false })
    await phone.pull()
    await phone.push(['Ben'])
    expect(folder.names()).toEqual(['witness-work-phone.json'])
    expect(phone.transport.status()).toMatchObject({ waitingFor: 'switch' })
  })

  it('waits for a recent device on another account', async () => {
    const phone = device('phone', { key: 1 })
    const tablet = device('tablet', { key: 2, switchOn: false })
    await tablet.pull()
    await tablet.push(['Cy'])
    await phone.pull()
    await phone.push(['Ben'])
    expect(phone.transport.status()).toMatchObject({
      holdups: [
        { filename: 'witness-work-tablet.json', reason: 'other-account' },
      ],
    })
    expect(folder.names()).not.toContain('witness-work-phone.sealed.json')
  })

  it('needs a fresh read of every device file, not the account file’s read', async () => {
    const phone = device('phone')
    oldBuild('ipad').push(['Ana'])
    await phone.transport.readFiles((n) => n === 'witness-work-account.json')
    await phone.push(['Ben'])
    expect(folder.names()).not.toContain('witness-work-phone.sealed.json')
  })
})

describe('switching a folder to sealed', () => {
  it('seals, reads back, then deletes the plaintext copy', async () => {
    const phone = device('phone')
    await phone.pull()
    await phone.push(['Ana Silva'])
    await phone.pull()
    await phone.push(['Ana Silva'])
    expect(folder.names()).toEqual(['witness-work-phone.sealed.json'])
    expect(folder.everything()).not.toContain('Ana Silva')
    expect(phone.types()).toContain('started')
    expect(phone.types()).toContain('completed')
    expect(phone.transport.status()).toEqual({
      state: 'sealed',
      otherAccount: false,
    })
  })

  it('ignores devices quiet for 30 days', async () => {
    const phone = device('phone')
    await oldBuild('ipad').push(['Ana'])
    folder.advance(SEALING_QUIET_DEVICE_MS + 1)
    await phone.pull()
    await phone.push(['Ben'])
    expect(folder.names()).toContain('witness-work-phone.sealed.json')
    expect(folder.names()).not.toContain('witness-work-phone.json')
  })

  it('keeps writing plaintext when the read-back doesn’t check out', async () => {
    const phone = device('phone')
    await phone.pull()
    folder.hooks.onRead = (name, json) =>
      name.endsWith('.sealed.json') ? corrupt(json) : json
    await phone.push(['Ana'])
    expect(folder.names()).toEqual(['witness-work-phone.json'])
    expect(contactsOf(folder.json.get(phone.own)!.json)).toEqual(['Ana'])
    expect(phone.events).toContainEqual(
      expect.objectContaining({ type: 'failed', step: 'verify' })
    )
    expect(phone.types()).not.toContain('completed')
  })

  it('keeps writing plaintext when the sealed write fails', async () => {
    const phone = device('phone')
    await phone.pull()
    folder.hooks.failWrite = (name) =>
      name.endsWith('.sealed.json') ? new SyncTransportError('network') : null
    await phone.push(['Ana'])
    expect(folder.names()).toEqual(['witness-work-phone.json'])
    expect(phone.events).toContainEqual({
      type: 'failed',
      step: 'write',
      code: 'network',
    })
  })

  it('keeps the plaintext when its delete fails, and finishes on the next push', async () => {
    const phone = device('phone', { switchOn: false })
    await phone.pull()
    await phone.push(['Ana'])
    phone.state.switchOn = true
    folder.hooks.failDelete = () => new SyncTransportError('network')
    await phone.pull()
    await phone.push(['Ana'])
    expect(folder.names()).toEqual([
      'witness-work-phone.json',
      'witness-work-phone.sealed.json',
    ])
    folder.hooks.failDelete = null
    await phone.pull()
    await phone.push(['Ana', 'Ben'])
    expect(folder.names()).toEqual(['witness-work-phone.sealed.json'])
  })
})

describe('a sealed folder', () => {
  async function sealedPair() {
    const phone = device('phone')
    const ipad = device('ipad')
    await phone.pull()
    await phone.push(['Ana'])
    await ipad.pull()
    await ipad.push(['Ben'])
    await phone.pull()
    await phone.push(['Ana'])
    await ipad.pull()
    await ipad.push(['Ben'])
    return { phone, ipad }
  }

  it('syncs between devices on the same account', async () => {
    const { phone, ipad } = await sealedPair()
    expect(folder.names()).toEqual([
      'witness-work-ipad.sealed.json',
      'witness-work-phone.sealed.json',
    ])
    expect(contactsOf((await phone.read('ipad'))?.json)).toEqual(['Ben'])
    expect(contactsOf((await ipad.read('phone'))?.json)).toEqual(['Ana'])
  })

  it('leaves the account file in plaintext, where old builds read it', async () => {
    const { phone } = await sealedPair()
    const account = JSON.stringify({ v: 1, accountId: 'rc-1', updatedAt: 1 })
    await phone.transport.write('witness-work-account.json', account)
    expect(folder.json.get('witness-work-account.json')?.json).toBe(account)
    expect(folder.names()).not.toContain('witness-work-account.sealed.json')
    const { files } = await phone.transport.readFiles(
      (filename) => filename === 'witness-work-account.json'
    )
    expect(files.map((f) => f.json)).toEqual([account])
  })

  it('shows sealed files to old builds as a newer version, which they skip', async () => {
    await sealedPair()
    for (const { json } of folder.json.values())
      expect((JSON.parse(json) as { version: number }).version).toBe(
        Number.MAX_SAFE_INTEGER
      )
  })

  it('still reads an old build’s plaintext, so its changes aren’t lost', async () => {
    const { phone } = await sealedPair()
    await oldBuild('mini').push(['Cy'])
    expect(contactsOf((await phone.read('mini'))?.json)).toEqual(['Cy'])
  })

  it('locks files under another account’s key, and never deletes them', async () => {
    await sealedPair()
    const stranger = device('stranger', { key: 9 })
    const before = folder.names()
    const file = await stranger.read('phone')
    expect(isLockedPlaceholder(file!.json)).toBe(true)
    await stranger.push(['Dee'])
    expect(folder.names()).toEqual(
      [...before, 'witness-work-stranger.sealed.json'].sort()
    )
    expect(stranger.transport.status()).toEqual({
      state: 'sealed',
      otherAccount: true,
    })
  })

  it('locks every file for a device with no key, and holds its writes', async () => {
    await sealedPair()
    const fresh = device('fresh', { key: null })
    expect(isLockedPlaceholder((await fresh.read('phone'))!.json)).toBe(true)
    await expect(fresh.push(['Dee'])).rejects.toMatchObject({
      code: 'unauthorized',
    })
    expect(folder.names()).not.toContain('witness-work-fresh.json')
  })

  it('falls back to a device’s plaintext copy when its sealed one won’t open', async () => {
    const { phone } = await sealedPair()
    folder.put(
      'witness-work-ipad.json',
      JSON.stringify({ contacts: ['Old'] }),
      1
    )
    folder.hooks.onRead = (name, json) =>
      name === 'witness-work-ipad.sealed.json' ? corrupt(json) : json
    expect(contactsOf((await phone.read('ipad'))?.json)).toEqual(['Old'])
  })

  it('reads the newer copy when a device went back to an old build', async () => {
    const { phone } = await sealedPair()
    await oldBuild('ipad').push(['Newer'])
    expect(contactsOf((await phone.read('ipad'))?.json)).toEqual(['Newer'])
  })

  it('keeps sealing after a reset, whatever the switch says', async () => {
    const { phone } = await sealedPair()
    phone.state.switchOn = false
    await phone.transport.deleteAll()
    await phone.push(['Ana'])
    expect(folder.names()).toEqual(['witness-work-phone.sealed.json'])
  })

  it('seals a quiet device’s plaintext under its name, then deletes it', async () => {
    await oldBuild('gone').push(['Old friend'])
    folder.advance(SEALING_QUIET_DEVICE_MS + 1)
    const phone = device('phone')
    await phone.pull()
    await phone.push(['Ana'])
    await phone.pull()
    await phone.push(['Ana'])
    expect(folder.names()).toEqual([
      'witness-work-gone.sealed.json',
      'witness-work-phone.sealed.json',
    ])
    expect(folder.everything()).not.toContain('Old friend')
    expect(contactsOf((await device('ipad').read('gone'))?.json)).toEqual([
      'Old friend',
    ])
  })

  it('keeps a quiet device’s plaintext that changed while it was sealed', async () => {
    await oldBuild('gone').push(['Old'])
    folder.advance(SEALING_QUIET_DEVICE_MS + 1)
    const phone = device('phone')
    await phone.pull()
    await phone.push(['Ana'])
    await phone.pull()
    folder.hooks.onRead = (name, json) => {
      if (name === 'witness-work-gone.sealed.json')
        folder.put(
          'witness-work-gone.json',
          JSON.stringify({ contacts: ['Back'] })
        )
      return json
    }
    await phone.push(['Ana'])
    folder.hooks.onRead = null
    expect(folder.names()).toContain('witness-work-gone.json')
    expect(contactsOf((await phone.read('gone'))?.json)).toEqual(['Back'])
  })
})

describe('an account key change', () => {
  it('reads files under the old key and writes its own under the new one', async () => {
    const phone = device('phone', { key: 1 })
    const ipad = device('ipad', { key: 1 })
    await phone.pull()
    await phone.push(['Ana'])
    await ipad.pull()
    await ipad.push(['Ben'])
    await phone.pull()
    await phone.push(['Ana'])
    expect(folder.names()).toContain('witness-work-phone.sealed.json')
    phone.state.key = 2
    phone.state.older = [1]
    expect(contactsOf((await phone.read('ipad'))?.json)).toEqual(['Ben'])
    await phone.push(['Ana', 'Cy'])
    expect(isLockedPlaceholder((await ipad.read('phone'))!.json)).toBe(true)
    ipad.state.key = 2
    ipad.state.older = [1]
    expect(contactsOf((await ipad.read('phone'))?.json)).toEqual(['Ana', 'Cy'])
  })
})

describe('restoring', () => {
  it('reads an old plaintext folder, then seals it', async () => {
    await oldBuild('lost-phone').push(['Ana'])
    folder.advance(SEALING_QUIET_DEVICE_MS * 3)
    const fresh = device('fresh')
    expect(contactsOf((await fresh.read('lost-phone'))?.json)).toEqual(['Ana'])
    await fresh.push(['Ana'])
    await fresh.pull()
    await fresh.push(['Ana'])
    expect(folder.names()).toEqual([
      'witness-work-fresh.sealed.json',
      'witness-work-lost-phone.sealed.json',
    ])
  })

  it('restores a sealed folder on a new device with the same account key', async () => {
    const phone = device('phone')
    await phone.pull()
    await phone.push(['Ana'])
    await phone.pull()
    await phone.push(['Ana'])
    const fresh = device('fresh')
    expect(contactsOf((await fresh.read('phone'))?.json)).toEqual(['Ana'])
  })
})

describe('photos', () => {
  const photo = utf8('a contact photo '.repeat(1_000))
  const filename = 'witness-work-img-contact-abc--r1.jpg'

  async function sealedPhone() {
    const phone = device('phone')
    await phone.pull()
    await phone.push([])
    return phone
  }

  it('go up sealed under a name that hides the filename', async () => {
    const phone = await sealedPhone()
    phone.local.set('file:///docs/a.jpg', photo)
    await phone.transport.writeBinary(filename, 'file:///docs/a.jpg')
    const [name] = folder.photoNames()
    expect(isSealedPhotoName(name)).toBe(true)
    expect(name).not.toContain('contact')
    expect(noteImageIdFromFilename(name)).toBeNull()
    expect(folder.everything()).not.toContain('a contact photo')
    expect(await phone.transport.listBinaryFiles()).toEqual([
      expect.objectContaining({ filename }),
    ])
    const ipad = device('ipad')
    await ipad.transport.readBinary(filename, 'file:///docs/b.jpg')
    expect(ipad.local.get('file:///docs/b.jpg')).toEqual(photo)
    expect([...phone.local.keys()].some((k) => k.startsWith('scratch'))).toBe(
      false
    )
  })

  it('stay plaintext while the folder is', async () => {
    const phone = device('phone', { switchOn: false })
    await phone.pull()
    await phone.push([])
    phone.local.set('file:///docs/a.jpg', photo)
    await phone.transport.writeBinary(filename, 'file:///docs/a.jpg')
    expect(folder.photoNames()).toEqual([filename])
  })

  it('move from plaintext after a read-back, and delete both copies on delete', async () => {
    folder.binaries.set(filename, { bytes: photo, modifiedAt: 1 })
    const phone = await sealedPhone()
    await phone.transport.migratePhotos!(() => false)
    expect(folder.photoNames()).toHaveLength(1)
    expect(isSealedPhotoName(folder.photoNames()[0])).toBe(true)
    expect(phone.events).toContainEqual({
      type: 'photos',
      sealed: 1,
      failed: 0,
      remaining: 0,
    })
    await phone.transport.readBinary(filename, 'file:///docs/c.jpg')
    expect(phone.local.get('file:///docs/c.jpg')).toEqual(photo)
    await phone.transport.deleteBinaryFile(filename)
    expect(folder.photoNames()).toEqual([])
  })

  it('keep the plaintext copy when moving fails', async () => {
    folder.binaries.set(filename, { bytes: photo, modifiedAt: 1 })
    const phone = await sealedPhone()
    folder.hooks.failWrite = (name) =>
      isSealedPhotoName(name) ? new SyncTransportError('network') : null
    await phone.transport.migratePhotos!(() => false)
    expect(folder.photoNames()).toEqual([filename])
    expect(phone.events).toContainEqual({
      type: 'photos',
      sealed: 0,
      failed: 1,
      remaining: 1,
    })
  })

  it('don’t move while the switch is off', async () => {
    folder.binaries.set(filename, { bytes: photo, modifiedAt: 1 })
    const phone = await sealedPhone()
    phone.state.switchOn = false
    await phone.transport.migratePhotos!(() => false)
    expect(folder.photoNames()).toEqual([filename])
  })

  it('open under an older key after a key change', async () => {
    const phone = await sealedPhone()
    phone.local.set('file:///docs/a.jpg', photo)
    await phone.transport.writeBinary(filename, 'file:///docs/a.jpg')
    const changed = device('changed', { key: 2, older: [1] })
    expect(await changed.transport.listBinaryFiles()).toEqual([
      expect.objectContaining({ filename }),
    ])
    await changed.transport.readBinary(filename, 'file:///docs/d.jpg')
    expect(changed.local.get('file:///docs/d.jpg')).toEqual(photo)
  })
})
