import { describe, expect, it, vi } from 'vitest'
import { claimTab } from '@/lib/webStorage/tabLock'

let n = 0
const lockName = () => `test-tab-${n++}`

describe('claimTab', () => {
  it('makes the first tab the active one', async () => {
    const name = lockName()
    expect(
      await claimTab({ locks: navigator.locks, name, onTakenOver: vi.fn() })
    ).toBe(true)
  })

  it('leaves a second tab inactive while the first stays open', async () => {
    const name = lockName()
    const first = vi.fn()
    await claimTab({ locks: navigator.locks, name, onTakenOver: first })
    expect(
      await claimTab({ locks: navigator.locks, name, onTakenOver: vi.fn() })
    ).toBe(false)
    expect(first).not.toHaveBeenCalled()
  })

  it('takes over on request and tells the tab that had it', async () => {
    const name = lockName()
    const first = vi.fn()
    await claimTab({ locks: navigator.locks, name, onTakenOver: first })
    expect(
      await claimTab({
        locks: navigator.locks,
        name,
        takeOver: true,
        onTakenOver: vi.fn(),
      })
    ).toBe(true)
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1))
    // And the tab that took over keeps it against a newcomer.
    expect(
      await claimTab({ locks: navigator.locks, name, onTakenOver: vi.fn() })
    ).toBe(false)
  })

  it('runs as the only tab when the browser has no Web Locks', async () => {
    expect(
      await claimTab({
        locks: undefined,
        name: lockName(),
        onTakenOver: vi.fn(),
      })
    ).toBe(true)
  })

  it('lets a takeover read only once the old tab has saved its last writes', async () => {
    const name = lockName()
    let finishSaving!: () => void
    const saving = new Promise<void>((resolve) => (finishSaving = resolve))
    const first = vi.fn(() => saving)
    await claimTab({ locks: navigator.locks, name, onTakenOver: first })

    let active = false
    const second = claimTab({
      locks: navigator.locks,
      name,
      takeOver: true,
      onTakenOver: vi.fn(),
    }).then((result) => (active = result))
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(active).toBe(false)
    finishSaving()
    await second
    expect(active).toBe(true)
  })

  it('takes over anyway from a tab that never lets go', async () => {
    const name = lockName()
    await claimTab({
      locks: navigator.locks,
      name,
      onTakenOver: () => new Promise<void>(() => {}),
    })
    expect(
      await claimTab({
        locks: navigator.locks,
        name,
        takeOver: true,
        onTakenOver: vi.fn(),
        writerTimeoutMs: 50,
      })
    ).toBe(true)
  })
})
