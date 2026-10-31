import type { KeyChangeEngine } from '@/app/account/keyChange/engine'
import type { KeyChangeStage } from '@/lib/accountKey/keyChangeRecord'
import type { DeviceOwnerCheck } from '@/lib/deviceOwner'

/**
 * Change Account Key's screens (ADR 0039 §4), over the engine: the explanation,
 * the device owner's check, the new recovery key with "I've saved it", then the
 * change itself, stage by stage. Pure, so it's tested without screens.
 */

/**
 * Why the change couldn't go on, as the screen says it. `sessionTooNew`,
 * `noPasskey` and `stepUpRequired` are the web's: a browser checks the first
 * two before any new key, and the server can refuse the first and last at the
 * commit, where the change stays confirmed.
 */
export type KeyChangeProblem =
  | 'offline'
  | 'server'
  | 'mismatch'
  | 'sessionTooNew'
  | 'noPasskey'
  | 'stepUpRequired'

export type KeyChangeFlowState =
  /** Reading the change under way, to continue it. */
  | { step: 'loading' }
  | { step: 'intro'; ownerFailed?: true }
  /** Cloud Sync and backup catch up, and the new key is made. */
  | { step: 'preparing' }
  | { step: 'recoveryKey'; recoveryKey: string; saved: boolean }
  /** `stage` is the last one the change recorded. */
  | { step: 'changing'; stage: KeyChangeStage | null }
  | { step: 'done' }
  /** The new key is in use; a later step finishes on a later launch. */
  | { step: 'finishing' }
  /** Another device changed the key first. */
  | { step: 'lostRace' }
  | {
      step: 'problem'
      problem: KeyChangeProblem
      at: 'start' | 'commit'
      /** `sessionTooNew`: when the browser may change the key, if known. */
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
  /** The engine's `KeyChangeError` reason, or null for any other error. */
  failureReason: (error: unknown) => string | null
  /** `session_too_new`'s time the browser may change the key, if any. */
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
  /** The User left the screen: nothing more starts. */
  let left = false
  /** Step 0 and 1, while they run. */
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

  /** Steps 3 to 7, showing each stage as the engine records it. */
  async function commit(): Promise<void> {
    if (state.step !== 'changing') set({ step: 'changing', stage: null })
    const stop = deps.engine.onStage((stage) => {
      if (stage && state.step === 'changing') set({ step: 'changing', stage })
    })
    try {
      const current = await deps.engine.current()
      if (state.step === 'changing' && current)
        set({ step: 'changing', stage: current.stage })
      const result = await deps.engine.commit()
      switch (result.outcome) {
        case 'done':
          return set({ step: 'done' })
        case 'lostRace':
          return set({ step: 'lostRace' })
        // The web's refusals: still confirmed, under the old key.
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

  /**
   * Picks up the change under way: the device owner's check before its new key
   * shows or goes to the server, then where it stopped. A committed change only
   * finishes, without asking again. False when there's none.
   */
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
    else await commit()
    return true
  }

  async function start(): Promise<void> {
    set({ step: 'preparing' })
    try {
      const { newKey } = await deps.engine.start()
      if (!left) showRecoveryKey(newKey)
    } catch (error) {
      // One started meanwhile (another visit to the screen): continue it.
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

    /** From the explanation: the device owner's check, then steps 0 and 1. */
    async begin(): Promise<void> {
      if (state.step !== 'intro' && state.step !== 'problem') return
      try {
        const owner = await deps.confirmOwner()
        if (owner === 'cancelled') return set({ step: 'intro' })
        if (owner === 'failed') return set({ step: 'intro', ownerFailed: true })
        // A change left unfinished goes on rather than another starting.
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

    /** Step 2's "I've saved it", then the change. */
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

    /** Try Again after a problem. */
    async retry(): Promise<void> {
      if (state.step === 'problem' && state.at === 'commit') await commit()
      else if (state.step === 'problem') {
        set({ step: 'intro' })
        await this.begin()
      } else if (state.step === 'finishing') await commit()
    },

    /** Continue a change from an earlier visit or launch. */
    async resume(): Promise<void> {
      set({ step: 'loading' })
      try {
        if (!(await continueChange(false))) set({ step: 'intro' })
      } catch {
        set({ step: 'problem', problem: 'server', at: 'start' })
      }
    },

    /**
     * The User left the screen. A new key nobody confirmed is discarded (step
     * 2), once it's made if it's being made; anything later is the engine's to
     * finish or resolve.
     */
    async leave(): Promise<void> {
      left = true
      if (starting) await starting.catch(() => undefined)
      // A new key made but never confirmed: shown, or made after the User
      // left. Once "I've saved it" moved it on, `change()` owns it.
      if (state.step !== 'recoveryKey' && state.step !== 'preparing') return
      const current = await deps.engine.current().catch(() => null)
      if (current?.stage === 'pending') await discardPending()
    },
  }
}

export type KeyChangeFlow = ReturnType<typeof createKeyChangeFlow>
