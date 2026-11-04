/**
 * The web app's update flow (docs/web-offline.md). A new service worker waits
 * until the User accepts it, so a tab never changes under someone mid-edit:
 *
 * - `idle`: no update.
 * - `waiting`: a new version is installed and waiting. The prompt shows when the
 *   tab is visible, and again on a later return if it was closed unanswered.
 * - `prompted`: the prompt is on screen.
 * - `activating`: the User accepted; the worker was told to take over.
 * - `reloading`: it took over, and the page reloads, once.
 *
 * Only `accepted` leads to a reload. A worker that takes over for any other
 * reason (another tab accepted, the first install) never reloads this tab.
 */
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
      // A newer version while one is already offered: still one prompt.
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

/** How long the User's accept waits for the new worker to take over. */
export const ACTIVATION_TIMEOUT_MS = 10_000

export type UpdateEnv = {
  /**
   * Tells the waiting worker to take over (`skipWaiting`). False when none is
   * waiting any more (another tab already took the update): the page reloads at
   * once, since it was accepted.
   */
  skipWaiting: () => boolean
  /**
   * Shows the non-blocking prompt. `accept` is its Reload button; `close` runs
   * when it leaves any other way (timed out, swiped away, tab hidden). Returns
   * a function that takes it down.
   */
  showPrompt: (handlers: {
    accept: () => void
    close: () => void
  }) => () => void
  /** Reloads the page. */
  reload: () => void
  /** Whether the tab is in front; a prompt in a hidden tab goes unseen. */
  isVisible: () => boolean
  setTimeout: (run: () => void, ms: number) => unknown
  clearTimeout: (timer: unknown) => void
}

export type UpdateController = {
  state: () => UpdateState
  /** A new worker is installed and waiting. */
  workerWaiting: () => void
  /** The tab came back to the front: offer an update left unanswered. */
  returned: () => void
  /** The tab went to the background: the prompt goes with it. */
  hidden: () => void
  /** The page's controlling worker changed. */
  controllerChanged: () => void
  /** The User's accept, as the prompt's button does it. */
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
      // Closing the prompt moves `prompted` back to `waiting`.
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
