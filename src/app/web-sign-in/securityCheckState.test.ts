import { describe, expect, it } from 'vitest'
import {
  initialSecurityCheck,
  securityCheckReducer as step,
  type SecurityCheckState,
} from './securityCheckState'

const run = (...events: Parameters<typeof step>[1][]): SecurityCheckState =>
  events.reduce(step, initialSecurityCheck)

describe('the security check', () => {
  it('shows loading until the frame’s first message, not its page load', () => {
    expect(initialSecurityCheck).toEqual({ status: 'loading', attempt: 0 })
    expect(run({ type: 'ready' })).toEqual({ status: 'ready', attempt: 0 })
    expect(run({ type: 'token' }).status).toBe('ready')
  })

  it('shows the app’s own error with Try Again when the check fails or times out', () => {
    for (const reason of ['check', 'timeout'] as const) {
      const failed = run({ type: 'ready' }, { type: 'failed', reason })
      expect(failed).toEqual({ status: 'failed', failure: 'check', attempt: 0 })
    }
  })

  it('says the check couldn’t load when the frame never came up', () => {
    expect(run({ type: 'failed', reason: 'script' })).toEqual({
      status: 'failed',
      failure: 'load',
      attempt: 0,
    })
  })

  it('draws a new check on Try Again', () => {
    const retried = run({ type: 'failed', reason: 'check' }, { type: 'retry' })
    expect(retried).toEqual({ status: 'loading', attempt: 1 })
    expect(
      run({ type: 'failed', reason: 'script' }, { type: 'retry' })
    ).toEqual({ status: 'loading', attempt: 1 })
  })

  it('runs the check again when its token expires', () => {
    expect(run({ type: 'token' }, { type: 'expired' })).toEqual({
      status: 'loading',
      attempt: 1,
    })
  })

  it('clears a failure once the widget solves after all', () => {
    expect(run({ type: 'failed', reason: 'check' }, { type: 'token' })).toEqual(
      {
        status: 'ready',
        attempt: 0,
      }
    )
  })

  it('waits for the new frame after a used token resets it', () => {
    expect(run({ type: 'token' }, { type: 'reset' })).toEqual({
      status: 'loading',
      attempt: 0,
    })
  })
})
