import { describe, expect, it, vi } from 'vitest'
import {
  currentBuild,
  reloadForMissingChunk,
  type StaleChunkEnv,
} from '@/lib/webOffline/staleChunk'

const URL_ = 'https://app.witnesswork.app/_expo/static/js/web/es-ES-abc.js'

function setup(status: number | null, offline = false) {
  let stored: string | null = null
  const env = {
    probe: vi.fn(async () => status),
    isOffline: () => offline,
    reload: vi.fn(),
    onReload: vi.fn(),
    guard: {
      read: () => stored,
      write: (value: string) => {
        stored = value
      },
      now: () => 1000,
      build: () => 'index-aaa.js',
    },
  } satisfies StaleChunkEnv
  return env
}

describe('reloadForMissingChunk', () => {
  it('reloads once when the server no longer has the chunk', async () => {
    const env = setup(404)
    expect(await reloadForMissingChunk(URL_, env)).toBe(true)
    expect(env.reload).toHaveBeenCalledTimes(1)
    expect(env.onReload).toHaveBeenCalledWith(URL_)
    // The same build again: no loop.
    expect(await reloadForMissingChunk(URL_, env)).toBe(false)
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload while offline, or when the server did not answer', async () => {
    const offline = setup(404, true)
    expect(await reloadForMissingChunk(URL_, offline)).toBe(false)
    expect(offline.probe).not.toHaveBeenCalled()
    const silent = setup(null)
    expect(await reloadForMissingChunk(URL_, silent)).toBe(false)
    expect(silent.reload).not.toHaveBeenCalled()
  })

  it('does not reload for a chunk the server has or for a server error', async () => {
    for (const status of [200, 500, 503]) {
      const env = setup(status)
      expect(await reloadForMissingChunk(URL_, env)).toBe(false)
      expect(env.reload).not.toHaveBeenCalled()
    }
  })
})

describe('currentBuild', () => {
  it('names the build after its entry chunk', () => {
    const doc = {
      querySelectorAll: () => [
        { src: 'https://app.witnesswork.app/_expo/static/js/web/index-9f.js' },
      ],
    }
    expect(currentBuild(doc)).toBe('index-9f.js')
    expect(currentBuild({ querySelectorAll: () => [] })).toBe('unknown')
  })
})
