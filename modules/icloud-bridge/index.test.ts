import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  native: null as Record<string, unknown> | null,
}))

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  requireOptionalNativeModule: () => runtime.native,
}))

const file = (filename: string) => ({ filename, json: '{}', modifiedAt: 1 })
const isAccountFile = (filename: string) =>
  filename.startsWith('witness-work-account')

beforeEach(() => {
  vi.resetModules()
})

describe('readFiles', () => {
  it('asks native to read only the matching files', async () => {
    const readFilesNative = vi.fn(async (filenames: string[]) => ({
      files: filenames.map(file),
      pending: [],
    }))
    runtime.native = {
      listFiles: async () => [
        'witness-work-phone.json',
        'witness-work-account.json',
        'witness-work-account 2.json',
      ],
      readFiles: readFilesNative,
      readAll: vi.fn(),
    }
    const { readFiles } = await import('./index')

    const read = await readFiles(isAccountFile)

    // Reading marks a file observed natively, so the phone's data file must
    // never reach native from the account reader.
    expect(readFilesNative).toHaveBeenCalledWith([
      'witness-work-account.json',
      'witness-work-account 2.json',
    ])
    expect(read.files.map((f) => f.filename)).toEqual([
      'witness-work-account.json',
      'witness-work-account 2.json',
    ])
  })

  it('skips the native read when nothing matches', async () => {
    const readFilesNative = vi.fn()
    runtime.native = {
      listFiles: async () => ['witness-work-phone.json'],
      readFiles: readFilesNative,
    }
    const { readFiles } = await import('./index')

    expect(await readFiles(isAccountFile)).toEqual({ files: [], pending: [] })
    expect(readFilesNative).not.toHaveBeenCalled()
  })

  it('falls back to readAll on binaries without readFiles', async () => {
    runtime.native = {
      readAll: async () => [
        file('witness-work-phone.json'),
        file('witness-work-account.json'),
      ],
    }
    const { readFiles } = await import('./index')

    // Old `readAll` drops still-downloading files without saying so.
    expect(await readFiles(isAccountFile)).toEqual({
      files: [file('witness-work-account.json')],
      pending: null,
    })
  })
})
