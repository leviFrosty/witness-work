import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { driveKit } from './driveTestKit'

// The Drive app data folder as a sync transport: one copy per name,
// copy-on-write JSON, cached downloads, incomplete reads, polling for other
// devices' writes, and photo binaries.

const runtime = vi.hoisted(() => ({
  appState: 'active' as string,
  appStateListeners: [] as Array<(state: string) => void>,
}))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appStateListeners.push(listener)
      return { remove: () => {} }
    },
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
// The production transport instance reads preferences; these tests build
// their own from the factory.
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({}) },
}))
vi.mock('@/lib/syncTransport/googleDrive/googleDriveAuth', () => ({
  addGoogleDriveAvailabilityListener: () => ({ remove: () => {} }),
  googleDriveAccessToken: vi.fn(),
  googleDriveOrigin: () => 'https://www.googleapis.com',
  isGoogleDriveConnected: () => true,
}))

const { createGoogleDriveTransport, POLL_INTERVAL_MS } = await import(
  '@/lib/syncTransport/googleDrive/googleDriveTransport'
)

const setup = (account = 'acct') => {
  const kit = driveKit()
  const api = kit.api(account)
  const transport = createGoogleDriveTransport({
    api: () => api,
    isConnected: () => true,
    accountToken: () => `hash-${account}`,
    addAvailabilityListener: () => ({ remove: () => {} }),
  })
  return { ...kit, transport, account }
}

const all = () => true
const downloads = (kit: ReturnType<typeof setup>) =>
  kit.drive.log.filter(
    (r) => r.method === 'GET' && r.path.startsWith('/drive/v3/files/')
  ).length

beforeEach(() => {
  runtime.appState = 'active'
  runtime.appStateListeners = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('JSON files', () => {
  it('writes copy-on-write, so Drive never keeps old revisions', async () => {
    const kit = setup()
    await kit.transport.write('witness-work-d1.json', '{"v":1}')
    await kit.transport.write('witness-work-d1.json', '{"v":2}')
    expect(kit.drive.files(kit.account).map((f) => f.name)).toEqual([
      'witness-work-d1.json',
    ])
    expect(kit.drive.text(kit.account, 'witness-work-d1.json')).toBe('{"v":2}')
    expect(kit.drive.log.some((r) => r.method === 'PATCH')).toBe(false)
    const { files, pending } = await kit.transport.readFiles(all)
    expect(files.map((f) => f.json)).toEqual(['{"v":2}'])
    expect(pending).toEqual([])
  })

  it('presents the newest of duplicate names and removes the rest on write', async () => {
    const kit = setup()
    // Two devices claimed the account file at the same moment.
    kit.drive.put(kit.account, 'witness-work-account.json', '{"by":"a"}')
    kit.drive.put(kit.account, 'witness-work-account.json', '{"by":"b"}')
    const { files } = await kit.transport.readFiles(all)
    expect(files).toEqual([
      expect.objectContaining({
        filename: 'witness-work-account.json',
        json: '{"by":"b"}',
      }),
    ])
    await kit.transport.write('witness-work-account.json', '{"by":"c"}')
    expect(
      kit.drive.files(kit.account).map((f) => f.content.length)
    ).toHaveLength(1)
    expect(kit.drive.text(kit.account, 'witness-work-account.json')).toBe(
      '{"by":"c"}'
    )
  })

  it('downloads each copy once', async () => {
    const kit = setup()
    kit.drive.put(kit.account, 'witness-work-phone.json', '{}')
    await kit.transport.readFiles(all)
    await kit.transport.readFiles(all)
    expect(downloads(kit)).toBe(1)
  })

  it('reads only the names the caller includes, and only sync files', async () => {
    const kit = setup()
    kit.drive.put(kit.account, 'witness-work-phone.json', '{"p":1}')
    kit.drive.put(kit.account, 'witness-work-account.json', '{"a":1}')
    kit.drive.put(kit.account, 'other.json', '{}')
    const { files } = await kit.transport.readFiles(
      (name) => !name.startsWith('witness-work-account')
    )
    expect(files.map((f) => f.filename)).toEqual(['witness-work-phone.json'])
  })

  it('lists a file it could not download as pending', async () => {
    const kit = setup()
    kit.drive.put(kit.account, 'witness-work-phone.json', '{"p":1}')
    kit.drive.put(kit.account, 'witness-work-tablet.json', '{"t":1}')
    for (let i = 0; i < 3; i++)
      kit.drive.failNext(
        (r) =>
          r.url.includes('alt=media') &&
          r.url.includes(kit.drive.files(kit.account)[0].id),
        503
      )
    const { files, pending } = await kit.transport.readFiles(all)
    expect(files.map((f) => f.filename)).toEqual(['witness-work-phone.json'])
    expect(pending).toEqual(['witness-work-tablet.json'])
  })

  it('deletes every copy of a name, and deleteAll leaves photos', async () => {
    const kit = setup()
    kit.drive.put(kit.account, 'witness-work-a.json', '{}')
    kit.drive.put(kit.account, 'witness-work-a.json', '{}')
    kit.drive.put(kit.account, 'witness-work-b.json', '{}')
    kit.drive.put(kit.account, 'witness-work-img-profile.jpg', 'x')
    await kit.transport.deleteFile('witness-work-a.json')
    expect(
      kit.drive
        .files(kit.account)
        .map((f) => f.name)
        .sort()
    ).toEqual(['witness-work-b.json', 'witness-work-img-profile.jpg'])
    await kit.transport.deleteAll()
    expect(kit.drive.files(kit.account).map((f) => f.name)).toEqual([
      'witness-work-img-profile.jpg',
    ])
  })

  it('rejects names outside the sync namespace', async () => {
    const kit = setup()
    await expect(kit.transport.write('notes.json', '{}')).rejects.toThrow()
    await expect(
      kit.transport.write('witness-work-../x.json', '{}')
    ).rejects.toThrow()
  })

  it('confirms the upload with the write', async () => {
    const kit = setup()
    expect(kit.transport.writeConfirmsUpload).toBe(true)
    expect(kit.transport.supportsUploadStatus()).toBe(false)
    await expect(kit.transport.waitForInitialScan(5000)).resolves.toBe(true)
  })

  it('serializes writes to one name', async () => {
    const kit = setup()
    await Promise.all([
      kit.transport.write('witness-work-d1.json', '{"v":1}'),
      kit.transport.write('witness-work-d1.json', '{"v":2}'),
      kit.transport.write('witness-work-d1.json', '{"v":3}'),
    ])
    expect(kit.drive.files(kit.account)).toHaveLength(1)
    expect(kit.drive.text(kit.account, 'witness-work-d1.json')).toBe('{"v":3}')
  })
})

describe('remote changes', () => {
  it('announces another device’s write once, and never this device’s own', async () => {
    const kit = setup()
    const listener = vi.fn()
    const sub = kit.transport.addRemoteChangeListener(listener)
    await kit.transport.write('witness-work-me.json', '{}')
    await kit.transport.poll()
    expect(listener).not.toHaveBeenCalled()

    const theirs = kit.drive.put(kit.account, 'witness-work-phone.json', '{}')
    await kit.transport.poll()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith({ modifiedAt: theirs.modifiedAt })
    // Still unread, but already announced.
    await kit.transport.poll()
    expect(listener).toHaveBeenCalledTimes(1)

    await kit.transport.readFiles(all)
    kit.drive.put(kit.account, 'witness-work-phone.json', '{"newer":1}')
    await kit.transport.poll()
    expect(listener).toHaveBeenCalledTimes(2)
    sub.remove()
  })

  it('announces a file again after a read could not download it', async () => {
    const kit = setup()
    const listener = vi.fn()
    kit.transport.addRemoteChangeListener(listener)
    kit.drive.put(kit.account, 'witness-work-phone.json', '{}')
    await kit.transport.poll()
    expect(listener).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 3; i++)
      kit.drive.failNext((r) => r.url.includes('alt=media'), 503)
    expect((await kit.transport.readFiles(all)).pending).toEqual([
      'witness-work-phone.json',
    ])
    await kit.transport.poll()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('ignores photo uploads', async () => {
    const kit = setup()
    const listener = vi.fn()
    kit.transport.addRemoteChangeListener(listener)
    kit.drive.put(kit.account, 'witness-work-img-profile.jpg', 'x')
    await kit.transport.poll()
    expect(listener).not.toHaveBeenCalled()
  })

  it('polls only while the app is in the foreground', async () => {
    vi.useFakeTimers()
    const kit = setup()
    const listener = vi.fn()
    kit.transport.addRemoteChangeListener(listener)
    kit.drive.put(kit.account, 'witness-work-phone.json', '{}')
    runtime.appState = 'background'
    runtime.appStateListeners.forEach((l) => l('background'))
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    expect(listener).not.toHaveBeenCalled()

    runtime.appState = 'active'
    runtime.appStateListeners.forEach((l) => l('active'))
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 10)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('photos', () => {
  it('uploads, lists and downloads a binary', async () => {
    const kit = setup()
    kit.local.set('/doc/contact-c1.jpg', new Uint8Array([9, 8, 7]))
    const name = 'witness-work-img-contact-c1--r1.jpg'
    const modifiedAt = await kit.transport.writeBinary(
      name,
      '/doc/contact-c1.jpg'
    )
    expect(await kit.transport.listBinaryFiles()).toEqual([
      { filename: name, modifiedAt },
    ])
    expect(await kit.transport.readBinary(name, '/doc/synced.jpg')).toBe(
      modifiedAt
    )
    expect([...kit.local.get('/doc/synced.jpg')!]).toEqual([9, 8, 7])
  })

  it('re-uploads into the same file rather than adding a copy', async () => {
    const kit = setup()
    kit.local.set('/doc/p.jpg', new Uint8Array([1]))
    const name = 'witness-work-img-profile--r1.jpg'
    await kit.transport.writeBinary(name, '/doc/p.jpg')
    await kit.transport.writeBinary(name, '/doc/p.jpg')
    expect(kit.drive.files(kit.account)).toHaveLength(1)
  })

  it('creates the photo again when the copy it knew of was deleted elsewhere', async () => {
    const kit = setup()
    kit.local.set('/doc/p.jpg', new Uint8Array([1]))
    const name = 'witness-work-img-profile--r1.jpg'
    await kit.transport.writeBinary(name, '/doc/p.jpg')
    // Another device's cleanup removes it behind this device's back.
    for (const file of kit.drive.files(kit.account))
      await kit.drive.fetch(`${kit.drive.origin}/drive/v3/files/${file.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer fake:${kit.account}` },
      })
    await kit.transport.writeBinary(name, '/doc/p.jpg')
    expect(kit.drive.files(kit.account).map((f) => f.name)).toEqual([name])
  })

  it('treats an empty binary as absent and a missing one as not found', async () => {
    const kit = setup()
    kit.drive.put(kit.account, 'witness-work-img-profile.jpg', '')
    expect(await kit.transport.listBinaryFiles()).toEqual([])
    await expect(
      kit.transport.readBinary('witness-work-img-profile.jpg', '/doc/x.jpg')
    ).rejects.toMatchObject({ code: 'not-found' })
  })

  it('deleteAllBinaries leaves JSON files', async () => {
    const kit = setup()
    kit.drive.put(kit.account, 'witness-work-img-profile.jpg', 'x')
    kit.drive.put(kit.account, 'witness-work-d1.json', '{}')
    await kit.transport.deleteAllBinaries()
    expect(kit.drive.files(kit.account).map((f) => f.name)).toEqual([
      'witness-work-d1.json',
    ])
  })
})

describe('account identity', () => {
  it('keeps a queued write on the account it was made under', async () => {
    const kit = setup()
    const signedIn = { account: 'a' }
    const boundTo: Array<string | null> = []
    const transport = createGoogleDriveTransport({
      api: (account) => {
        boundTo.push(account)
        return kit.api(account === 'hash-a' ? 'a' : 'b')
      },
      isConnected: () => true,
      accountToken: () => `hash-${signedIn.account}`,
      addAvailabilityListener: () => ({ remove: () => {} }),
    })
    const first = transport.write('witness-work-d1.json', '{"v":1}')
    const queued = transport.write('witness-work-d1.json', '{"v":2}')
    signedIn.account = 'b'
    await Promise.all([first, queued])
    expect(boundTo).toEqual(['hash-a', 'hash-a'])
  })

  it('starts over with another account’s folder', async () => {
    const kit = setup()
    const signedIn = { account: 'a' }
    const transport = createGoogleDriveTransport({
      api: () => kit.api(signedIn.account),
      isConnected: () => true,
      accountToken: () => `hash-${signedIn.account}`,
      addAvailabilityListener: () => ({ remove: () => {} }),
    })
    await transport.write('witness-work-d1.json', '{"a":1}')
    signedIn.account = 'b'
    await transport.write('witness-work-d1.json', '{"b":1}')
    expect(kit.drive.text('a', 'witness-work-d1.json')).toBe('{"a":1}')
    expect(kit.drive.text('b', 'witness-work-d1.json')).toBe('{"b":1}')
    expect(kit.drive.log.some((r) => r.method === 'DELETE')).toBe(false)
  })

  it('compares the stored account by value', () => {
    const { transport } = setup('acct')
    expect(transport.identityToken()).toBe('hash-acct')
    expect(transport.identityTokenMatches('hash-acct')).toBe(true)
    expect(transport.identityTokenMatches('hash-other')).toBe(false)
  })

  it('fails writes once a full Google account rejects them', async () => {
    const kit = setup()
    kit.drive.setQuota(kit.account, 1)
    await expect(
      kit.transport.write('witness-work-d1.json', '{"big":true}')
    ).rejects.toMatchObject({ code: 'storage-full' })
  })
})
