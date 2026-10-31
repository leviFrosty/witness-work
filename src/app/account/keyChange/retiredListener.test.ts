import { describe, expect, it, vi } from 'vitest'
import { createKeyRetiredHub } from '@/lib/serverAccount/keyRetiredHub'
import { createRetiredKeyListener } from './retiredListener'

describe('listening for retired keys', () => {
  it('hands a browser’s launch event, heard before the app loaded, to the handler as held', async () => {
    const hub = createKeyRetiredHub(vi.fn())
    const handle = vi.fn(async () => 'signedOut' as const)
    // `start()` hears it first; the app's handling installs later.
    const settled = hub.emit('pub-1', 77, { held: true })
    const listen = createRetiredKeyListener({
      onKeyRetired: hub.subscribe,
      handle,
      warn: vi.fn(),
    })
    listen()
    await settled
    expect(handle).toHaveBeenCalledExactlyOnceWith('pub-1', 77, {
      held: true,
    })
  })

  it('listens once, however often installing runs', async () => {
    const hub = createKeyRetiredHub(vi.fn())
    const handle = vi.fn(async () => 'ignored' as const)
    const listen = createRetiredKeyListener({
      onKeyRetired: hub.subscribe,
      handle,
      warn: vi.fn(),
    })
    listen()
    listen()
    await hub.emit('pub-1', null, { held: false })
    expect(handle).toHaveBeenCalledTimes(1)
  })

  it('warns, rather than throws, when handling fails', async () => {
    const hub = createKeyRetiredHub(vi.fn())
    const warn = vi.fn()
    const listen = createRetiredKeyListener({
      onKeyRetired: hub.subscribe,
      handle: vi.fn(async () => {
        throw new Error('unreadable')
      }),
      warn,
    })
    listen()
    await hub.emit('pub-1', null, { held: true })
    expect(warn).toHaveBeenCalled()
  })
})
