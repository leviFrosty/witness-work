import { describe, expect, it } from 'vitest'
import { onPullToRefresh, pullToRefresh } from '@/lib/pullToRefresh'

const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

describe('pullToRefresh', () => {
  it('runs every listener and settles once they all have', async () => {
    const slow = deferred()
    const ran: string[] = []
    const a = onPullToRefresh(() => {
      ran.push('a')
      return slow.promise
    })
    const b = onPullToRefresh(() => void ran.push('b'))

    let settled = false
    const refresh = pullToRefresh().then(() => (settled = true))
    await Promise.resolve()
    await Promise.resolve()
    expect(ran.sort()).toEqual(['a', 'b'])
    expect(settled).toBe(false)

    slow.resolve()
    await refresh
    expect(settled).toBe(true)
    a.remove()
    b.remove()
  })

  it('keeps refreshing the rest when one listener fails', async () => {
    let ran = false
    const failing = onPullToRefresh(() => {
      throw new Error('offline')
    })
    const rejecting = onPullToRefresh(() => Promise.reject(new Error('down')))
    const ok = onPullToRefresh(() => void (ran = true))

    await expect(pullToRefresh()).resolves.toBeUndefined()
    expect(ran).toBe(true)
    failing.remove()
    rejecting.remove()
    ok.remove()
  })

  it('stops calling a removed listener', async () => {
    let calls = 0
    onPullToRefresh(() => void calls++).remove()
    await pullToRefresh()
    expect(calls).toBe(0)
  })
})
