import { describe, expect, it, vi } from 'vitest'
import { createPrecacheGate } from './precacheGate'

const settles = async (promise: Promise<void>) => {
  let done = false
  void promise.then(() => (done = true))
  await Promise.resolve()
  await Promise.resolve()
  return done
}

describe('the precache gate', () => {
  it('holds the download until the page opens it', async () => {
    const gate = createPrecacheGate(() => undefined)
    const opened = gate.opened()
    expect(await settles(opened)).toBe(false)
    gate.open()
    expect(await settles(opened)).toBe(true)
  })

  it('is already open when the page opened it before the install', async () => {
    const gate = createPrecacheGate(() => undefined)
    gate.open()
    expect(await settles(gate.opened())).toBe(true)
  })

  it('opens on its own when no page opens it', async () => {
    const timers: Array<{ run: () => void; ms: number }> = []
    const gate = createPrecacheGate((run, ms) => timers.push({ run, ms }), 500)
    const opened = gate.opened()
    expect(timers.map(({ ms }) => ms)).toEqual([500])
    expect(await settles(opened)).toBe(false)
    timers[0].run()
    expect(await settles(opened)).toBe(true)
  })

  it('starts the fallback clock at the install, not when the worker loads', () => {
    const setTimer = vi.fn()
    createPrecacheGate(setTimer)
    expect(setTimer).not.toHaveBeenCalled()
  })
})
