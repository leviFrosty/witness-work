import { describe, expect, it, vi } from 'vitest'
import {
  KEEP_FILES,
  keepGuestPage,
  loadedFiles,
} from '@/lib/webOffline/guestWorker'

const ORIGIN = 'https://app.witnesswork.app'

function worker(state: string) {
  const listeners: (() => void)[] = []
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (_type: 'statechange', listener: () => void) =>
      void listeners.push(listener),
    become(next: string) {
      this.state = next
      listeners.forEach((listener) => listener())
    },
  }
}

const container = (registration: {
  installing: ReturnType<typeof worker> | null
  active: ReturnType<typeof worker> | null
}) => ({
  register: vi.fn(async () => ({
    waiting: null,
    addEventListener: () => {},
    ...registration,
  })),
})

describe('loadedFiles', () => {
  it('names this origin’s chunks and assets by path, and nothing else', () => {
    expect(
      loadedFiles(
        [
          { name: `${ORIGIN}/_expo/static/js/web/index-abc.js` },
          { name: `${ORIGIN}/_expo/static/js/web/index-abc.js` },
          { name: `${ORIGIN}/assets/fonts/Inter.abc.ttf` },
          { name: `${ORIGIN}/assets/a.png?x=1` },
          { name: `${ORIGIN}/launch-splash.js` },
          { name: `${ORIGIN}/territories/guest` },
          { name: 'https://api.witnesswork.app/spaces/v1/guest/sync' },
          { name: 'https://elsewhere.example/assets/a.js' },
        ],
        ORIGIN
      )
    ).toEqual([
      '/_expo/static/js/web/index-abc.js',
      '/assets/fonts/Inter.abc.ttf',
    ])
  })
})

describe('keepGuestPage', () => {
  const files = ['/_expo/static/js/web/index-abc.js']

  it('registers under the guest path only', async () => {
    const page = container({ installing: null, active: worker('activated') })
    await keepGuestPage(page, '/sw.js', '/territories/guest', () => files)
    expect(page.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/territories/guest',
      updateViaCache: 'none',
    })
  })

  it('names the loaded files once a first worker is active', async () => {
    const installing = worker('installing')
    await keepGuestPage(
      container({ installing, active: null }),
      '/sw.js',
      '/territories/guest',
      () => files
    )
    expect(installing.postMessage).not.toHaveBeenCalled()
    installing.become('installed')
    expect(installing.postMessage).not.toHaveBeenCalled()
    installing.become('activated')
    expect(installing.postMessage).toHaveBeenCalledWith({
      type: KEEP_FILES,
      urls: files,
    })
  })

  it('names them at once to a worker from an earlier visit, and again when asked', async () => {
    const active = worker('activated')
    const kept = await keepGuestPage(
      container({ installing: null, active }),
      '/sw.js',
      '/territories/guest',
      () => files
    )
    expect(active.postMessage).toHaveBeenCalledTimes(1)
    kept.keep()
    expect(active.postMessage).toHaveBeenCalledTimes(2)
  })
})
