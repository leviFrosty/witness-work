import { describe, expect, it, vi } from 'vitest'
import { createKeyRetiredHub } from '@/lib/serverAccount/keyRetiredHub'

describe('retired keys', () => {
  it('waits for each listener', async () => {
    const hub = createKeyRetiredHub(vi.fn())
    const heard: string[] = []
    hub.subscribe(async (pub) => {
      await Promise.resolve()
      heard.push(pub)
    })
    await hub.emit('pub-1', 5, { held: false })
    expect(heard).toEqual(['pub-1'])
  })

  it('keeps what it heard before anything listened, for the first listener', async () => {
    const hub = createKeyRetiredHub(vi.fn())

    const kept = hub.emit('pub-1', 5, { held: true })
    const listener = vi.fn()
    hub.subscribe(listener)
    await kept
    expect(listener).toHaveBeenCalledExactlyOnceWith('pub-1', 5, {
      held: true,
    })
    const later = vi.fn()
    hub.subscribe(later)
    await Promise.resolve()
    expect(later).not.toHaveBeenCalled()
  })

  it('settles what it kept only once the first listener has handled it', async () => {
    const hub = createKeyRetiredHub(vi.fn())
    let delivered = false
    const kept = hub.emit('pub-1', 5, { held: true }).then(() => {
      delivered = true
    })
    await Promise.resolve()
    expect(delivered).toBe(false)
    let handled!: () => void
    hub.subscribe(() => new Promise<void>((resolve) => (handled = resolve)))
    await Promise.resolve()
    expect(delivered).toBe(false)
    handled()
    await kept
    expect(delivered).toBe(true)
  })

  it('reports a listener that throws, and still tells the others', async () => {
    const onError = vi.fn()
    const hub = createKeyRetiredHub(onError)
    const boom = new Error('boom')
    const other = vi.fn()
    hub.subscribe(() => {
      throw boom
    })
    hub.subscribe(other)
    await hub.emit('pub-1', null, { held: false })
    expect(onError).toHaveBeenCalledWith(boom)
    expect(other).toHaveBeenCalled()
  })
})
