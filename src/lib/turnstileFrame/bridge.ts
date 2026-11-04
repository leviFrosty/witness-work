import {
  type IncomingMessage,
  initMessage,
  parseFrameMessage,
  type TurnstileAction,
  type TurnstileErrorReason,
} from '@/lib/turnstileFrame/protocol'

type Target = { postMessage(message: unknown, targetOrigin: string): void }

/**
 * From mount to the frame's first message (`ready`, a token or an error): its
 * page, `api.js` and the render. A page's `load` doesn't count, since a
 * browser's own error page fires it too.
 */
export const READY_TIMEOUT_MS = 15_000

/**
 * The app's side of one Turnstile frame (docs/web-turnstile.md): it greets the
 * frame once it loads, and hears only the frame's own window at the frame's
 * exact origin, with a well-formed message for this check's action.
 */
export function createTurnstileBridge({
  origin,
  action,
  target,
  onToken,
  onError,
  onReady,
  onExpired,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: {
  /** The frame's origin, which the app's CSP frames (`links.turnstileFrame`). */
  origin: string
  action: TurnstileAction
  /** The frame's window, once its element exists. */
  target: () => Target | null
  /** Each token, and null once it's gone (expired, failed). */
  onToken: (token: string | null) => void
  onError: (reason: TurnstileErrorReason) => void
  /** The frame's first `ready` or token: the widget is up. */
  onReady?: () => void
  /** The last token expired unused (after `onToken(null)`). */
  onExpired?: () => void
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}) {
  let closed = false
  let heard = false
  let up = false
  const timer = setTimer(() => {
    if (closed || heard) return
    closed = true
    onError('script')
  }, READY_TIMEOUT_MS)

  /** The frame said something real: stop waiting. */
  const heardFrom = () => {
    if (heard) return
    heard = true
    clearTimer(timer)
  }
  const cameUp = () => {
    heardFrom()
    if (up) return
    up = true
    onReady?.()
  }

  return {
    /** The frame's `load`: tell it which origin framed it. */
    frameLoaded() {
      if (closed) return
      // Never `*`: only a page at the frame's origin hears it.
      target()?.postMessage(initMessage(), origin)
    },

    receive({ origin: from, source, data }: IncomingMessage) {
      if (closed || from !== origin) return
      const frame = target()
      if (!frame || source !== frame) return
      const event = parseFrameMessage(data, action)
      if (!event) return
      heardFrom()
      switch (event.type) {
        case 'ready':
          cameUp()
          return
        case 'token':
          cameUp()
          onToken(event.token)
          return
        case 'expired':
          onToken(null)
          onExpired?.()
          return
        case 'timeout':
          onToken(null)
          onError('check')
          return
        case 'error':
          onToken(null)
          onError(event.reason)
          return
      }
    },

    dispose() {
      closed = true
      clearTimer(timer)
    },
  }
}
