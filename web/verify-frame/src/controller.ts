// The frame's side of the protocol (docs/web-turnstile.md): whom it answers,
// and only there. Turnstile itself runs in `frame.ts`; this decides who hears
// about it.
import { isAllowedOrigin } from '../../../src/lib/mapsFrame/protocol'
import {
  type FrameEvent,
  frameMessage,
  type IncomingMessage,
  isInitMessage,
  isToken,
  type TurnstileAction,
} from '../../../src/lib/turnstileFrame/protocol'

/** Events kept from before the app's greeting; the latest win. */
const MAX_PENDING = 8

export function createVerifyController({
  allowedOrigins,
  parent,
  action,
}: {
  /** The app origins that may frame this one (`isAllowedOrigin`). */
  allowedOrigins: readonly string[]
  /** The window that framed this one; null when it's the top window. */
  parent: { postMessage(message: unknown, targetOrigin: string): void } | null
  action: TurnstileAction
}) {
  /** The app's exact origin, from its first valid `init`; then only it. */
  let appOrigin: string | null = null
  const pending: FrameEvent[] = []

  // Never `*`: only the app that framed this one hears it.
  const send = (event: FrameEvent, to: string) =>
    parent?.postMessage(frameMessage(action, event), to)

  return {
    emit(event: FrameEvent) {
      if (!parent) return
      if (event.type === 'token' && !isToken(event.token)) return
      if (appOrigin) return send(event, appOrigin)
      pending.push(event)
      if (pending.length > MAX_PENDING) pending.shift()
    },

    receive({ origin, source, data }: IncomingMessage) {
      // Only the window that framed this one, from an app origin, once.
      if (!parent || source !== parent || appOrigin !== null) return
      if (!isAllowedOrigin(origin, allowedOrigins)) return
      if (!isInitMessage(data)) return
      appOrigin = origin
      for (const event of pending.splice(0)) send(event, origin)
    },
  }
}
