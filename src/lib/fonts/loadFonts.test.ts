import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({
  os: 'ios',
  loaded: new Set<string>(),
  files: new Set<string>(),
  loadAsync: vi.fn(async () => {}),
  copyAsync: vi.fn(),
  failCopy: false,
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return env.os
    },
  },
}))
vi.mock('expo-font', () => ({
  isLoaded: (family: string) => env.loaded.has(family),
  loadAsync: env.loadAsync,
}))
vi.mock('expo-asset', () => ({
  Asset: {
    fromModule: (module: number) => ({
      hash: `hash${module}`,
      type: 'ttf',
      localUri: `file:///bundle-store/old/assets/font${module}.ttf`,
      downloadAsync: async () => {},
    }),
  },
}))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: async (path: string) => ({ exists: env.files.has(path) }),
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }: { from: string; to: string }) => {
    if (env.failCopy) throw new Error('disk full')
    env.copyAsync(from)
    env.files.add(to)
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    env.files.delete(from)
    env.files.add(to)
  },
}))

async function load(fonts: Record<string, number>) {
  const { loadFonts } = await import('@/lib/fonts/loadFonts')
  return loadFonts(fonts)
}

describe('loadFonts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('__DEV__', false)
    env.os = 'ios'
    env.loaded.clear()
    env.files.clear()
    env.failCopy = false
    env.loadAsync.mockClear()
    env.copyAsync.mockClear()
  })

  it('registers iOS fonts from a copy outside the update bundle', async () => {
    await load({ Inter: 1, InterBold: 2 })

    expect(env.loadAsync).toHaveBeenCalledWith({
      Inter: { uri: 'file:///documents/fonts/hash1.ttf' },
      InterBold: { uri: 'file:///documents/fonts/hash2.ttf' },
    })
    expect(env.copyAsync).toHaveBeenCalledTimes(2)
  })

  it('reuses a copy made on an earlier launch', async () => {
    env.files.add('file:///documents/fonts/hash1.ttf')

    await load({ Inter: 1 })

    expect(env.copyAsync).not.toHaveBeenCalled()
    expect(env.loadAsync).toHaveBeenCalledWith({
      Inter: { uri: 'file:///documents/fonts/hash1.ttf' },
    })
  })

  it('copies a file once when two families share it', async () => {
    await load({ Inter: 1, Inter_500Medium: 1 })

    expect(env.copyAsync).toHaveBeenCalledTimes(1)
  })

  it('skips families that are already registered', async () => {
    env.loaded.add('Inter')

    await load({ Inter: 1 })

    expect(env.loadAsync).not.toHaveBeenCalled()
  })

  it('falls back to the bundled file when the copy fails', async () => {
    env.failCopy = true

    await load({ Inter: 1 })

    expect(env.loadAsync).toHaveBeenCalledWith({ Inter: 1 })
  })

  it('loads the bundled file directly on Android', async () => {
    env.os = 'android'

    await load({ Inter: 1 })

    expect(env.loadAsync).toHaveBeenCalledWith({ Inter: 1 })
    expect(env.copyAsync).not.toHaveBeenCalled()
  })
})
