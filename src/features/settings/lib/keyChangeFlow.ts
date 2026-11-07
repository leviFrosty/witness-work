import type { KeyChangeEngine } from '@/app/account/keyChange/engine'
import type { KeyChangeStage } from '@/lib/accountKey/keyChangeRecord'
import type { DeviceOwnerCheck } from '@/lib/deviceOwner'

export type KeyChangeProblem =
  | 'offline'
  | 'server'
  | 'mismatch'
  | 'sessionTooNew'
  | 'noPasskey'
  | 'stepUpRequired'
  | 'unsupported'

export type KeyChangeFlowState =
  | { step: 'loading' }
  | { step: 'intro'; ownerFailed?: true }
  | { step: 'preparing' }
  | { step: 'recoveryKey'; recoveryKey: string; saved: boolean }
  | { step: 'changing'; stage: KeyChangeStage | null; confirming?: boolean }
  | { step: 'done' }
  | { step: 'finishing' }
  | { step: 'lostRace' }
  | {
      step: 'problem'
      problem: KeyChangeProblem
      at: 'start' | 'commit'

      availableAt?: number
    }

export type KeyChangeFlowDeps = {
  engine: Pick<
    KeyChangeEngine,
    | 'start'
    | 'confirm'
    | 'commit'
    | 'discard'
    | 'current'
    | 'pendingKey'
    | 'onStage'
  >
  confirmOwner: () => Promise<DeviceOwnerCheck>
  encodeRecoveryKey: (key: Uint8Array) => string

  failureReason: (error: unknown) => string | null

  availableAt?: (error: unknown) => number | undefined
  track: (
    event: 'account_key_change_discarded',
    properties: { stage: KeyChangeStage }
  ) => void
}

const START_PROBLEMS: Record<string, KeyChangeProblem> = {
  offline: 'offline',
  unresolved: 'offline',
  account_mismatch: 'mismatch',
  no_key: 'mismatch',
  session_too_new: 'sessionTooNew',
  no_passkey: 'noPasskey',
  unsupported: 'unsupported',
  step_up: 'stepUpRequired',
}

export function createKeyChangeFlow(
  deps: KeyChangeFlowDeps,
  { resuming = false }: { resuming?: boolean } = {}
) {
  let state: KeyChangeFlowState = { step: resuming ? 'loading' : 'intro' }
  const listeners = new Set<(state: KeyChangeFlowState) => void>()
  const set = (next: KeyChangeFlowState) => {
    state = next
    for (const listener of listeners) listener(next)
  }

  let left = false

  let starting: Promise<unknown> | null = null

  const problemOf = (error: unknown) =>
    START_PROBLEMS[deps.failureReason(error) ?? ''] ?? 'server'

  const showProblem = (error: unknown, at: 'start' | 'commit') => {
    const availableAt = deps.availableAt?.(error)
    set({
      step: 'problem',
      problem: problemOf(error),
      at,
      ...(availableAt !== undefined && { availableAt }),
    })
  }

  const showRecoveryKey = (key: Uint8Array) =>
    set({
      step: 'recoveryKey',
      recoveryKey: deps.encodeRecoveryKey(key),
      saved: false,
    })

  async function commit(): Promise<void> {
    if (state.step !== 'changing') set({ step: 'changing', stage: null })
    const stop = deps.engine.onStage((stage) => {
      if (stage && state.step === 'changing') set({ step: 'changing', stage })
    })
    try {
      const current = await deps.engine.current()
      if (state.step === 'changing' && current)
        set({ step: 'changing', stage: current.stage })
      const result = await deps.engine.commit({
        onStepUp: (confirming) => {
          if (state.step === 'changing') set({ ...state, confirming })
        },
      })
      switch (result.outcome) {
        case 'done':
          return set({ step: 'done' })
        case 'lostRace':
          return set({ step: 'lostRace' })

        case 'sessionTooNew':
        case 'stepUpRequired':
          return set({ step: 'problem', problem: result.outcome, at: 'commit' })
      }
    } catch (error) {
      const current = await deps.engine.current().catch(() => null)
      const committed =
        current !== null &&
        current.stage !== 'pending' &&
        current.stage !== 'confirmed'
      if (committed) set({ step: 'finishing' })
      else showProblem(error, 'commit')
    } finally {
      stop()
    }
  }

  async function continueChange(ownerChecked: boolean): Promise<boolean> {
    const current = await deps.engine.current()
    if (!current) return false
    if (current.stage !== 'pending' && current.stage !== 'confirmed') {
      await commit()
      return true
    }
    if (!ownerChecked) {
      const owner = await deps.confirmOwner()
      if (owner === 'cancelled') return (set({ step: 'intro' }), true)
      if (owner === 'failed')
        return (set({ step: 'intro', ownerFailed: true }), true)
    }
    if (current.stage === 'confirmed') {
      await commit()
      return true
    }
    const key = await deps.engine.pendingKey()
    if (key) showRecoveryKey(key)
    else if (!(await deps.engine.current())) return false
    else await commit()
    return true
  }

  async function start(): Promise<void> {
    set({ step: 'preparing' })
    try {
      const { newKey } = await deps.engine.start()
      if (!left) showRecoveryKey(newKey)
    } catch (error) {
      if (
        deps.failureReason(error) === 'in_progress' &&
        (await continueChange(true).catch(() => false))
      )
        return
      showProblem(error, 'start')
    }
  }

  async function discardPending(): Promise<void> {
    await deps.engine.discard()
    deps.track('account_key_change_discarded', { stage: 'pending' })
  }

  return {
    state: () => state,
    subscribe(listener: (state: KeyChangeFlowState) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async begin(): Promise<void> {
      if (state.step !== 'intro' && state.step !== 'problem') return
      try {
        const owner = await deps.confirmOwner()
        if (owner === 'cancelled') return set({ step: 'intro' })
        if (owner === 'failed') return set({ step: 'intro', ownerFailed: true })

        if (await continueChange(true)) return
      } catch {
        return set({ step: 'problem', problem: 'server', at: 'start' })
      }
      starting = start()
      await starting
      starting = null
    },

    setSaved(saved: boolean) {
      if (state.step === 'recoveryKey') set({ ...state, saved })
    },

    async change(): Promise<void> {
      if (left || state.step !== 'recoveryKey' || !state.saved) return
      set({ step: 'changing', stage: 'pending' })
      try {
        await deps.engine.confirm()
      } catch (error) {
        return set({ step: 'problem', problem: problemOf(error), at: 'commit' })
      }
      await commit()
    },

    async retry(): Promise<void> {
      if (state.step === 'problem' && state.at === 'commit') await commit()
      else if (state.step === 'problem') {
        set({ step: 'intro' })
        await this.begin()
      } else if (state.step === 'finishing') await commit()
    },

    restart(): boolean {
      if (
        state.step === 'done' ||
        state.step === 'lostRace' ||
        state.step === 'finishing' ||
        state.step === 'problem'
      )
        set({ step: 'intro' })
      return state.step === 'intro'
    },

    async resume(): Promise<void> {
      set({ step: 'loading' })
      try {
        if (!(await continueChange(false))) set({ step: 'intro' })
      } catch {
        set({ step: 'problem', problem: 'server', at: 'start' })
      }
    },

    async leave(): Promise<void> {
      left = true
      if (starting) await starting.catch(() => undefined)

      if (state.step !== 'recoveryKey' && state.step !== 'preparing') return
      const current = await deps.engine.current().catch(() => null)
      if (current?.stage === 'pending') await discardPending()
    },
  }
}

export type KeyChangeFlow = ReturnType<typeof createKeyChangeFlow>
