import { beforeEach, describe, expect, it, vi } from 'vitest'

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  files: [] as SyncFile[],
  pending: [] as string[],
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('react-native-mmkv', () => ({ MMKV: class {} }))
vi.mock('expo-device', () => ({ modelName: 'iPad' }))
vi.mock('@/lib/installId', () => ({ getOrCreateInstallId: () => 'ipad' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('../../modules/icloud-bridge', () => ({
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter((f) => include(f.filename)),
    pending: runtime.pending.filter(include),
  })),
  write: vi.fn(async () => 1),
  deleteFile: vi.fn(async () => {}),
}))

const claim = (filename: string, accountId: string, updatedAt: number) => ({
  filename,
  modifiedAt: updatedAt,
  json: JSON.stringify({ v: 1, accountId, entitled: true, updatedAt }),
})

beforeEach(() => {
  vi.clearAllMocks()
  runtime.files = []
  runtime.pending = []
})

describe('readAccountFile', () => {
  it('canonicalizes a winning conflict duplicate', async () => {
    runtime.files = [claim('witness-work-account 2.json', 'phone', 2)]
    const { readAccountFile } = await import('./account')
    const bridge = await import('../../modules/icloud-bridge')

    expect(await readAccountFile()).toMatchObject({ pending: false })
    expect(bridge.write).toHaveBeenCalledWith(
      'witness-work-account.json',
      expect.stringContaining('"accountId":"phone"')
    )
  })

  it('leaves the files alone while one is still downloading', async () => {
    // The canonical file downloading may be newer than the duplicate we read.
    runtime.files = [claim('witness-work-account 2.json', 'phone', 2)]
    runtime.pending = ['witness-work-account.json']
    const { readAccountFile } = await import('./account')
    const bridge = await import('../../modules/icloud-bridge')

    expect(await readAccountFile()).toMatchObject({
      file: { accountId: 'phone' },
      pending: true,
    })
    expect(bridge.write).not.toHaveBeenCalled()
    expect(bridge.deleteFile).not.toHaveBeenCalled()
  })
})
