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
