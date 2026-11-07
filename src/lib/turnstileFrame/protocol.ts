export const TURNSTILE_FRAME_PROTOCOL = 'ww-turnstile'

export const TURNSTILE_FRAME_VERSION = 1

export const TURNSTILE_ACTIONS = ['web-signup', 'web-recovery'] as const
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[number]

export const MAX_TOKEN_LENGTH = 2048

export type TurnstileErrorReason = 'script' | 'check'

export type FrameEvent =
  | { type: 'ready' }
  | { type: 'token'; token: string }
  | { type: 'expired' }
  | { type: 'timeout' }
  | { type: 'error'; reason: TurnstileErrorReason }

type Envelope = { protocol: string; version: number }

export type FrameMessage = Envelope & { action: TurnstileAction } & FrameEvent

export type IncomingMessage = { origin: string; source: unknown; data: unknown }

export type AppMessage = Envelope & { type: 'init' }

const isAction = (value: unknown): value is TurnstileAction =>
  typeof value === 'string' &&
  (TURNSTILE_ACTIONS as readonly string[]).includes(value)

export const isSiteKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(value)

export const isToken = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_TOKEN_LENGTH &&
  /^[\x21-\x7e]+$/.test(value)

const hasExactly = (data: object, keys: string[]) => {
  const own = Object.keys(data)
  return own.length === keys.length && keys.every((key) => own.includes(key))
}

const isOurs = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' &&
  data !== null &&
  !Array.isArray(data) &&
  (data as Envelope).protocol === TURNSTILE_FRAME_PROTOCOL &&
  (data as Envelope).version === TURNSTILE_FRAME_VERSION

export function frameMessage(
  action: TurnstileAction,
  event: FrameEvent
): FrameMessage {
  return {
    protocol: TURNSTILE_FRAME_PROTOCOL,
    version: TURNSTILE_FRAME_VERSION,
    action,
    ...event,
  }
}

export function parseFrameMessage(
  data: unknown,
  action: TurnstileAction
): FrameEvent | null {
  if (!isOurs(data) || data.action !== action) return null
  const base = ['protocol', 'version', 'action', 'type']
  switch (data.type) {
    case 'ready':
    case 'expired':
    case 'timeout':
      return hasExactly(data, base) ? { type: data.type } : null
    case 'token':
      return hasExactly(data, [...base, 'token']) && isToken(data.token)
        ? { type: 'token', token: data.token }
        : null
    case 'error':
      return hasExactly(data, [...base, 'reason']) &&
        (data.reason === 'script' || data.reason === 'check')
        ? { type: 'error', reason: data.reason }
        : null
    default:
      return null
  }
}

export const initMessage = (): AppMessage => ({
  protocol: TURNSTILE_FRAME_PROTOCOL,
  version: TURNSTILE_FRAME_VERSION,
  type: 'init',
})

export function isInitMessage(data: unknown): data is AppMessage {
  return (
    isOurs(data) &&
    data.type === 'init' &&
    hasExactly(data, ['protocol', 'version', 'type'])
  )
}

export type FrameParams = { siteKey: string; action: TurnstileAction }

export function frameUrl(origin: string, params: FrameParams): string {
  const query = new URLSearchParams({
    sitekey: params.siteKey,
    action: params.action,
  })
  return `${origin}/?${query.toString()}`
}

export function parseFrameParams(search: string): FrameParams | null {
  const query = new URLSearchParams(search)
  const siteKey = query.get('sitekey')
  const action = query.get('action')
  if (!isSiteKey(siteKey) || !isAction(action)) return null
  return { siteKey, action }
}
