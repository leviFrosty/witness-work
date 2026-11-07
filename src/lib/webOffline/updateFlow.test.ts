import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVATION_TIMEOUT_MS,
  createUpdateController,
  nextUpdateState,
  type UpdateEnv,
} from '@/lib/webOffline/updateFlow'

function setup(overrides: Partial<UpdateEnv> = {}) {
  let visible = true
  let close: (() => void) | null = null
  let accept: (() => void) | null = null
  const timers: Array<{ run: () => void; ms: number; live: boolean }> = []
  const env = {
    skipWaiting: vi.fn(() => true),
    showPrompt: vi.fn((handlers: { accept: () => void; close: () => void }) => {
      accept = handlers.accept
      close = handlers.close
      return () => close?.()
    }),
    reload: vi.fn(),
    isVisible: () => visible,
    setTimeout: (run: () => void, ms: number) => {
      const timer = { run, ms, live: true }
      timers.push(timer)
      return timer
    },
    clearTimeout: (timer: unknown) => {
      ;(timer as { live: boolean }).live = false
    },
    ...overrides,
  } satisfies UpdateEnv
  return {
    env,
    controller: createUpdateController(env),
    timers,
    pressReload: () => accept?.(),
    closePrompt: () => close?.(),
    setVisible: (value: boolean) => {
      visible = value
    },
  }
}

describe('nextUpdateState', () => {
  it('only an accepted update leads to a reload', () => {
    expect(nextUpdateState('idle', 'controller-changed')).toBe('idle')
    expect(nextUpdateState('waiting', 'controller-changed')).toBe('waiting')
    expect(nextUpdateState('prompted', 'controller-changed')).toBe('prompted')
    expect(nextUpdateState('activating', 'controller-changed')).toBe(
      'reloading'
    )
  })

  it('walks the happy path', () => {
    let state = nextUpdateState('idle', 'worker-waiting')
    expect(state).toBe('waiting')
    state = nextUpdateState(state, 'prompt-shown')
    expect(state).toBe('prompted')
    state = nextUpdateState(state, 'accepted')
    expect(state).toBe('activating')
    expect(nextUpdateState(state, 'controller-changed')).toBe('reloading')
  })

  it('goes back to waiting when the prompt closes or activation stalls', () => {
    expect(nextUpdateState('prompted', 'prompt-closed')).toBe('waiting')
    expect(nextUpdateState('activating', 'activation-timeout')).toBe('waiting')
  })

  it('ignores events that do not apply', () => {
    expect(nextUpdateState('idle', 'accepted')).toBe('idle')
    expect(nextUpdateState('idle', 'prompt-shown')).toBe('idle')
    expect(nextUpdateState('reloading', 'worker-waiting')).toBe('reloading')
    expect(nextUpdateState('waiting', 'activation-timeout')).toBe('waiting')
  })
})

describe('the update controller', () => {
  it('shows one prompt for a waiting worker, then reloads once after Reload', () => {
    const { controller, env, pressReload } = setup()
    controller.workerWaiting()
    controller.workerWaiting()
    expect(env.showPrompt).toHaveBeenCalledTimes(1)
    expect(controller.state()).toBe('prompted')
    expect(env.reload).not.toHaveBeenCalled()

    pressReload()
    expect(env.skipWaiting).toHaveBeenCalledTimes(1)
    expect(controller.state()).toBe('activating')

    controller.controllerChanged()
    controller.controllerChanged()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('reloads at once when Reload finds no waiting worker any more', () => {
    const { controller, env, pressReload } = setup({
      skipWaiting: vi.fn(() => false),
    })
    controller.workerWaiting()
    pressReload()
    expect(env.reload).toHaveBeenCalledTimes(1)
    controller.controllerChanged()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads when the worker changes without the User accepting', () => {
    const { controller, env } = setup()
    controller.controllerChanged()
    controller.workerWaiting()
    controller.controllerChanged()
    expect(env.reload).not.toHaveBeenCalled()
    expect(env.skipWaiting).not.toHaveBeenCalled()
  })

  it('does not show the prompt in a hidden tab, and offers it on return', () => {
    const { controller, env, setVisible } = setup()
    setVisible(false)
    controller.workerWaiting()
    expect(env.showPrompt).not.toHaveBeenCalled()
    expect(controller.state()).toBe('waiting')
    setVisible(true)
    controller.returned()
    expect(env.showPrompt).toHaveBeenCalledTimes(1)
  })

  it('offers it again after the prompt closes unanswered', () => {
    const { controller, env, closePrompt } = setup()
    controller.workerWaiting()
    closePrompt()
    expect(controller.state()).toBe('waiting')
    controller.returned()
    expect(env.showPrompt).toHaveBeenCalledTimes(2)
  })

  it('takes the prompt down when the tab goes to the background', () => {
    const { controller } = setup()
    controller.workerWaiting()
    controller.hidden()
    expect(controller.state()).toBe('waiting')
  })

  it('does not stack a second prompt while one shows', () => {
    const { controller, env } = setup()
    controller.workerWaiting()
    controller.returned()
    controller.returned()
    expect(env.showPrompt).toHaveBeenCalledTimes(1)
  })

  it('goes back to waiting if the worker never takes over', () => {
    const { controller, env, timers, pressReload } = setup()
    controller.workerWaiting()
    pressReload()
    expect(timers).toHaveLength(1)
    expect(timers[0].ms).toBe(ACTIVATION_TIMEOUT_MS)
    timers[0].run()
    expect(controller.state()).toBe('waiting')
    expect(env.reload).not.toHaveBeenCalled()

    controller.controllerChanged()
    expect(env.reload).not.toHaveBeenCalled()
  })

  it('stops the timeout once it reloads', () => {
    const { controller, timers, pressReload } = setup()
    controller.workerWaiting()
    pressReload()
    controller.controllerChanged()
    expect(timers[0].live).toBe(false)
  })

  it('ignores Reload when nothing is waiting', () => {
    const { controller, env } = setup()
    controller.accept()
    expect(env.skipWaiting).not.toHaveBeenCalled()
  })
})
