import {
  type IncomingMessage,
  initMessage,
  parseFrameMessage,
  type TurnstileAction,
  type TurnstileErrorReason,
} from '@/lib/turnstileFrame/protocol'

type Target = { postMessage(message: unknown, targetOrigin: string): void }

export const READY_TIMEOUT_MS = 15_000

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
  origin: string
  action: TurnstileAction

  target: () => Target | null

  onToken: (token: string | null) => void
  onError: (reason: TurnstileErrorReason) => void

  onReady?: () => void

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
    frameLoaded() {
      if (closed) return

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
