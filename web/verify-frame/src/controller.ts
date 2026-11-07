import { isAllowedOrigin } from '../../../src/lib/mapsFrame/protocol'
import {
  type FrameEvent,
  frameMessage,
  type IncomingMessage,
  isInitMessage,
  isToken,
  type TurnstileAction,
} from '../../../src/lib/turnstileFrame/protocol'

const MAX_PENDING = 8

export function createVerifyController({
  allowedOrigins,
  parent,
  action,
}: {
  allowedOrigins: readonly string[]

  parent: { postMessage(message: unknown, targetOrigin: string): void } | null
  action: TurnstileAction
}) {
  let appOrigin: string | null = null
  const pending: FrameEvent[] = []

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
      if (!parent || source !== parent || appOrigin !== null) return
      if (!isAllowedOrigin(origin, allowedOrigins)) return
      if (!isInitMessage(data)) return
      appOrigin = origin
      for (const event of pending.splice(0)) send(event, origin)
    },
  }
}
