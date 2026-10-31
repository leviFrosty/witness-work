import { describe, expect, it, vi } from 'vitest'
import type { KeyChangeStage } from '@/lib/accountKey/keyChangeRecord'
import {
  createKeyChangeFlow,
  type KeyChangeFlowDeps,
  type KeyChangeFlowState,
} from './keyChangeFlow'

class FakeKeyChangeError extends Error {
  constructor(
    readonly reason: string,
    readonly availableAt?: number
  ) {
    super(reason)
  }
}

const K2 = new Uint8Array(32).fill(2)

function setup(
  overrides: Partial<KeyChangeFlowDeps> = {},
  { resuming = false } = {}
) {
  let stage: KeyChangeStage | null = null
  const listeners = new Set<(stage: KeyChangeStage | null) => void>()
  const setStage = (next: KeyChangeStage | null) => {
    stage = next
    for (const listener of listeners) listener(next)
  }
  const engine: KeyChangeFlowDeps['engine'] = {
    start: vi.fn(async () => {
      setStage('pending')
      return { newKey: K2 }
    }),
    confirm: vi.fn(async () => setStage('confirmed')),
    commit: vi.fn(async () => {
      for (const next of [
        'committed',
        'stored',
        'resealed',
        'buddies-reset',
      ] as const)
        setStage(next)
      setStage(null)
      return { outcome: 'done' as const }
    }),
    discard: vi.fn(async () => setStage(null)),
    current: vi.fn(async () => (stage ? { stage, startedAt: 1 } : null)),
    pendingKey: vi.fn(async () => (stage === 'pending' ? K2 : null)),
    onStage: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const deps: KeyChangeFlowDeps = {
    engine,
    confirmOwner: vi.fn(async () => 'confirmed' as const),
    encodeRecoveryKey: () => 'WW1-NEW',
    failureReason: (error) =>
      error instanceof FakeKeyChangeError ? error.reason : null,
    availableAt: (error) =>
      error instanceof FakeKeyChangeError ? error.availableAt : undefined,
    track: vi.fn(),
    ...overrides,
  }
  const flow = createKeyChangeFlow(deps, { resuming })
  const states: KeyChangeFlowState[] = []
  flow.subscribe((state) => states.push(state))
  return { flow, engine, deps, states, setStage }
}

describe('the Change Account Key flow', () => {
  it('asks the device’s owner, prepares, then shows the new recovery key', async () => {
    const { flow, deps, states } = setup()
    expect(flow.state()).toEqual({ step: 'intro' })
    await flow.begin()
    expect(deps.confirmOwner).toHaveBeenCalled()
    expect(states.map((state) => state.step)).toEqual([
      'preparing',
      'recoveryKey',
    ])
    expect(flow.state()).toEqual({
      step: 'recoveryKey',
      recoveryKey: 'WW1-NEW',
      saved: false,
    })
  })

  it('stays on the explanation when the owner check is cancelled or fails', async () => {
    const cancelled = setup({ confirmOwner: async () => 'cancelled' })
    await cancelled.flow.begin()
    expect(cancelled.flow.state()).toEqual({ step: 'intro' })
    expect(cancelled.engine.start).not.toHaveBeenCalled()

    const failed = setup({ confirmOwner: async () => 'failed' })
    await failed.flow.begin()
    expect(failed.flow.state()).toEqual({ step: 'intro', ownerFailed: true })
    expect(failed.engine.start).not.toHaveBeenCalled()
  })

  it('goes on without a check on a device with no screen lock', async () => {
    const { flow } = setup({ confirmOwner: async () => 'noLock' })
    await flow.begin()
    expect(flow.state().step).toBe('recoveryKey')
  })

  it('says why it couldn’t start', async () => {
    for (const [reason, problem] of [
      ['offline', 'offline'],
      ['history', 'server'],
      ['server', 'server'],
      ['account_mismatch', 'mismatch'],
      ['no_key', 'mismatch'],
    ] as const) {
      const { flow, engine } = setup()
      vi.mocked(engine.start).mockRejectedValueOnce(
        new FakeKeyChangeError(reason)
      )
      await flow.begin()
      expect(flow.state()).toEqual({ step: 'problem', problem, at: 'start' })
    }
  })

  it('needs “I’ve saved it” before it changes the key', async () => {
    const { flow, engine } = setup()
    await flow.begin()
    await flow.change()
    expect(engine.confirm).not.toHaveBeenCalled()
    flow.setSaved(true)
    expect(flow.state()).toMatchObject({ step: 'recoveryKey', saved: true })
  })

  it('confirms, commits, and shows each stage, then done', async () => {
    const { flow, engine, states } = setup()
    await flow.begin()
    flow.setSaved(true)
    await flow.change()
    expect(engine.confirm).toHaveBeenCalledTimes(1)
    expect(engine.commit).toHaveBeenCalledTimes(1)
    const stages = states
      .filter((state) => state.step === 'changing')
      .map((state) => (state.step === 'changing' ? state.stage : null))
    expect(stages).toEqual([
      'pending',
      'confirmed',
      'committed',
      'stored',
      'resealed',
      'buddies-reset',
    ])
    expect(flow.state()).toEqual({ step: 'done' })
  })

  it('says when another device changed the key first', async () => {
    const { flow, engine } = setup()
    vi.mocked(engine.commit).mockResolvedValueOnce({ outcome: 'lostRace' })
    await flow.begin()
    flow.setSaved(true)
    await flow.change()
    expect(flow.state()).toEqual({ step: 'lostRace' })
  })

  it('keeps a confirmed change to try again when it can’t reach the server', async () => {
    const { flow, engine } = setup()
    vi.mocked(engine.commit).mockRejectedValueOnce(
      new FakeKeyChangeError('offline')
    )
    await flow.begin()
    flow.setSaved(true)
    await flow.change()
    expect(flow.state()).toEqual({
      step: 'problem',
      problem: 'offline',
      at: 'commit',
    })
    expect(engine.discard).not.toHaveBeenCalled()
    await flow.retry()
    expect(engine.commit).toHaveBeenCalledTimes(2)
    expect(flow.state()).toEqual({ step: 'done' })
  })

  it('finishes later when a step after the commit stopped', async () => {
    const { flow, engine, setStage } = setup()
    vi.mocked(engine.commit).mockImplementationOnce(async () => {
      setStage('committed')
      setStage('stored')
      throw new Error('reseal failed')
    })
    await flow.begin()
    flow.setSaved(true)
    await flow.change()
    expect(flow.state()).toEqual({ step: 'finishing' })
  })

  it('discards the new key when the User leaves before changing it', async () => {
    const { flow, engine, deps } = setup()
    await flow.begin()
    await flow.leave()
    expect(engine.discard).toHaveBeenCalledTimes(1)
    expect(deps.track).toHaveBeenCalledWith('account_key_change_discarded', {
      stage: 'pending',
    })
  })

  it('leaves a change that went through, or is waiting on the server, as it is', async () => {
    const { flow, engine } = setup()
    vi.mocked(engine.commit).mockRejectedValueOnce(
      new FakeKeyChangeError('offline')
    )
    await flow.begin()
    flow.setSaved(true)
    await flow.change()
    await flow.leave()
    expect(engine.discard).not.toHaveBeenCalled()

    const done = setup()
    await done.flow.begin()
    done.flow.setSaved(true)
    await done.flow.change()
    await done.flow.leave()
    expect(done.engine.discard).not.toHaveBeenCalled()
  })

  it('picks a pending change back up at its recovery key, after the owner check', async () => {
    const { flow, setStage, deps } = setup({}, { resuming: true })
    expect(flow.state()).toEqual({ step: 'loading' })
    setStage('pending')
    await flow.resume()
    expect(deps.confirmOwner).toHaveBeenCalledTimes(1)
    expect(flow.state()).toEqual({
      step: 'recoveryKey',
      recoveryKey: 'WW1-NEW',
      saved: false,
    })
  })

  it('doesn’t show a pending change’s key when the owner check is cancelled or fails', async () => {
    const cancelled = setup(
      { confirmOwner: async () => 'cancelled' },
      { resuming: true }
    )
    cancelled.setStage('pending')
    await cancelled.flow.resume()
    expect(cancelled.flow.state()).toEqual({ step: 'intro' })
    expect(cancelled.engine.pendingKey).not.toHaveBeenCalled()

    const failed = setup({ confirmOwner: async () => 'failed' })
    failed.setStage('confirmed')
    await failed.flow.resume()
    expect(failed.flow.state()).toEqual({ step: 'intro', ownerFailed: true })
    expect(failed.engine.commit).not.toHaveBeenCalled()
  })

  it('continues an unfinished change from the explanation instead of starting another', async () => {
    const { flow, engine, setStage } = setup()
    setStage('pending')
    await flow.begin()
    expect(engine.start).not.toHaveBeenCalled()
    expect(flow.state()).toMatchObject({ step: 'recoveryKey' })

    // One started meanwhile elsewhere in the app.
    const raced = setup()
    vi.mocked(raced.engine.start).mockImplementationOnce(async () => {
      raced.setStage('pending')
      throw new FakeKeyChangeError('in_progress')
    })
    await raced.flow.begin()
    expect(raced.flow.state()).toMatchObject({ step: 'recoveryKey' })
  })

  it('picks a confirmed or committed change back up where it stopped', async () => {
    const confirmed = setup()
    confirmed.setStage('confirmed')
    await confirmed.flow.resume()
    expect(confirmed.engine.confirm).not.toHaveBeenCalled()
    expect(confirmed.engine.commit).toHaveBeenCalledTimes(1)
    expect(confirmed.flow.state()).toEqual({ step: 'done' })

    const nothing = setup({}, { resuming: true })
    await nothing.flow.resume()
    expect(nothing.flow.state()).toEqual({ step: 'intro' })
    expect(nothing.deps.confirmOwner).not.toHaveBeenCalled()
  })

  it('finishes a committed change without asking the owner again', async () => {
    const { flow, deps, engine, setStage } = setup({}, { resuming: true })
    setStage('stored')
    await flow.resume()
    expect(deps.confirmOwner).not.toHaveBeenCalled()
    expect(engine.commit).toHaveBeenCalledTimes(1)
    expect(flow.state()).toEqual({ step: 'done' })
  })

  it('says the web refusals, keeping the confirmed change, never done', async () => {
    for (const outcome of ['sessionTooNew', 'stepUpRequired'] as const) {
      const { flow, engine } = setup()
      vi.mocked(engine.commit).mockResolvedValueOnce({ outcome })
      await flow.begin()
      flow.setSaved(true)
      await flow.change()
      expect(flow.state()).toEqual({
        step: 'problem',
        problem: outcome,
        at: 'commit',
      })
      expect(engine.discard).not.toHaveBeenCalled()
    }
  })

  it('shows a problem instead of spinning when the engine or the owner check throws', async () => {
    const owner = setup({
      confirmOwner: async () => {
        throw new Error('biometrics')
      },
    })
    await owner.flow.begin()
    expect(owner.flow.state()).toEqual({
      step: 'problem',
      problem: 'server',
      at: 'start',
    })

    const confirm = setup()
    vi.mocked(confirm.engine.confirm).mockRejectedValueOnce(new Error('store'))
    await confirm.flow.begin()
    confirm.flow.setSaved(true)
    await confirm.flow.change()
    expect(confirm.flow.state()).toEqual({
      step: 'problem',
      problem: 'server',
      at: 'commit',
    })

    const current = setup({}, { resuming: true })
    vi.mocked(current.engine.current).mockRejectedValueOnce(new Error('read'))
    await current.flow.resume()
    expect(current.flow.state()).toMatchObject({ step: 'problem' })
  })

  it('discards a key still being made when the User leaves, once it’s made', async () => {
    const { flow, engine, setStage } = setup()
    let made!: () => void
    vi.mocked(engine.start).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          made = () => {
            setStage('pending')
            resolve({ newKey: K2 })
          }
        })
    )
    const begun = flow.begin()
    await vi.waitFor(() => expect(flow.state().step).toBe('preparing'))
    const left = flow.leave()
    made()
    await begun
    await left
    expect(engine.discard).toHaveBeenCalledTimes(1)
  })

  it('doesn’t change the key after the User left', async () => {
    const { flow, engine } = setup()
    await flow.begin()
    flow.setSaved(true)
    await flow.leave()
    await flow.change()
    expect(engine.confirm).not.toHaveBeenCalled()
    expect(engine.commit).not.toHaveBeenCalled()
  })

  it('says why a browser can’t change the key yet, before any new key', async () => {
    const { flow, engine } = setup()
    vi.mocked(engine.start).mockRejectedValueOnce(
      new FakeKeyChangeError('session_too_new', 1_800_000_000_000)
    )
    await flow.begin()
    expect(flow.state()).toEqual({
      step: 'problem',
      problem: 'sessionTooNew',
      at: 'start',
      availableAt: 1_800_000_000_000,
    })

    const noPasskey = setup()
    vi.mocked(noPasskey.engine.start).mockRejectedValueOnce(
      new FakeKeyChangeError('no_passkey')
    )
    await noPasskey.flow.begin()
    expect(noPasskey.flow.state()).toEqual({
      step: 'problem',
      problem: 'noPasskey',
      at: 'start',
    })
  })

  it('asks for the passkey again when its check didn’t pass', async () => {
    const { flow, engine } = setup()
    vi.mocked(engine.commit).mockRejectedValueOnce(
      new FakeKeyChangeError('step_up')
    )
    await flow.begin()
    flow.setSaved(true)
    await flow.change()
    expect(flow.state()).toEqual({
      step: 'problem',
      problem: 'stepUpRequired',
      at: 'commit',
    })
    await flow.retry()
    expect(engine.commit).toHaveBeenCalledTimes(2)
    expect(flow.state()).toEqual({ step: 'done' })
  })
})
