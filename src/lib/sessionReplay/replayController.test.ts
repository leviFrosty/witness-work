import { describe, expect, it, vi } from 'vitest'
import { createReplayController } from '@/lib/sessionReplay/replayController'
import type { ReplayGateInput } from '@/lib/sessionReplay/replayGate'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const base: ReplayGateInput = {
  sampled: true,
  analyticsAllowed: true,
  production: true,
  dataProtectionMode: false,
  country: 'US',
  optedIn: false,
}

const setup = (initial: Partial<ReplayGateInput> = {}) => {
  const state = { ...base, ...initial }
  const recorder = { start: vi.fn(), stop: vi.fn() }
  const load = vi.fn(async () => recorder)
  const controller = createReplayController({ inputs: () => state, load })
  const change = async (next: Partial<ReplayGateInput>) => {
    Object.assign(state, next)
    controller.evaluate()
    await flush()
  }
  return { state, recorder, load, controller, change }
}

describe('createReplayController', () => {
  it('loads and starts the recorder when the gate opens', async () => {
    const { controller, load, recorder, change } = setup()
    await change({})
    expect(controller.isRunning()).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it('never loads the recorder for a session outside the sample', async () => {
    const { load, change } = setup({ sampled: false })
    await change({})
    expect(load).not.toHaveBeenCalled()
  })

  it('stops as soon as analytics turn off mid-session', async () => {
    const { controller, recorder, change } = setup()
    await change({})
    await change({ analyticsAllowed: false })
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    expect(controller.isRunning()).toBe(false)
    expect(controller.isOpen()).toBe(false)
  })

  it('stops as soon as Data Protection Mode turns on mid-session', async () => {
    const { recorder, change } = setup({ country: 'DE', optedIn: true })
    await change({})
    expect(recorder.start).toHaveBeenCalledTimes(1)
    await change({ dataProtectionMode: true })
    expect(recorder.stop).toHaveBeenCalledTimes(1)
  })

  it('stops when a visitor withdraws their opt-in', async () => {
    const { recorder, change } = setup({ country: 'GB', optedIn: true })
    await change({})
    await change({ optedIn: false })
    expect(recorder.stop).toHaveBeenCalledTimes(1)
  })

  it('starts when an opt-in-region visitor opts in, and not before', async () => {
    const { recorder, load, change } = setup({ country: 'CH' })
    await change({})
    expect(load).not.toHaveBeenCalled()
    await change({ optedIn: true })
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it('waits for the country when it is unknown, then follows it', async () => {
    const { recorder, change } = setup({ country: undefined })
    await change({})
    expect(recorder.start).not.toHaveBeenCalled()
    await change({ country: 'FR' })
    expect(recorder.start).not.toHaveBeenCalled()
    await change({ country: 'US' })
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it('starts again, without loading again, when the gate reopens', async () => {
    const { recorder, load, change } = setup()
    await change({})
    await change({ analyticsAllowed: false })
    await change({ analyticsAllowed: true })
    expect(load).toHaveBeenCalledTimes(1)
    expect(recorder.start).toHaveBeenCalledTimes(2)
  })

  it('does not start a recorder whose gate closed while it loaded', async () => {
    let resolve: (value: {
      start: () => void
      stop: () => void
    }) => void = () => {}
    const recorder = { start: vi.fn(), stop: vi.fn() }
    const state = { ...base }
    const controller = createReplayController({
      inputs: () => state,
      load: () => new Promise((r) => (resolve = r)),
    })
    controller.evaluate()
    state.analyticsAllowed = false
    controller.evaluate()
    resolve(recorder)
    await flush()
    expect(recorder.start).not.toHaveBeenCalled()
    expect(recorder.stop).not.toHaveBeenCalled()
  })

  it('starts once when the gate flips twice while loading', async () => {
    let resolve: (value: {
      start: () => void
      stop: () => void
    }) => void = () => {}
    const recorder = { start: vi.fn(), stop: vi.fn() }
    const state = { ...base }
    const controller = createReplayController({
      inputs: () => state,
      load: () => new Promise((r) => (resolve = r)),
    })
    controller.evaluate()
    state.analyticsAllowed = false
    controller.evaluate()
    state.analyticsAllowed = true
    controller.evaluate()
    resolve(recorder)
    await flush()
    await Promise.resolve()
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the recorder fails to load', async () => {
    const state = { ...base }
    const controller = createReplayController({
      inputs: () => state,
      load: () => Promise.reject(new Error('chunk')),
    })
    controller.evaluate()
    await flush()
    expect(controller.isRunning()).toBe(true)
  })
})
