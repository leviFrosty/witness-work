export type SecurityCheckState =
  | { status: 'loading' | 'ready'; attempt: number }
  | {
      status: 'failed'

      failure: 'check' | 'load'
      attempt: number
    }

export type SecurityCheckEvent =
  | { type: 'ready' }
  | { type: 'token' }
  | { type: 'expired' }
  | { type: 'failed'; reason: 'check' | 'timeout' | 'script' }
  | { type: 'retry' }
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

    case 'expired':
    case 'retry':
      return { status: 'loading', attempt: attempt + 1 }
    case 'reset':
      return { status: 'loading', attempt }
  }
}
