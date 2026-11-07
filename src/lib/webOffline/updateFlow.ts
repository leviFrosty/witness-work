export type UpdateState =
  | 'idle'
  | 'waiting'
  | 'prompted'
  | 'activating'
  | 'reloading'

export type UpdateEvent =
  | 'worker-waiting'
  | 'prompt-shown'
  | 'prompt-closed'
  | 'accepted'
  | 'controller-changed'
  | 'activation-timeout'

export function nextUpdateState(
  state: UpdateState,
  event: UpdateEvent
): UpdateState {
  switch (event) {
    case 'worker-waiting':
      return state === 'idle' ? 'waiting' : state
    case 'prompt-shown':
      return state === 'waiting' ? 'prompted' : state
    case 'prompt-closed':
      return state === 'prompted' ? 'waiting' : state
    case 'accepted':
      return state === 'waiting' || state === 'prompted' ? 'activating' : state
    case 'controller-changed':
      return state === 'activating' ? 'reloading' : state
    case 'activation-timeout':
      return state === 'activating' ? 'waiting' : state
  }
}

export const ACTIVATION_TIMEOUT_MS = 10_000

export type UpdateEnv = {
  skipWaiting: () => boolean

  showPrompt: (handlers: {
    accept: () => void
    close: () => void
  }) => () => void

  reload: () => void

  isVisible: () => boolean
  setTimeout: (run: () => void, ms: number) => unknown
  clearTimeout: (timer: unknown) => void
}

export type UpdateController = {
  state: () => UpdateState

  workerWaiting: () => void

  returned: () => void

  hidden: () => void

  controllerChanged: () => void

  accept: () => void
}

export function createUpdateController(env: UpdateEnv): UpdateController {
  let state: UpdateState = 'idle'
  let dismissPrompt: (() => void) | null = null
  let timer: unknown = null
  let reloaded = false

  const send = (event: UpdateEvent) => {
    state = nextUpdateState(state, event)
  }

  const offer = () => {
    if (state !== 'waiting' || !env.isVisible()) return
    send('prompt-shown')
    dismissPrompt = env.showPrompt({
      accept: () => controller.accept(),
      close: () => {
        dismissPrompt = null
        send('prompt-closed')
      },
    })
  }

  const controller: UpdateController = {
    state: () => state,
    workerWaiting() {
      send('worker-waiting')
      offer()
    },
    returned: offer,
    hidden() {
      dismissPrompt?.()
      dismissPrompt = null
      if (state === 'prompted') send('prompt-closed')
    },
    controllerChanged() {
      send('controller-changed')
      if (state !== 'reloading' || reloaded) return
      reloaded = true
      if (timer !== null) env.clearTimeout(timer)
      timer = null
      env.reload()
    },
    accept() {
      if (state !== 'waiting' && state !== 'prompted') return
      dismissPrompt = null
      send('accepted')
      if (!env.skipWaiting()) {
        send('controller-changed')
        reloaded = true
        env.reload()
        return
      }
      timer = env.setTimeout(() => {
        timer = null
        send('activation-timeout')
      }, ACTIVATION_TIMEOUT_MS)
    },
  }
  return controller
}
