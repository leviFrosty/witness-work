import { describe, expect, it, vi } from 'vitest'
import type { ImageSyncDeps } from '@/app/sync/imageSync'
import {
  gcNoteImages,
  NOTE_IMAGE_CLOUD_GRACE_MS,
  pullNoteImages,
  pushNoteImages,
} from '@/app/sync/noteImageSync'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const path = (id: string) => `file:///docs/note-images/${id}.jpg`

const makeDeps = (
  files: { filename: string; modifiedAt: number }[] = [],
  local: Record<string, number> = {},
  overrides: Partial<ImageSyncDeps> = {}
): ImageSyncDeps => ({
  bridge: {
    writeBinary: vi.fn(async () => 1000),
    readBinary: vi.fn(async () => 1000),
    listBinaryFiles: vi.fn(async () => files),
    deleteBinaryFile: vi.fn(async () => {}),
  },
  fs: { getModifiedAt: vi.fn(async (p: string) => local[p] ?? null) },
  now: () => NOTE_IMAGE_CLOUD_GRACE_MS * 10,
  ...overrides,
})

describe('pushNoteImages', () => {
  it('uploads photos the cloud does not have, once', async () => {
    const deps = makeDeps(
      [{ filename: `witness-work-note-${B}.jpg`, modifiedAt: 1 }],
      { [path(A)]: 500, [path(B)]: 500 }
    )
    const result = await pushNoteImages({
      ids: [A, B],
      localPath: path,
      bookkeeping: {},
      deps,
    })
    expect(deps.bridge.writeBinary).toHaveBeenCalledExactlyOnceWith(
      `witness-work-note-${A}.jpg`,
      path(A)
    )
    expect(result.uploaded).toBe(1)
    expect(
      result.bookkeeping[`witness-work-note-${A}.jpg`]?.uploadedMtime
    ).toBe(500)
  })

  it('asks before putting back a photo it saw there that another device deleted', async () => {
    const note = `witness-work-note-${A}.jpg`
    const putsAgain = vi.fn(() => false)
    const listed = [{ filename: note, modifiedAt: 7 }]
    const deps = makeDeps(listed, { [path(A)]: 500 }, { putsAgain })
    // Downloaded or seen there: recorded, so its absence reads as a deletion.
    const local: Record<string, number> = {}
    const download = makeDeps(listed, local, { putsAgain })
    vi.mocked(download.bridge.readBinary).mockImplementation(async () => {
      local[path(A)] = 600
      return 7
    })
    const pulled = await pullNoteImages({
      ids: [A],
      localPath: path,
      deps: download,
      prepare: async () => {},
    })
    expect(pulled.seen[note]).toEqual({
      localMtime: 600,
      uploadedMtime: 600,
      containerMtime: 7,
    })
    const seen = await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: {},
      deps,
    })
    expect(seen.bookkeeping[note]).toMatchObject({ containerMtime: 7 })
    // Nothing new to record: the same bookkeeping back.
    const again = await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: seen.bookkeeping,
      deps,
    })
    expect(again.bookkeeping).toBe(seen.bookkeeping)

    listed.length = 0
    await pushNoteImages({
      ids: [A, B],
      localPath: path,
      bookkeeping: seen.bookkeeping,
      deps: makeDeps([], { [path(A)]: 500, [path(B)]: 500 }, { putsAgain }),
    })
    expect(putsAgain).toHaveBeenCalledExactlyOnceWith(note)
  })

  it("doesn't ask about a deleted photo this device no longer has", async () => {
    const note = `witness-work-note-${A}.jpg`
    const putsAgain = vi.fn(() => true)
    const deps = makeDeps([], {}, { putsAgain })
    const result = await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: {
        [note]: { localMtime: 500, uploadedMtime: 500, containerMtime: 7 },
      },
      deps,
    })
    expect(putsAgain).not.toHaveBeenCalled()
    expect(deps.bridge.writeBinary).not.toHaveBeenCalled()
    expect(result.uploaded).toBe(0)
  })

  it("skips another device's photo that isn't on this one", async () => {
    const deps = makeDeps([], {})
    const result = await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: {},
      deps,
    })
    expect(deps.bridge.writeBinary).not.toHaveBeenCalled()
    expect(result.uploaded).toBe(0)
  })

  it('backs off after a failed upload', async () => {
    const deps = makeDeps([], { [path(A)]: 500 })
    vi.mocked(deps.bridge.writeBinary).mockRejectedValueOnce(new Error('nope'))
    const first = await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: {},
      deps,
    })
    expect(first.failed).toBe(1)
    await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: first.bookkeeping,
      deps,
    })
    expect(deps.bridge.writeBinary).toHaveBeenCalledOnce()
  })
})

describe('pullNoteImages', () => {
  it('downloads referenced photos missing here and in the cloud', async () => {
    const prepare = vi.fn(async () => {})
    const deps = makeDeps(
      [{ filename: `witness-work-note-${A}.jpg`, modifiedAt: 1 }],
      {}
    )
    const result = await pullNoteImages({
      ids: [A, B],
      localPath: path,
      deps,
      prepare,
    })
    expect(prepare).toHaveBeenCalledOnce()
    expect(deps.bridge.readBinary).toHaveBeenCalledExactlyOnceWith(
      `witness-work-note-${A}.jpg`,
      path(A)
    )
    expect(result.downloaded).toEqual([A])
  })

  it('leaves photos that are already here alone', async () => {
    const deps = makeDeps(
      [{ filename: `witness-work-note-${A}.jpg`, modifiedAt: 1 }],
      { [path(A)]: 1 }
    )
    const result = await pullNoteImages({
      ids: [A],
      localPath: path,
      deps,
      prepare: async () => {},
    })
    expect(deps.bridge.listBinaryFiles).not.toHaveBeenCalled()
    expect(result.downloaded).toEqual([])
  })

  it('counts a failed download and keeps going', async () => {
    const deps = makeDeps(
      [
        { filename: `witness-work-note-${A}.jpg`, modifiedAt: 1 },
        { filename: `witness-work-note-${B}.jpg`, modifiedAt: 1 },
      ],
      {}
    )
    vi.mocked(deps.bridge.readBinary).mockRejectedValueOnce(new Error('late'))
    const result = await pullNoteImages({
      ids: [A, B],
      localPath: path,
      deps,
      prepare: async () => {},
    })
    expect(result.failed).toBe(1)
    expect(result.downloaded).toHaveLength(1)
  })
})

describe('gcNoteImages', () => {
  it('deletes unreferenced note photos past the grace period only', async () => {
    const now = NOTE_IMAGE_CLOUD_GRACE_MS * 10
    const deps = makeDeps([
      { filename: `witness-work-note-${A}.jpg`, modifiedAt: 0 },
      { filename: `witness-work-note-${B}.jpg`, modifiedAt: now - 1000 },
      { filename: 'witness-work-img-contact-x.jpg', modifiedAt: 0 },
      { filename: `witness-work-note-${'c'.repeat(8)}.jpg`, modifiedAt: 0 },
    ])
    const result = await gcNoteImages({
      referenced: new Set(['c'.repeat(8)]),
      deps,
    })
    expect(result.deleted).toEqual([`witness-work-note-${A}.jpg`])
  })

  it('stops when asked', async () => {
    const deps = makeDeps([
      { filename: `witness-work-note-${A}.jpg`, modifiedAt: 0 },
    ])
    const result = await gcNoteImages({
      referenced: new Set(),
      deps,
      shouldStop: () => true,
    })
    expect(result).toEqual({ deleted: [], stopped: true })
    expect(deps.bridge.deleteBinaryFile).not.toHaveBeenCalled()
  })
})

describe('pushNoteImages on a full Cloud Sync account', () => {
  const full = {
    [`witness-work-note-${A}.jpg`]: {
      localMtime: 500,
      uploadedMtime: null,
      lastError: 'storage_full',
      errorCode: 'storage-full',
      failedAt: NOTE_IMAGE_CLOUD_GRACE_MS * 10,
      failures: 3,
    },
  }

  it('retries only on foreground or room, never on an edit', async () => {
    const deps = makeDeps([], { [path(A)]: 500 }, { fullRetriesOnSignal: true })
    const edit = await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: full,
      deps,
      trigger: 'store-edit',
    })
    expect(edit.uploaded).toBe(0)
    const foreground = await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: full,
      deps,
      trigger: 'foreground',
    })
    expect(foreground.uploaded).toBe(1)
  })

  it('keeps iCloud and Drive on the backoff', async () => {
    const deps = makeDeps([], { [path(A)]: 500 })
    const result = await pushNoteImages({
      ids: [A],
      localPath: path,
      bookkeeping: full,
      deps,
      trigger: 'foreground',
    })
    expect(result.uploaded).toBe(0)
  })
})
