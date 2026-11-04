/**
 * What the web's security check shows (`SecurityCheck`, docs/web-turnstile.md):
 * loading until the Turnstile frame's first message, the widget, or the app's
 * own error with Try Again. `attempt` keys the frame: a new one draws a new
 * check.
 */
export type SecurityCheckState =
  | { status: 'loading' | 'ready'; attempt: number }
  | {
      status: 'failed'
      /** `check`: the widget refused or timed out. `load`: it never came up. */
      failure: 'check' | 'load'
      attempt: number
    }

export type SecurityCheckEvent =
  /** The frame's first `ready`. */
  | { type: 'ready' }
  /** A token arrived. */
  | { type: 'token' }
  | { type: 'expired' }
  | { type: 'failed'; reason: 'check' | 'timeout' | 'script' }
  /** Try Again. */
  | { type: 'retry' }
  /** A used token reset the frame (`resetKey`). */
  | { type: 'reset' }

export const initialSecurityCheck: SecurityCheckState = {
  status: 'loading',
  attempt: 0,
}

export function securityCheckReducer(
  state: SecurityCheckState,
  event: SecurityCheckEvent
): SecurityCheckState {
  const { attempt } = state
  switch (event.type) {
    case 'ready':
    case 'token':
      return { status: 'ready', attempt }
    case 'failed':
      return {
        status: 'failed',
        failure: event.reason === 'script' ? 'load' : 'check',
        attempt,
      }
    // An expired token needs a new check: draw one rather than wait.
    case 'expired':
    case 'retry':
      return { status: 'loading', attempt: attempt + 1 }
    case 'reset':
      return { status: 'loading', attempt }
  }
}
