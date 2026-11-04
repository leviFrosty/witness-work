// The messages between the web app and its Turnstile frame (ADR 0037 §5,
// docs/web-turnstile.md). The frame (`web/verify-frame`) runs Cloudflare
// Turnstile on an origin of its own, so Cloudflare's script never runs in the
// app's realm. The app names the site key and the action in the frame's URL;
// the frame answers with the token and what happened to the check, nothing
// else.
//
// Both sides import this file, so it imports nothing.

/** Tells these messages apart from anything else a page posts. */
export const TURNSTILE_FRAME_PROTOCOL = 'ww-turnstile'
/**
 * Bumped only for a change one side can't ignore. The frame deploys apart from
 * the app, so it answers every version a live app may send before the app moves
 * to a new one.
 */
export const TURNSTILE_FRAME_VERSION = 1

/** The checks ww-api verifies (docs/passkeys-protocol.md, "Web sign-up"). */
export const TURNSTILE_ACTIONS = ['web-signup', 'web-recovery'] as const
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[number]

/** Cloudflare's cap on a token; ww-api refuses a longer one. */
export const MAX_TOKEN_LENGTH = 2048

/** Why a check stopped: the script didn't load, or the check failed. */
export type TurnstileErrorReason = 'script' | 'check'

/** What the frame tells the app. */
export type FrameEvent =
  /** The widget rendered. */
  | { type: 'ready' }
  | { type: 'token'; token: string }
  /** The last token expired unused. */
  | { type: 'expired' }
  /** The challenge timed out before the User finished it. */
  | { type: 'timeout' }
  | { type: 'error'; reason: TurnstileErrorReason }

type Envelope = { protocol: string; version: number }

/** A frame message on the wire: the event, and the action it was for. */
export type FrameMessage = Envelope & { action: TurnstileAction } & FrameEvent

/** A `message` event, as either side reads it. */
export type IncomingMessage = { origin: string; source: unknown; data: unknown }

/** The app's one message: it framed this page, from its origin. */
export type AppMessage = Envelope & { type: 'init' }

const isAction = (value: unknown): value is TurnstileAction =>
  typeof value === 'string' &&
  (TURNSTILE_ACTIONS as readonly string[]).includes(value)

/** A site key: Cloudflare's are short and URL-safe (`0x4AAA…`, `1x00…AA`). */
export const isSiteKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(value)

/** A token: printable ASCII, no spaces, at most `MAX_TOKEN_LENGTH`. */
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

/**
 * The event in a frame message for `action`, or null for anything else: another
 * protocol or version, another action, an extra field, a token that isn't one.
 */
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

/** The frame's URL for one check: its page, the site key and the action. */
export function frameUrl(origin: string, params: FrameParams): string {
  const query = new URLSearchParams({
    sitekey: params.siteKey,
    action: params.action,
  })
  return `${origin}/?${query.toString()}`
}

/** The frame's own reading of its URL; null unless both are valid. */
export function parseFrameParams(search: string): FrameParams | null {
  const query = new URLSearchParams(search)
  const siteKey = query.get('sitekey')
  const action = query.get('action')
  if (!isSiteKey(siteKey) || !isAction(action)) return null
  return { siteKey, action }
}
