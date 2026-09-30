import { describe, expect, it, vi } from 'vitest'
import {
  pushAllImages,
  pullMissingImages,
  gcOrphanImages,
  ImageSyncDeps,
} from '@/app/sync/imageSync'

const makeDeps = (overrides: Partial<ImageSyncDeps> = {}): ImageSyncDeps => ({
  bridge: {
    writeBinary: vi.fn(async () => 1000),
    readBinary: vi.fn(async () => 1000),
    listBinaryFiles: vi.fn(async () => []),
    deleteBinaryFile: vi.fn(async () => {}),
    ...(overrides.bridge ?? {}),
  },
  fs: {
    getModifiedAt: vi.fn(async () => 500),
    ...(overrides.fs ?? {}),
  },
  now: () => 0,
  ...overrides,
})

describe('pushAllImages', () => {
  it('stops starting uploads when transfer authority is revoked mid-pass', async () => {
    let allowed = true
    const deps = makeDeps({ canTransfer: () => allowed })
    vi.mocked(deps.bridge.writeBinary).mockImplementationOnce(async () => {
      allowed = false
      return 1000
    })
    await pushAllImages({
      sources: ['a', 'b'].map((id) => ({
        kind: 'contact',
        id,
        localPath: `file:///docs/contact-${id}-avatar.jpg`,
      })),
      bookkeeping: {},
      deps,
      trigger: 'foreground',
    })
    expect(deps.bridge.writeBinary).toHaveBeenCalledOnce()
  })
  it('uploads a contact avatar that has never been uploaded before', async () => {
    const deps = makeDeps()
    const result = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {},
      deps,
      trigger: 'store-edit',
    })

    expect(deps.bridge.writeBinary).toHaveBeenCalledTimes(1)
    expect(deps.bridge.writeBinary).toHaveBeenCalledWith(
      'witness-work-img-contact-abc.jpg',
      'file:///docs/contact-abc-avatar.jpg'
    )
    expect(result.uploaded).toBe(1)
    expect(result.bookkeeping['witness-work-img-contact-abc.jpg']).toEqual({
      localMtime: 500,
      uploadedMtime: 500,
      containerMtime: 1000,
    })
  })

  it('skips a source whose local file matches the last uploaded mtime', async () => {
    const deps = makeDeps()
    vi.mocked(deps.bridge.listBinaryFiles).mockResolvedValue([
      { filename: 'witness-work-img-contact-abc.jpg', modifiedAt: 500 },
    ])
    const result = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {
        'witness-work-img-contact-abc.jpg': {
          localMtime: 500,
          uploadedMtime: 500,
        },
      },
      deps,
      trigger: 'store-edit',
    })

    expect(deps.bridge.writeBinary).not.toHaveBeenCalled()
    expect(result.uploaded).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('re-uploads a source whose local mtime is newer than the last upload', async () => {
    const deps = makeDeps({
      fs: { getModifiedAt: vi.fn(async () => 800) },
    })
    const result = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {
        'witness-work-img-contact-abc.jpg': {
          localMtime: 500,
          uploadedMtime: 500,
        },
      },
      deps,
      trigger: 'store-edit',
    })

    expect(deps.bridge.writeBinary).toHaveBeenCalledTimes(1)
    expect(result.uploaded).toBe(1)
    expect(result.bookkeeping['witness-work-img-contact-abc.jpg']).toEqual({
      localMtime: 800,
      uploadedMtime: 800,
      containerMtime: 1000,
    })
  })

  it('records a transient failure and retries on the next push', async () => {
    const writeBinary = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(2000)
    const deps = makeDeps({
      bridge: {
        writeBinary,
        readBinary: vi.fn(),
        listBinaryFiles: vi.fn(async () => []),
        deleteBinaryFile: vi.fn(),
      },
      now: () => 12345,
    })

    // First push — fails.
    const first = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {},
      deps,
      trigger: 'store-edit',
    })

    expect(first.failed).toBe(1)
    expect(first.uploaded).toBe(0)
    const entryAfterFail = first.bookkeeping['witness-work-img-contact-abc.jpg']
    expect(entryAfterFail.uploadedMtime).toBeNull()
    expect(entryAfterFail.failedAt).toBe(12345)
    expect(entryAfterFail.lastError).toBeDefined()

    // Second push — retries and succeeds.
    const second = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: first.bookkeeping,
      deps,
      trigger: 'store-edit',
    })

    expect(second.uploaded).toBe(1)
    expect(writeBinary).toHaveBeenCalledTimes(2)
    const entryAfterSuccess =
      second.bookkeeping['witness-work-img-contact-abc.jpg']
    expect(entryAfterSuccess.uploadedMtime).toBe(500)
    expect(entryAfterSuccess.lastError).toBeUndefined()
    expect(entryAfterSuccess.failedAt).toBeUndefined()
  })

  it('classifies quota failures and does not retry on store-edit pushes', async () => {
    const writeBinary = vi
      .fn()
      .mockRejectedValue(new Error('iCloud quota exceeded'))
    const deps = makeDeps({
      bridge: {
        writeBinary,
        readBinary: vi.fn(),
        listBinaryFiles: vi.fn(async () => []),
        deleteBinaryFile: vi.fn(),
      },
    })

    const first = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {},
      deps,
      trigger: 'store-edit',
    })

    expect(first.failed).toBe(1)
    expect(
      first.bookkeeping['witness-work-img-contact-abc.jpg'].lastError
    ).toMatch(/quota/i)

    // Next store-edit push — should be skipped without attempting writeBinary
    // again. User typing shouldn't spam failing writes against a full iCloud.
    const second = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: first.bookkeeping,
      deps,
      trigger: 'store-edit',
    })

    expect(writeBinary).toHaveBeenCalledTimes(1)
    expect(second.skipped).toBe(1)
    expect(second.uploaded).toBe(0)
    expect(second.failed).toBe(0)
  })

  it('retries a quota-failed entry when triggered by foreground', async () => {
    const writeBinary = vi
      .fn()
      .mockRejectedValueOnce(new Error('iCloud quota exceeded'))
      .mockResolvedValueOnce(3000)
    const deps = makeDeps({
      bridge: {
        writeBinary,
        readBinary: vi.fn(),
        listBinaryFiles: vi.fn(async () => []),
        deleteBinaryFile: vi.fn(),
      },
    })

    const first = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {},
      deps,
      trigger: 'store-edit',
    })
    expect(first.failed).toBe(1)

    // Foreground retry — user may have cleaned up iCloud in Settings, so
    // give it another shot at the same local mtime.
    const second = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: first.bookkeeping,
      deps,
      trigger: 'foreground',
    })

    expect(writeBinary).toHaveBeenCalledTimes(2)
    expect(second.uploaded).toBe(1)
    expect(second.bookkeeping['witness-work-img-contact-abc.jpg']).toEqual({
      localMtime: 500,
      uploadedMtime: 500,
      containerMtime: 3000,
    })
  })

  it('uploads a profile avatar under the profile filename', async () => {
    const deps = makeDeps()
    const result = await pushAllImages({
      sources: [
        { kind: 'profile', localPath: 'file:///docs/profile-avatar.jpg' },
      ],
      bookkeeping: {},
      deps,
      trigger: 'store-edit',
    })

    expect(deps.bridge.writeBinary).toHaveBeenCalledWith(
      'witness-work-img-profile.jpg',
      'file:///docs/profile-avatar.jpg'
    )
    expect(result.uploaded).toBe(1)
    expect(result.bookkeeping['witness-work-img-profile.jpg']).toBeDefined()
  })

  it('silently skips sources whose local file has disappeared', async () => {
    // A contact might reference an image whose file the user has manually
    // cleaned, or whose file was never saved because of an earlier crash.
    // Skipping is safer than marking failure — it keeps bookkeeping clean
    // without blocking the rest of the batch.
    const deps = makeDeps({
      fs: { getModifiedAt: vi.fn(async () => null) },
    })
    const result = await pushAllImages({
      sources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///does/not/exist.jpg',
        },
      ],
      bookkeeping: {},
      deps,
      trigger: 'store-edit',
    })

    expect(deps.bridge.writeBinary).not.toHaveBeenCalled()
    expect(result.uploaded).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.bookkeeping).toEqual({})
  })
})

it('stops starting downloads when photo consent is revoked', async () => {
  let allowed = true
  const deps = makeDeps({ canTransfer: () => allowed })
  vi.mocked(deps.fs.getModifiedAt).mockResolvedValue(null)
  vi.mocked(deps.bridge.listBinaryFiles).mockResolvedValue(
    Array.from({ length: 8 }, (_, i) => ({
      filename: `witness-work-img-contact-${i}.jpg`,
      modifiedAt: 1000,
    }))
  )
  vi.mocked(deps.bridge.readBinary).mockImplementation(async () => {
    allowed = false
    return 1000
  })
  await pullMissingImages({
    expectedSources: Array.from({ length: 8 }, (_, i) => ({
      kind: 'contact',
      id: String(i),
      localPath: `file:///docs/contact-${i}-avatar.jpg`,
    })),
    bookkeeping: {},
    deps,
  })
  expect(deps.bridge.readBinary).toHaveBeenCalledOnce()
})

it('stops cloud cleanup when ongoing transfer access is revoked', async () => {
  let allowed = true
  const deps = makeDeps({
    now: () => 3 * 24 * 60 * 60_000,
    canTransfer: () => allowed,
  })
  vi.mocked(deps.bridge.listBinaryFiles).mockResolvedValue(
    ['a', 'b'].map((id) => ({
      filename: `witness-work-img-contact-${id}.jpg`,
      modifiedAt: 1,
    }))
  )
  vi.mocked(deps.bridge.deleteBinaryFile).mockImplementation(async () => {
    allowed = false
  })
  const result = await gcOrphanImages({
    activeIdentities: [],
    deletions: ['a', 'b'].map((id) => ({
      identity: { kind: 'contact', id },
      deletedAt: 1,
    })),
    deps,
  })
  expect(deps.bridge.deleteBinaryFile).toHaveBeenCalledOnce()
  expect(result.stopped).toBe(true)
})

describe('pullMissingImages', () => {
  it('downloads a contact binary whose marker was merged but has no local copy', async () => {
    const deps = makeDeps({
      bridge: {
        writeBinary: vi.fn(),
        readBinary: vi.fn(async () => 2000),
        listBinaryFiles: vi.fn(async () => [
          { filename: 'witness-work-img-contact-abc.jpg', modifiedAt: 2000 },
        ]),
        deleteBinaryFile: vi.fn(),
      },
      fs: { getModifiedAt: vi.fn(async () => null) },
      now: () => 7777,
    })

    const result = await pullMissingImages({
      expectedSources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {},
      deps,
    })

    expect(deps.bridge.readBinary).toHaveBeenCalledWith(
      'witness-work-img-contact-abc.jpg',
      'file:///docs/contact-abc-avatar.jpg'
    )
    expect(result.downloaded).toHaveLength(1)
    expect(result.downloaded[0]).toEqual({
      kind: 'contact',
      id: 'abc',
      localUri: 'file:///docs/contact-abc-avatar.jpg?t=7777',
    })
  })

  it('skips a source whose container mtime matches the last-downloaded mtime', async () => {
    // Same-generation file: this device previously downloaded the binary,
    // bookkeeping recorded the container mtime, and nothing has changed
    // upstream. No need to re-download.
    const deps = makeDeps({
      bridge: {
        writeBinary: vi.fn(),
        readBinary: vi.fn(),
        listBinaryFiles: vi.fn(async () => [
          { filename: 'witness-work-img-contact-abc.jpg', modifiedAt: 2000 },
        ]),
        deleteBinaryFile: vi.fn(),
      },
    })

    const result = await pullMissingImages({
      expectedSources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {
        'witness-work-img-contact-abc.jpg': {
          localMtime: 0,
          uploadedMtime: null,
          containerMtime: 2000,
        },
      },
      deps,
    })

    expect(deps.bridge.readBinary).not.toHaveBeenCalled()
    expect(result.downloaded).toHaveLength(1)
    expect(result.missing).toHaveLength(0)
  })

  it('redownloads when the container mtime has advanced past the last download', async () => {
    const readBinary = vi.fn(async () => 3000)
    const deps = makeDeps({
      bridge: {
        writeBinary: vi.fn(),
        readBinary,
        listBinaryFiles: vi.fn(async () => [
          { filename: 'witness-work-img-contact-abc.jpg', modifiedAt: 3000 },
        ]),
        deleteBinaryFile: vi.fn(),
      },
    })

    const result = await pullMissingImages({
      expectedSources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {
        'witness-work-img-contact-abc.jpg': {
          localMtime: 0,
          uploadedMtime: null,
          containerMtime: 2000,
        },
      },
      deps,
    })

    expect(readBinary).toHaveBeenCalledTimes(1)
    expect(result.downloaded).toHaveLength(1)
    expect(
      result.bookkeeping['witness-work-img-contact-abc.jpg'].containerMtime
    ).toBe(3000)
  })

  it('reports missing when the expected binary is not in the container', async () => {
    const deps = makeDeps({
      fs: { getModifiedAt: vi.fn(async () => null) },
      bridge: {
        writeBinary: vi.fn(),
        readBinary: vi.fn(),
        listBinaryFiles: vi.fn(async () => []),
        deleteBinaryFile: vi.fn(),
      },
    })

    const result = await pullMissingImages({
      expectedSources: [
        {
          kind: 'contact',
          id: 'abc',
          localPath: 'file:///docs/contact-abc-avatar.jpg',
        },
      ],
      bookkeeping: {},
      deps,
    })

    expect(deps.bridge.readBinary).not.toHaveBeenCalled()
    expect(result.downloaded).toHaveLength(0)
    expect(result.missing).toEqual([{ kind: 'contact', id: 'abc' }])
  })

  it('keeps downloading past a binary that fails, and retries it next time', async () => {
    const deps = makeDeps({
      bridge: {
        writeBinary: vi.fn(),
        // Removed since the listing, say.
        readBinary: vi
          .fn()
          .mockRejectedValueOnce(new Error('ICLOUD_READ_BINARY_MISSING'))
          .mockResolvedValue(3000),
        listBinaryFiles: vi.fn(async () => [
          { filename: 'witness-work-img-contact-bad.jpg', modifiedAt: 3000 },
          { filename: 'witness-work-img-contact-ok.jpg', modifiedAt: 3000 },
        ]),
        deleteBinaryFile: vi.fn(),
      },
    })

    const result = await pullMissingImages({
      expectedSources: [
        {
          kind: 'contact',
          id: 'bad',
          localPath: 'file:///docs/contact-bad-avatar.jpg',
        },
        {
          kind: 'contact',
          id: 'ok',
          localPath: 'file:///docs/contact-ok-avatar.jpg',
        },
      ],
      bookkeeping: {},
      deps,
    })

    expect(result.downloaded).toEqual([
      expect.objectContaining({ kind: 'contact', id: 'ok' }),
    ])
    expect(result.failed).toBe(1)
    expect(result.bookkeeping).not.toHaveProperty(
      'witness-work-img-contact-bad.jpg'
    )
  })
})

describe('gcOrphanImages', () => {
  it('deletes a container binary whose contact is no longer active', async () => {
    const deleteBinaryFile = vi.fn(async () => {})
    const deps = makeDeps({
      bridge: {
        writeBinary: vi.fn(),
        readBinary: vi.fn(),
        listBinaryFiles: vi.fn(async () => [
          { filename: 'witness-work-img-contact-abc.jpg', modifiedAt: 2000 },
          { filename: 'witness-work-img-contact-zzz.jpg', modifiedAt: 2000 },
        ]),
        deleteBinaryFile,
      },
    })

    deps.now = () => 2 * 24 * 60 * 60_000
    const result = await gcOrphanImages({
      // Only contact 'abc' still exists locally — 'zzz' is gone.
      deletions: [
        { identity: { kind: 'contact', id: 'zzz' }, deletedAt: 2000 },
      ],
      activeIdentities: [{ kind: 'contact', id: 'abc' }],
      deps,
    })

    expect(deleteBinaryFile).toHaveBeenCalledTimes(1)
    expect(deleteBinaryFile).toHaveBeenCalledWith(
      'witness-work-img-contact-zzz.jpg'
    )
    expect(result.deleted).toEqual(['witness-work-img-contact-zzz.jpg'])
  })

  it('preserves the profile binary when profile is in the active set', async () => {
    const deleteBinaryFile = vi.fn(async () => {})
    const deps = makeDeps({
      bridge: {
        writeBinary: vi.fn(),
        readBinary: vi.fn(),
        listBinaryFiles: vi.fn(async () => [
          { filename: 'witness-work-img-profile.jpg', modifiedAt: 2000 },
        ]),
        deleteBinaryFile,
      },
    })

    deps.now = () => 2 * 24 * 60 * 60_000
    const result = await gcOrphanImages({
      deletions: [
        { identity: { kind: 'contact', id: 'zzz' }, deletedAt: 2000 },
      ],
      activeIdentities: [{ kind: 'profile' }],
      deps,
    })

    expect(deleteBinaryFile).not.toHaveBeenCalled()
    expect(result.deleted).toEqual([])
  })

  it('does nothing when the container has no binaries', async () => {
    const deps = makeDeps({
      bridge: {
        writeBinary: vi.fn(),
        readBinary: vi.fn(),
        listBinaryFiles: vi.fn(async () => []),
        deleteBinaryFile: vi.fn(),
      },
    })

    deps.now = () => 2 * 24 * 60 * 60_000
    const result = await gcOrphanImages({
      deletions: [
        { identity: { kind: 'contact', id: 'zzz' }, deletedAt: 2000 },
      ],
      activeIdentities: [{ kind: 'contact', id: 'abc' }],
      deps,
    })

    expect(deps.bridge.deleteBinaryFile).not.toHaveBeenCalled()
    expect(result.deleted).toEqual([])
  })
})
